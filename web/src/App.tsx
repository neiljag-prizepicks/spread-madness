import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import {
  Link,
  matchPath,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import type {
  BracketGame,
  GameResult,
  GameScheduleLineOverlayPatch,
  Team,
  User,
} from "./types";
import {
  readStoredActiveGroupId,
  writeStoredActiveGroupId,
} from "./lib/activeGroupStorage";
import { auth, db, isFirebaseConfigured } from "./lib/firebase";
import { normalizeResultsFileObject } from "./lib/gameResult";
import {
  firstLastFromMemberDoc,
  subscribeGroupDocument,
  subscribeGroupMembers,
  subscribeGroupOwnership,
  subscribeUserGroups,
  type GroupDoc,
  type MemberDocWithLegacy,
  type UserGroupLinkDoc,
} from "./lib/firestore/groupsApi";
import { tryCommitAutoAssignWhenFull } from "./lib/autoAssignWhenFull";
import {
  assignablePhysicalTeamRowCount,
  assignableTeamIdsSet,
  buildAssignmentOwnershipUnits,
  filterOwnershipRowsForSurvivorPools,
  shouldRestrictToSurvivingTeams,
} from "./lib/assignableTeams";
import { PHYSICAL_TEAM_ID_COUNT } from "./lib/groupConstants";
import {
  groupAssignPath,
  groupBracketPath,
  groupLeaderboardPath,
  groupMyTeamsPath,
  groupMyTeamsUserPath,
  groupSettingsPath,
} from "./lib/groupPaths";
import { applyScheduleLineOverlayToGames } from "./lib/mergeGameOverlay";
import type { OwnershipRow } from "./lib/ownershipMap";
import {
  KalshiBracketArena,
  type KalshiBracketArenaProps,
} from "./components/KalshiBracketArena";
import { AccountSettingsPage } from "./components/AccountSettingsPage";
import { GroupAssignmentPage } from "./components/GroupAssignmentPage";
import { GroupHubPage } from "./components/GroupHubPage";
import { GroupLeagueSettingsPage } from "./components/GroupLeagueSettingsPage";
import { LeaderboardPage } from "./components/LeaderboardPage";
import { MyTeamsPage } from "./components/MyTeamsPage";
import { PoolRulesPage } from "./components/PoolRulesPage";
import { normalizeUserRow } from "./lib/normalizeUserRow";
import { userInitialsFromUser } from "./lib/userInitials";
import {
  DEFAULT_PRIZE_START_ROUND,
  parsePrizeStartRound,
} from "./lib/prizeStartRound";
import { POOL_RULES_PAGE_TITLE } from "./content/poolRulesCopy";

const ACCOUNT_SETTINGS_PAGE_TITLE = "Account settings";
import { useMediaQuery } from "./hooks/useMediaQuery";
import "./App.css";

/** Mobile brand line matches this reference length (see SpreadMadnessBrandMenu). */
const MOBILE_BRAND_MAX_CHARS = "Spread Madness Home".length;

/** Gate for mock / internal demo user picker on the login screen (not for production secrets). */
const DEMO_MOCK_ACCESS_PASSWORD = "Bracketology2026";
const DEMO_MOCK_UNLOCK_STORAGE_KEY = "spread_madness_demo_mock_unlocked";

type Session =
  | { kind: "mock"; userId: string; label: string }
  | { kind: "google"; label: string; uid?: string };

function decodeJwtPayload(credential: string): { email?: string; name?: string } {
  try {
    const payload = credential.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { email?: string; name?: string };
  } catch {
    return {};
  }
}

/** Old `/group/:id/assign` → `/group/:id/settings/assign` */
function LegacyGroupAssignToSettingsAssignRedirect() {
  const { groupId } = useParams<{ groupId: string }>();
  return <Navigate to={groupAssignPath(groupId ?? "")} replace />;
}

function UserAccountMenu({
  displayName,
  onSignOut,
  showRulesLink = true,
  showAccountLink = false,
  avatarOnly = false,
  avatarInitials,
}: {
  displayName: string;
  onSignOut: () => void;
  showRulesLink?: boolean;
  showAccountLink?: boolean;
  /** Groups hub Figma: initials in a ringed circle, no name row */
  avatarOnly?: boolean;
  /** Shown in the circle when `avatarOnly`; from {@link userInitialsFromUser} + session */
  avatarInitials?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerId = "app-header-account-trigger";
  const menuId = "app-header-account-menu";

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="app-header-user-menu" ref={rootRef}>
      <button
        id={triggerId}
        type="button"
        className={`app-header-user-trigger${avatarOnly ? " app-header-user-trigger--avatar-only" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={avatarOnly ? `${displayName}, account menu` : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {avatarOnly ? (
          <span className="app-header-user-initials" aria-hidden>
            {avatarInitials ?? "?"}
          </span>
        ) : (
          <>
            <span className="app-header-user-name">{displayName}</span>
            <svg
              className="app-header-user-chevron"
              viewBox="0 0 12 12"
              aria-hidden
            >
              <path
                d="M3 4.5 L6 7.5 L9 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>
      {open ? (
        <div
          id={menuId}
          className="app-header-user-dropdown"
          role="menu"
          aria-labelledby={triggerId}
        >
          {showAccountLink ? (
            <Link
              to="/account"
              className="app-header-user-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Account settings
            </Link>
          ) : null}
          {showRulesLink ? (
            <Link
              to="/rules#game-rules-h"
              className="app-header-user-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Rules
            </Link>
          ) : null}
          <button
            type="button"
            className="app-header-user-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SpreadMadnessBrandMenu({
  userGroupRows,
  activeGroupId,
  onSelectGroup,
  figmaHubStyle = false,
}: {
  userGroupRows: { id: string; data: UserGroupLinkDoc }[];
  activeGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  /** Match Figma groups hub: purple mark, MADNESS HOME, chevron in ring */
  figmaHubStyle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const triggerId = "app-header-brand-trigger";
  const menuId = "app-header-brand-menu";

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const inGroupsSection = location.pathname.startsWith("/groups");
  const groupSectionActive = (groupId: string) =>
    !inGroupsSection && activeGroupId === groupId;

  const triggerLabel = useMemo(() => {
    if (inGroupsSection) {
      return figmaHubStyle ? "MADNESS HOME" : "Spread Madness Home";
    }
    const row = activeGroupId
      ? userGroupRows.find((r) => r.id === activeGroupId)
      : undefined;
    if (row) return row.data.name;
    return "Spread Madness";
  }, [inGroupsSection, activeGroupId, userGroupRows, figmaHubStyle]);

  const isMobile = useMediaQuery("(max-width: 699px)");
  /** Purple P + ring chevron on /groups/* and /group/:id/* (Figma header nav) */
  const figmaBrandChrome = figmaHubStyle;
  const hubFigmaTitle = figmaHubStyle && inGroupsSection;
  const displayLabel = useMemo(() => {
    if (hubFigmaTitle) return "MADNESS HOME";
    if (!isMobile || triggerLabel.length <= MOBILE_BRAND_MAX_CHARS) {
      return triggerLabel;
    }
    return `${triggerLabel.slice(0, MOBILE_BRAND_MAX_CHARS - 1)}\u2026`;
  }, [hubFigmaTitle, isMobile, triggerLabel]);

  const ariaMenuLabel = hubFigmaTitle
    ? "Open menu: Madness Home and groups"
    : figmaBrandChrome
      ? `Open menu: ${triggerLabel}`
      : displayLabel !== triggerLabel
        ? triggerLabel
        : undefined;

  return (
    <div
      className={`app-header-brand-menu${figmaBrandChrome ? " app-header-brand-menu--figma-hub" : ""}`}
      ref={rootRef}
    >
      <button
        id={triggerId}
        type="button"
        className={`app-header-brand-trigger${figmaBrandChrome ? " app-header-brand-trigger--figma-hub" : " pp-brand-sm"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        title={triggerLabel}
        aria-label={ariaMenuLabel}
      >
        {figmaBrandChrome ? (
          <>
            <img
              src="/brand-picker-logomark.svg"
              alt=""
              width={32}
              height={32}
              className="app-header-brand-logomark"
              decoding="async"
            />
            <span className="app-header-brand-picker-text">
              <span
                className={`app-header-brand-title${hubFigmaTitle ? " app-header-brand-title--figma-hub" : " app-header-brand-title--figma-group"}`}
              >
                {displayLabel}
              </span>
              <span className="app-header-brand-chevron-ring">
                <svg
                  className="app-header-brand-chevron"
                  viewBox="0 0 12 12"
                  aria-hidden
                >
                  <path
                    d="M3 4.5 L6 7.5 L9 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="pp-mark">P</span>
            <span
              className={`app-header-brand-title${isMobile ? " app-header-brand-title--mobile" : ""}`}
            >
              {displayLabel}
            </span>
            <svg
              className="app-header-brand-chevron"
              viewBox="0 0 12 12"
              aria-hidden
            >
              <path
                d="M3 4.5 L6 7.5 L9 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>
      {open ? (
        <div
          id={menuId}
          className="app-header-brand-dropdown"
          role="menu"
          aria-labelledby={triggerId}
        >
          <button
            type="button"
            className={`app-header-brand-menu-item${inGroupsSection ? " app-header-brand-menu-item--active" : ""}`}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/groups/my");
            }}
          >
            {figmaHubStyle ? "MADNESS HOME" : "Spread Madness Home"}
          </button>
          {userGroupRows.length > 0 ? (
            <>
              <div
                className="app-header-brand-dropdown-sep"
                role="separator"
              />
              {userGroupRows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`app-header-brand-menu-item${groupSectionActive(r.id) ? " app-header-brand-menu-item--active" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onSelectGroup(r.id);
                    navigate(groupBracketPath(r.id), { replace: true });
                  }}
                >
                  {r.data.name}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const LIVE_POLL_MS = Number(
  import.meta.env.VITE_LIVE_POLL_MS ?? 90_000
);

type BracketLocationState = { focusGameId?: string };

function LegacyMyTeamsUserRedirect({
  activeGroupId,
}: {
  activeGroupId: string | null;
}) {
  const { userId } = useParams<{ userId: string }>();
  if (!activeGroupId || !userId) {
    return <Navigate to="/groups/my" replace />;
  }
  return (
    <Navigate to={groupMyTeamsUserPath(activeGroupId, userId)} replace />
  );
}

function RedirectMockGroupMyTeamsUser() {
  const { userId } = useParams<{ userId: string }>();
  return (
    <Navigate
      to={`/my-teams/user/${encodeURIComponent(userId ?? "")}`}
      replace
    />
  );
}

type MyTeamsRouteProps = {
  session: Session;
  games: BracketGame[];
  results: Map<string, GameResult>;
  ownership: OwnershipRow[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  /** When set (e.g. Firebase group), roster is limited to group members. */
  rosterUsers?: User[];
};

function MyTeamsRoute({
  session,
  games,
  results,
  ownership,
  teamsById,
  usersById,
  rosterUsers: rosterUsersProp,
}: MyTeamsRouteProps) {
  const navigate = useNavigate();
  const { groupId: groupIdParam, userId: userIdParam } = useParams<{
    groupId?: string;
    userId?: string;
  }>();

  const resolved = useMemo(() => {
    if (userIdParam !== undefined) {
      const u = usersById.get(userIdParam);
      if (!u) {
        return {
          viewerUserId: null as string | null,
          userNotFound: true as const,
          perspective: "self" as const,
          peerName: "",
        };
      }
      const isOwn =
        (session.kind === "mock" && session.userId === userIdParam) ||
        (session.kind === "google" && session.uid === userIdParam);
      return {
        viewerUserId: userIdParam,
        userNotFound: false as const,
        perspective: isOwn ? ("self" as const) : ("peer" as const),
        peerName: u.display_name,
      };
    }
    return {
      viewerUserId:
        session.kind === "mock" ? session.userId : session.uid ?? null,
      userNotFound: false as const,
      perspective: "self" as const,
      peerName: "",
    };
  }, [userIdParam, session, usersById]);

  const rosterUsers = useMemo(() => {
    if (rosterUsersProp?.length) {
      return [...rosterUsersProp].sort((a, b) =>
        a.display_name.localeCompare(b.display_name)
      );
    }
    return [...usersById.values()].sort((a, b) =>
      a.display_name.localeCompare(b.display_name)
    );
  }, [rosterUsersProp, usersById]);

  return (
    <MyTeamsPage
      viewerUserId={resolved.viewerUserId}
      userNotFound={resolved.userNotFound}
      perspective={resolved.perspective}
      peerName={resolved.peerName}
      games={games}
      results={results}
      ownershipRows={ownership}
      teamsById={teamsById}
      usersById={usersById}
      rosterUsers={rosterUsers}
      onSelectRosterUser={(userId) => {
        if (
          (session.kind === "mock" && session.userId === userId) ||
          (session.kind === "google" && session.uid === userId)
        ) {
          navigate(
            groupIdParam ? groupMyTeamsPath(groupIdParam) : "/my-teams"
          );
        } else {
          navigate(
            groupIdParam
              ? groupMyTeamsUserPath(groupIdParam, userId)
              : `/my-teams/user/${encodeURIComponent(userId)}`
          );
        }
      }}
      onOpenGameInBracket={(gameId) => {
        navigate(
          groupIdParam ? groupBracketPath(groupIdParam) : "/bracket",
          {
            state: { focusGameId: gameId },
          }
        );
      }}
    />
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  /** Bracket template only (no schedule/line overlay) — reapplied when live overlay updates. */
  const [gameTemplate, setGameTemplate] = useState<BracketGame[]>([]);
  const [games, setGames] = useState<BracketGame[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ownership, setOwnership] = useState<OwnershipRow[]>([]);
  const [results, setResults] = useState<Map<string, GameResult>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bracketFocusGameId, setBracketFocusGameId] = useState<string | null>(
    null
  );

  const [authReady, setAuthReady] = useState(() => !isFirebaseConfigured());
  const [userGroupRows, setUserGroupRows] = useState<
    { id: string; data: UserGroupLinkDoc }[]
  >([]);
  /** False until Firestore returns the first snapshot (empty [] is valid; "not yet loaded" is not). */
  const [userGroupsLoaded, setUserGroupsLoaded] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() =>
    readStoredActiveGroupId()
  );
  const [firestoreOwnership, setFirestoreOwnership] = useState<
    OwnershipRow[]
  >([]);
  const [memberUsers, setMemberUsers] = useState<Map<string, User>>(new Map());
  const [activeGroupDoc, setActiveGroupDoc] = useState<GroupDoc | null>(null);

  const mockSelectRef = useRef<HTMLSelectElement>(null);
  const demoPasswordMeasureRef = useRef<HTMLInputElement>(null);
  const loginCardRef = useRef<HTMLDivElement>(null);
  const [demoMockUnlocked, setDemoMockUnlocked] = useState(() => {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(DEMO_MOCK_UNLOCK_STORAGE_KEY) === "1";
  });
  const [showDemoPasswordPanel, setShowDemoPasswordPanel] = useState(false);
  const [demoPasswordDraft, setDemoPasswordDraft] = useState("");
  const [demoPasswordError, setDemoPasswordError] = useState(false);
  const [demoPasswordVisible, setDemoPasswordVisible] = useState(false);
  const [googleLoginWidth, setGoogleLoginWidth] = useState(() => {
    if (typeof window === "undefined") return 280;
    return Math.min(400, Math.max(200, window.innerWidth - 120));
  });

  /**
   * GSI `width` is in px (max 400). Match the mock `<select>` only — not the full card/row —
   * so the Google button aligns with the dropdown on all breakpoints.
   */
  useLayoutEffect(() => {
    if (session !== null) return;
    const selectEl = mockSelectRef.current;
    const passwordEl = demoPasswordMeasureRef.current;
    const measureEl = demoMockUnlocked
      ? selectEl
      : showDemoPasswordPanel
        ? passwordEl
        : loginCardRef.current;
    const cardEl = loginCardRef.current;
    if (!measureEl || !cardEl) return;

    const cardContentWidth = (card: HTMLElement) => {
      const s = getComputedStyle(card);
      return (
        card.clientWidth -
        parseFloat(s.paddingLeft) -
        parseFloat(s.paddingRight)
      );
    };

    const sync = () => {
      const inner = cardContentWidth(cardEl);
      if (inner <= 0) return;
      const trackW = measureEl.getBoundingClientRect().width;
      const w = Math.min(trackW, inner, 400);
      setGoogleLoginWidth(Math.round(Math.max(200, w)));
    };

    sync();
    requestAnimationFrame(() => {
      sync();
      requestAnimationFrame(sync);
    });
    const ro = new ResizeObserver(sync);
    ro.observe(measureEl);
    ro.observe(cardEl);
    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [session, demoMockUnlocked, showDemoPasswordPanel]);

  useEffect(() => {
    if (!showDemoPasswordPanel || demoMockUnlocked) return;
    demoPasswordMeasureRef.current?.focus();
  }, [showDemoPasswordPanel, demoMockUnlocked]);

  /** Signed-out and logged-out states still matched deep URLs; normalize to `/` for a clean address bar. */
  useEffect(() => {
    if (session !== null) return;
    if (isFirebaseConfigured() && !authReady) return;
    if (location.pathname === "/") return;
    navigate("/", { replace: true });
  }, [session, authReady, location.pathname, navigate]);

  /** Apply focus from router state (e.g. My Teams → bracket) and clear state so refresh/back behave. */
  useEffect(() => {
    if (!location.pathname.endsWith("/bracket")) return;
    const focus = (location.state as BracketLocationState | null)?.focusGameId;
    if (!focus) return;
    setBracketFocusGameId(null);
    requestAnimationFrame(() => setBracketFocusGameId(focus));
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const base = "/data";
    Promise.all([
      fetch(`${base}/games_2026_march_madness.json`).then((r) => r.json()),
      fetch(`${base}/teams_2026_march_madness.json`).then((r) => r.json()),
      fetch(`${base}/users_2026_march_madness.json`).then((r) => r.json()),
      fetch(`${base}/ownership_round1.json`).then((r) => r.json()),
      fetch(`${base}/results.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
      fetch(`${base}/game_schedule_and_lines.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ])
      .then(([g, t, u, own, res, sched]) => {
        const raw = g.games ?? [];
        setGameTemplate(raw);
        const overlay =
          sched && typeof sched === "object" && !Array.isArray(sched)
            ? (sched as Record<string, GameScheduleLineOverlayPatch>)
            : {};
        setGames(applyScheduleLineOverlayToGames(raw, overlay));
        setTeams(
          Array.isArray(t)
            ? t
            : Array.isArray((t as { teams?: Team[] }).teams)
              ? (t as { teams: Team[] }).teams
              : []
        );
        setUsers(
          Array.isArray(u.users)
            ? u.users.map((row: unknown) => normalizeUserRow(row))
            : []
        );
        setOwnership(Array.isArray(own) ? own : own.ownership_round1 ?? []);
        setResults(normalizeResultsFileObject(res));
        setLoadError(null);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  /** Production / preview: poll merged live results + overlay from Vercel (see vercel.json + web/README). */
  useEffect(() => {
    if (import.meta.env.VITE_LIVE_POLL !== "1") return;
    if (!gameTemplate.length) return;

    const tick = async () => {
      try {
        const r = await fetch(`/api/live/data?ts=${Date.now()}`);
        if (!r.ok) return;
        const data = (await r.json()) as {
          results?: unknown;
          overlay?: Record<string, GameScheduleLineOverlayPatch>;
        };
        if (data.results && typeof data.results === "object")
          setResults(normalizeResultsFileObject(data.results));
        if (data.overlay && typeof data.overlay === "object")
          setGames(
            applyScheduleLineOverlayToGames(gameTemplate, data.overlay)
          );
      } catch {
        /* ignore transient failures */
      }
    };

    const id = setInterval(tick, LIVE_POLL_MS);
    void tick();
    return () => clearInterval(id);
  }, [gameTemplate]);

  useEffect(() => {
    if (!isFirebaseConfigured() || !auth) {
      setAuthReady(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setSession({
          kind: "google",
          uid: user.uid,
          label: user.displayName ?? user.email ?? "Google user",
        });
      } else {
        setSession(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db || session?.kind !== "google" || !session.uid) {
      setUserGroupRows([]);
      setUserGroupsLoaded(false);
      return;
    }
    setUserGroupsLoaded(false);
    const unsub = subscribeUserGroups(db, session.uid, (rows) => {
      setUserGroupRows(rows);
      setUserGroupsLoaded(true);
    });
    return () => unsub();
  }, [session]);

  useEffect(() => {
    if (session?.kind !== "google" || !session.uid) return;
    if (!userGroupsLoaded) return;
    if (!userGroupRows.length) {
      setActiveGroupId(null);
      writeStoredActiveGroupId(null);
      return;
    }
    const m = matchPath(
      { path: "/group/:groupId/*", end: false },
      location.pathname
    );
    const urlId = m?.params.groupId;
    if (urlId) {
      if (userGroupRows.some((r) => r.id === urlId)) {
        setActiveGroupId(urlId);
      } else {
        navigate("/groups/my", { replace: true });
      }
      return;
    }
    setActiveGroupId((prev) => {
      if (prev && userGroupRows.some((r) => r.id === prev)) return prev;
      const stored = readStoredActiveGroupId();
      if (stored && userGroupRows.some((r) => r.id === stored)) return stored;
      return userGroupRows[0].id;
    });
  }, [session, userGroupsLoaded, userGroupRows, location.pathname, navigate]);

  useEffect(() => {
    if (session?.kind !== "google") return;
    writeStoredActiveGroupId(activeGroupId);
  }, [activeGroupId, session?.kind]);

  useEffect(() => {
    if (!db || !activeGroupId || session?.kind !== "google") {
      setFirestoreOwnership([]);
      return;
    }
    const unsub = subscribeGroupOwnership(db, activeGroupId, setFirestoreOwnership);
    return () => unsub();
  }, [db, activeGroupId, session?.kind]);

  useEffect(() => {
    if (!db || !activeGroupId || session?.kind !== "google") {
      setMemberUsers(new Map());
      return;
    }
    const unsub = subscribeGroupMembers(
      db,
      activeGroupId,
      (rows) => {
        const m = new Map<string, User>();
        for (const r of rows) {
          const d = r.data as MemberDocWithLegacy;
          const { first_name, last_name } = firstLastFromMemberDoc(d);
          m.set(r.uid, {
            id: r.uid,
            display_name: d.displayName,
            first_name,
            last_name,
          });
        }
        setMemberUsers(m);
      }
    );
    return () => unsub();
  }, [db, activeGroupId, session?.kind]);

  useEffect(() => {
    if (!db || !activeGroupId || session?.kind !== "google") {
      setActiveGroupDoc(null);
      return;
    }
    const unsub = subscribeGroupDocument(db, activeGroupId, setActiveGroupDoc);
    return () => {
      unsub();
      setActiveGroupDoc(null);
    };
  }, [db, activeGroupId, session?.kind]);

  const firebaseGroupMode =
    isFirebaseConfigured() &&
    session?.kind === "google" &&
    Boolean(session.uid);

  const bracketPrivateInvite = useMemo(() => {
    if (!firebaseGroupMode || !activeGroupDoc) return null;
    if (activeGroupDoc.visibility !== "private") return null;
    if (activeGroupDoc.memberCount >= activeGroupDoc.maxMembers) return null;
    return {
      joinCode: activeGroupDoc.joinCode?.trim() || "—",
      password: activeGroupDoc.joinPassword || "—",
    };
  }, [firebaseGroupMode, activeGroupDoc]);

  const bracketPrizeStartRound = useMemo(() => {
    if (firebaseGroupMode && activeGroupDoc?.visibility === "private") {
      return parsePrizeStartRound(activeGroupDoc.prizeStartRound);
    }
    return DEFAULT_PRIZE_START_ROUND;
  }, [firebaseGroupMode, activeGroupDoc]);

  useEffect(() => {
    if (!firebaseGroupMode || !userGroupsLoaded || userGroupRows.length > 0)
      return;
    const p = location.pathname;
    if (
      p === "/groups" ||
      p === "/rules" ||
      p === "/account" ||
      p.startsWith("/groups/")
    )
      return;
    if (
      p.startsWith("/bracket") ||
      p.startsWith("/my-teams") ||
      p.startsWith("/leaderboard") ||
      p.startsWith("/group/")
    ) {
      navigate("/groups/my", { replace: true });
    }
  }, [
    firebaseGroupMode,
    userGroupsLoaded,
    userGroupRows.length,
    location.pathname,
    navigate,
  ]);

  const teamsById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams]
  );
  const allTeamIds = useMemo(
    () => [...teams.map((t) => t.id)].sort(),
    [teams]
  );
  const usersById = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users]
  );

  const mergedUsersById = useMemo(() => {
    const m = new Map(usersById);
    for (const [id, u] of memberUsers) m.set(id, u);
    return m;
  }, [usersById, memberUsers]);

  const headerViewerUser = useMemo(() => {
    if (!session) return undefined;
    if (session.kind === "mock") {
      return mergedUsersById.get(session.userId);
    }
    if (session.kind === "google" && session.uid) {
      return mergedUsersById.get(session.uid);
    }
    return undefined;
  }, [session, mergedUsersById]);

  const headerAvatarInitials = useMemo(() => {
    if (!session) return "?";
    return userInitialsFromUser(headerViewerUser, session.label) || "?";
  }, [headerViewerUser, session]);

  const effectiveOwnership = useMemo(() => {
    let rows: OwnershipRow[];
    if (session?.kind === "mock") {
      rows = ownership;
    } else if (
      session?.kind === "google" &&
      isFirebaseConfigured() &&
      session.uid &&
      activeGroupId
    ) {
      rows = firestoreOwnership;
    } else {
      rows = ownership;
    }

    if (
      session?.kind === "google" &&
      activeGroupDoc &&
      games.length > 0 &&
      allTeamIds.length > 0
    ) {
      const restrict = shouldRestrictToSurvivingTeams(
        activeGroupDoc.visibility,
        activeGroupDoc.allowAssignEliminatedTeams
      );
      rows = filterOwnershipRowsForSurvivorPools(
        rows,
        allTeamIds,
        games,
        results,
        restrict
      );
    }
    return rows;
  }, [
    session,
    ownership,
    firestoreOwnership,
    activeGroupId,
    activeGroupDoc,
    games,
    allTeamIds,
    results,
  ]);

  const groupTeamsUnassigned = useMemo(() => {
    if (!firebaseGroupMode || !activeGroupId) return null;

    const restrict = activeGroupDoc
      ? shouldRestrictToSurvivingTeams(
          activeGroupDoc.visibility,
          activeGroupDoc.allowAssignEliminatedTeams
        )
      : true;
    const assignable = assignableTeamIdsSet(
      allTeamIds,
      games,
      results,
      restrict
    );
    const units = buildAssignmentOwnershipUnits(
      games,
      allTeamIds,
      teamsById,
      assignable
    );
    const needRows = assignablePhysicalTeamRowCount(units);
    if (needRows === 0 || effectiveOwnership.length >= needRows) {
      return null;
    }
    const row = userGroupRows.find((r) => r.id === activeGroupId);
    return {
      joined: memberUsers.size,
      max: row?.data.memberCap ?? memberUsers.size,
      isAdmin: row?.data.role === "admin",
      assignPath: groupAssignPath(activeGroupId),
      privateInvite: bracketPrivateInvite ?? undefined,
    };
  }, [
    firebaseGroupMode,
    activeGroupId,
    effectiveOwnership.length,
    userGroupRows,
    memberUsers,
    bracketPrivateInvite,
    activeGroupDoc,
    allTeamIds,
    games,
    results,
    teamsById,
  ]);

  const leaderboardUsers = useMemo(() => {
    if (
      session?.kind === "google" &&
      isFirebaseConfigured() &&
      memberUsers.size > 0
    ) {
      return [...memberUsers.values()].sort((a, b) =>
        a.display_name.localeCompare(b.display_name)
      );
    }
    return users;
  }, [session, users, memberUsers]);

  const rosterUsersForGroup = useMemo(() => {
    if (
      session?.kind === "google" &&
      isFirebaseConfigured() &&
      memberUsers.size > 0
    ) {
      return [...memberUsers.values()].sort((a, b) =>
        a.display_name.localeCompare(b.display_name)
      );
    }
    return undefined;
  }, [session, memberUsers]);

  const autoAssignAttemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!db || !activeGroupId || session?.kind !== "google" || !session.uid) {
      return;
    }
    if (!firebaseGroupMode) return;
    if (!activeGroupDoc?.autoAssignWhenFull) return;
    if (activeGroupDoc.memberCount !== activeGroupDoc.maxMembers) return;
    if (firestoreOwnership.length > 0) return;
    if (allTeamIds.length !== PHYSICAL_TEAM_ID_COUNT) return;
    if (!games.length) return;

    const row = userGroupRows.find((r) => r.id === activeGroupId);
    if (!row || row.data.role !== "admin") return;

    if (autoAssignAttemptedRef.current.has(activeGroupId)) return;
    autoAssignAttemptedRef.current.add(activeGroupId);

    void (async () => {
      const result = await tryCommitAutoAssignWhenFull(
        db,
        activeGroupId,
        session.uid!,
        games,
        allTeamIds,
        teamsById,
        results
      );
      if (!result.ok) {
        autoAssignAttemptedRef.current.delete(activeGroupId);
      }
    })();
  }, [
    db,
    activeGroupId,
    session,
    firebaseGroupMode,
    activeGroupDoc?.autoAssignWhenFull,
    activeGroupDoc?.memberCount,
    activeGroupDoc?.maxMembers,
    firestoreOwnership.length,
    allTeamIds.length,
    games,
    teamsById,
    userGroupRows,
    results,
  ]);

  const googleClientId = String(
    import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""
  ).trim();

  const onGoogleSuccess = async (cred: CredentialResponse) => {
    if (!cred.credential) return;
    if (isFirebaseConfigured() && auth) {
      try {
        const credential = GoogleAuthProvider.credential(cred.credential);
        await signInWithCredential(auth, credential);
        navigate("/groups/my", { replace: true });
      } catch (e) {
        console.warn("Firebase sign-in failed", e);
      }
    } else {
      const p = decodeJwtPayload(cred.credential);
      setSession({
        kind: "google",
        label: p.name ?? p.email ?? "Google user",
      });
      navigate("/groups/my", { replace: true });
    }
  };

  if (loadError) {
    return (
      <div className="app-error">
        <p>Failed to load data: {loadError}</p>
      </div>
    );
  }

  if (!games.length) {
    return (
      <div className="app-loading">
        <p>Loading bracket…</p>
      </div>
    );
  }

  if (!authReady && isFirebaseConfigured()) {
    return (
      <div className="app-loading">
        <p>Checking session…</p>
      </div>
    );
  }

  const groupNavBase =
    firebaseGroupMode && activeGroupId ? activeGroupId : null;

  const myTeamsTabActive = groupNavBase
    ? Boolean(
        matchPath(
          { path: "/group/:groupId/my-teams", end: true },
          location.pathname
        ) ||
          matchPath(
            { path: "/group/:groupId/my-teams/user/:userId", end: true },
            location.pathname
          )
      )
    : location.pathname === "/my-teams" ||
      location.pathname.startsWith("/my-teams/user/");

  const isRulesPage = location.pathname === "/rules";
  const isAccountPage = location.pathname === "/account";
  const isGroupHubRoute =
    location.pathname === "/groups" ||
    location.pathname.startsWith("/groups/");
  /** True only on `/group/:id/...` — not on `/groups/*` listing (activeGroupId may still be set for Firestore). */
  const isInsideGroupAppRoute = Boolean(
    matchPath({ path: "/group/:groupId/*", end: false }, location.pathname)
  );
  /**
   * Figma top bar: same chrome on /groups/* and inside /group/:id/* —
   * MADNESS HOME + avatar on hub; group name + avatar in group (node 340:9819).
   */
  const figmaHubHeader =
    firebaseGroupMode &&
    !isRulesPage &&
    !isAccountPage &&
    (isGroupHubRoute || Boolean(groupNavBase));
  /** Dark blurred header shell + sticky tab row (hub, in-group, or rules) */
  const useGroupHubHeaderChrome =
    !isAccountPage &&
    (isRulesPage ||
      (firebaseGroupMode && (isGroupHubRoute || Boolean(groupNavBase))));
  /** Dark main background for hub + in-group (not rules) */
  const groupHubMainChrome =
    firebaseGroupMode &&
    !isAccountPage &&
    !isRulesPage &&
    (isGroupHubRoute || Boolean(groupNavBase));
  const rulesNavHash = isRulesPage ? location.hash : "";
  const rulesGameRulesTabActive =
    isRulesPage && (!rulesNavHash || rulesNavHash === "#game-rules-h");
  const rulesPrizeTabActive = isRulesPage && rulesNavHash === "#prize-structure-h";

  const attemptDemoMockUnlock = () => {
    if (demoPasswordDraft === DEMO_MOCK_ACCESS_PASSWORD) {
      try {
        sessionStorage.setItem(DEMO_MOCK_UNLOCK_STORAGE_KEY, "1");
      } catch {
        /* ignore quota / private mode */
      }
      setDemoMockUnlocked(true);
      setDemoPasswordError(false);
      setDemoPasswordDraft("");
      setDemoPasswordVisible(false);
    } else {
      setDemoPasswordError(true);
    }
  };

  if (!session) {
    return (
      <div className="login-screen">
        <div ref={loginCardRef} className="login-card">
          <h1 className="sr-only">Spread Madness</h1>
          <div className="pp-brand login-brand-lockup" aria-hidden>
            <img
              src="/brand-picker-logomark.svg"
              alt=""
              width={32}
              height={32}
              className="login-brand-logomark"
              decoding="async"
            />
            <span className="login-brand-wordmark">SPREAD MADNESS</span>
          </div>

          {googleClientId && (
            <div className="login-section login-section--first">
              <h2 className="sr-only">Sign in with Google</h2>
              {/*
                Figma 345:9663: purple pill + centered label. GSI iframe cannot be styled to brand purple;
                we paint the surface + label underneath and keep the official iframe on top (opacity 0) for clicks.
              */}
              <div className="login-google-button-stack">
                <div className="login-google-button-surface" aria-hidden />
                <span className="login-google-button-label" aria-hidden>
                  Sign in with Google
                </span>
                <GoogleLogin
                  onSuccess={onGoogleSuccess}
                  onError={() => console.warn("Google login failed")}
                  useOneTap={false}
                  use_fedcm_for_button={false}
                  width={googleLoginWidth}
                  type="standard"
                  theme="filled_blue"
                  size="large"
                  text="signin_with"
                  shape="pill"
                  logo_alignment="center"
                  containerProps={{
                    className: "login-google-button-gsi",
                    /* Hide entire GSI output from frame 1 — iframe-only opacity can flash blue before paint. */
                    style: {
                      width: "100%",
                      height: 48,
                      minHeight: 48,
                      opacity: 0,
                    },
                  }}
                />
              </div>
            </div>
          )}

          <div
            className={`login-section${googleClientId ? "" : " login-section--first"}`}
          >
            <h2 className="login-section-title">Mock login (internal demo)</h2>
            {!demoMockUnlocked ? (
              <div className="login-mock-login-stack">
                {googleClientId ? (
                  <p className="login-google-account-notice">
                    PrizePicks emails currently do not work with Google Sign-In.
                    Please use a personal Google account.
                  </p>
                ) : null}
                <p className="login-demo-gate-copy">
                  <span className="login-demo-gate-lead">
                    Looking for the Mock Login?{" "}
                  </span>
                  <button
                    type="button"
                    className="login-enter-password-trigger"
                    onClick={() => setShowDemoPasswordPanel(true)}
                  >
                    Enter Password
                  </button>
                </p>
                {showDemoPasswordPanel ? (
                  <div className="login-demo-password-panel">
                    <div className="login-demo-password-field-block">
                      <label className="login-demo-password-label" htmlFor="demo-mock-password">
                        Demo password
                      </label>
                      <div className="login-password-field-shell">
                        <input
                          ref={demoPasswordMeasureRef}
                          id="demo-mock-password"
                          type={demoPasswordVisible ? "text" : "password"}
                          name="demo-mock-password"
                          autoComplete="off"
                          className="login-demo-password-input"
                          placeholder="password"
                          value={demoPasswordDraft}
                          aria-invalid={demoPasswordError}
                          onChange={(e) => {
                            setDemoPasswordDraft(e.target.value);
                            if (demoPasswordError) setDemoPasswordError(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              attemptDemoMockUnlock();
                            }
                          }}
                        />
                      <button
                        type="button"
                        className="login-password-toggle"
                        aria-label={demoPasswordVisible ? "Hide password" : "Show password"}
                        onClick={() => setDemoPasswordVisible((v) => !v)}
                      >
                        {demoPasswordVisible ? (
                          <svg
                            className="login-password-toggle-icon"
                            viewBox="0 0 24 24"
                            width={22}
                            height={22}
                            aria-hidden
                            fill="none"
                          >
                            <path
                              stroke="currentColor"
                              strokeWidth={1.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19 12 19c.769 0 1.518-.073 2.246-.212M15.5 6.5a10.053 10.053 0 00-3.5-.5C7.244 4.5 3.226 7.162 1.934 11.5c-.21.615-.21 1.23 0 1.5M3 3l18 18"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="login-password-toggle-icon"
                            viewBox="0 0 24 24"
                            width={22}
                            height={22}
                            aria-hidden
                            fill="none"
                          >
                            <path
                              stroke="currentColor"
                              strokeWidth={1.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                            />
                            <path
                              stroke="currentColor"
                              strokeWidth={1.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                    </div>
                    <div className="login-demo-password-actions">
                      <button
                        type="button"
                        className="login-demo-password-btn login-demo-password-btn--cancel"
                        onClick={() => {
                          setShowDemoPasswordPanel(false);
                          setDemoPasswordDraft("");
                          setDemoPasswordError(false);
                          setDemoPasswordVisible(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="login-demo-password-btn login-demo-password-btn--enter"
                        onClick={() => attemptDemoMockUnlock()}
                      >
                        Enter
                      </button>
                    </div>
                    {demoPasswordError ? (
                      <p className="login-demo-password-error" role="alert">
                        Incorrect password.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="login-mock-login-stack">
                {googleClientId ? (
                  <p className="login-google-account-notice">
                    PrizePicks emails currently do not work with Google Sign-In.
                    Please use a personal Google account.
                  </p>
                ) : null}
                <p className="login-demo-gate-copy">
                  <span className="login-demo-gate-lead">
                    Looking for the Mock Login?{" "}
                  </span>
                  <span className="login-demo-gate-emphasis">Enter Password</span>
                </p>
                <div className="login-demo-password-panel">
                  <div className="login-demo-password-field-block">
                    <label className="login-demo-password-label" htmlFor="mock-user">
                      Select user
                    </label>
                    <div className="login-password-field-shell login-mock-user-select-shell">
                      <select
                        ref={mockSelectRef}
                        id="mock-user"
                        className="login-mock-user-select"
                        defaultValue={users[0]?.id ?? ""}
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.display_name}
                          </option>
                        ))}
                      </select>
                      <span className="login-mock-user-select-chevron" aria-hidden>
                        <svg
                          viewBox="0 0 12 12"
                          width={16}
                          height={16}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 4.5 L6 7.5 L9 4.5" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  <div className="login-demo-password-actions">
                    <button
                      type="button"
                      className="login-demo-password-btn login-demo-password-btn--cancel"
                      onClick={() => {
                        try {
                          sessionStorage.removeItem(DEMO_MOCK_UNLOCK_STORAGE_KEY);
                        } catch {
                          /* ignore */
                        }
                        setDemoMockUnlocked(false);
                        setShowDemoPasswordPanel(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="login-demo-password-btn login-demo-password-btn--enter"
                      onClick={() => {
                        const sel = document.getElementById(
                          "mock-user"
                        ) as HTMLSelectElement | null;
                        if (!sel) return;
                        const u = users.find((x) => x.id === sel.value);
                        if (u) {
                          void (async () => {
                            if (auth) await signOut(auth);
                            setSession({
                              kind: "mock",
                              userId: u.id,
                              label: u.display_name,
                            });
                            navigate("/groups/my", { replace: true });
                          })();
                        }
                      }}
                    >
                      View user
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!googleClientId && (
            <p className="login-hint">
              Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code> to
              enable Google sign-in.
            </p>
          )}
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    if (auth) await signOut(auth);
    setSession(null);
    writeStoredActiveGroupId(null);
    navigate("/", { replace: true });
  };

  const bracketArenaProps = {
    games,
    allGames: games,
    teamsById,
    usersById: mergedUsersById,
    ownershipRows: effectiveOwnership,
    results,
    viewerUserId:
      session.kind === "mock" ? session.userId : session.uid ?? null,
    focusGameId: bracketFocusGameId,
    onFocusGameConsumed: () => setBracketFocusGameId(null),
    groupTeamsUnassigned,
    bracketPrivateInvite: groupTeamsUnassigned ? null : bracketPrivateInvite,
    prizeStartRound: bracketPrizeStartRound,
  } satisfies KalshiBracketArenaProps;

  const bracketNavPath = groupNavBase
    ? groupBracketPath(groupNavBase)
    : "/bracket";
  const myTeamsNavPath = groupNavBase
    ? groupMyTeamsPath(groupNavBase)
    : "/my-teams";
  const leaderboardNavPath = groupNavBase
    ? groupLeaderboardPath(groupNavBase)
    : "/leaderboard";
  const settingsNavPath = groupNavBase
    ? groupSettingsPath(groupNavBase)
    : "/groups/my";

  const isActiveGroupAdmin = Boolean(
    groupNavBase &&
      userGroupRows.some(
        (r) => r.id === groupNavBase && r.data.role === "admin"
      )
  );

  const isActiveGroupMember = Boolean(
    groupNavBase && userGroupRows.some((r) => r.id === groupNavBase)
  );

  const bracketTabActive = groupNavBase
    ? location.pathname === bracketNavPath
    : location.pathname === "/bracket";
  const leaderboardTabActive = groupNavBase
    ? location.pathname === leaderboardNavPath
    : location.pathname === "/leaderboard";
  const settingsTabActive = Boolean(
    groupNavBase &&
      (location.pathname === settingsNavPath ||
        (isActiveGroupAdmin &&
          location.pathname === groupAssignPath(groupNavBase)))
  );

  return (
    <div className="app">
      <header
        className={`app-header${useGroupHubHeaderChrome ? " app-header--groups-top app-header--group-hub" : ""}`}
      >
        <div
          className={`app-header-top${figmaHubHeader ? " app-header-top--figma-hub" : ""}`}
        >
          {isRulesPage ? (
            <div className="app-header-rules-lead">
              <button
                type="button"
                className="app-header-back"
                aria-label="Go back"
                onClick={() => {
                  if (typeof window !== "undefined" && window.history.length > 1) {
                    navigate(-1);
                  } else {
                    navigate(bracketNavPath);
                  }
                }}
              >
                <svg
                  className="app-header-back-icon"
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  aria-hidden
                >
                  <path
                    d="M15 18l-6-6 6-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className="app-header-rules-divider" aria-hidden />
              <h1 className="app-header-rules-title">{POOL_RULES_PAGE_TITLE}</h1>
            </div>
          ) : isAccountPage ? (
            <div className="app-header-rules-lead">
              <button
                type="button"
                className="app-header-back"
                aria-label="Go back"
                onClick={() => {
                  if (typeof window !== "undefined" && window.history.length > 1) {
                    navigate(-1);
                  } else {
                    navigate("/groups/my");
                  }
                }}
              >
                <svg
                  className="app-header-back-icon"
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  aria-hidden
                >
                  <path
                    d="M15 18l-6-6 6-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className="app-header-rules-divider" aria-hidden />
              <h1 className="app-header-rules-title">
                {ACCOUNT_SETTINGS_PAGE_TITLE}
              </h1>
            </div>
          ) : firebaseGroupMode ? (
            <SpreadMadnessBrandMenu
              figmaHubStyle={figmaHubHeader}
              userGroupRows={userGroupRows}
              activeGroupId={activeGroupId}
              onSelectGroup={(id) => {
                setActiveGroupId(id);
                writeStoredActiveGroupId(id);
              }}
            />
          ) : (
            <div className="pp-brand pp-brand-sm">
              <span className="pp-mark">P</span>
              <span>Spread Madness</span>
            </div>
          )}
          <UserAccountMenu
            avatarOnly={figmaHubHeader}
            avatarInitials={headerAvatarInitials}
            displayName={session.label}
            onSignOut={() => void handleSignOut()}
            showRulesLink={!isRulesPage}
            showAccountLink={firebaseGroupMode && !isAccountPage}
          />
        </div>
        {!isRulesPage && !isAccountPage && !isGroupHubRoute && !groupNavBase ? (
          <nav
            className="app-header-tabs"
            role="navigation"
            aria-label="App sections"
          >
            <NavLink
              to={bracketNavPath}
              role="tab"
              aria-selected={bracketTabActive}
              className={() =>
                `app-header-tab${bracketTabActive ? " app-header-tab--active" : ""}`
              }
            >
              Bracket
            </NavLink>
            <NavLink
              to={myTeamsNavPath}
              role="tab"
              aria-selected={myTeamsTabActive}
              className={() =>
                `app-header-tab${myTeamsTabActive ? " app-header-tab--active" : ""}`
              }
            >
              My Teams
            </NavLink>
            <NavLink
              to={leaderboardNavPath}
              role="tab"
              aria-selected={leaderboardTabActive}
              className={() =>
                `app-header-tab${leaderboardTabActive ? " app-header-tab--active" : ""}`
              }
            >
              Leaderboard
            </NavLink>
            {isActiveGroupMember ? (
              <NavLink
                to={settingsNavPath}
                role="tab"
                aria-selected={settingsTabActive}
                className={() =>
                  `app-header-tab${settingsTabActive ? " app-header-tab--active" : ""}`
                }
              >
                Settings
              </NavLink>
            ) : null}
          </nav>
        ) : null}
      </header>
      {isRulesPage && !isAccountPage ? (
        <nav
          className="app-header-tabs app-header-tabs--groups-hub"
          role="navigation"
          aria-label="Rules page sections"
        >
          <Link
            to="/rules#game-rules-h"
            replace
            className={`app-header-tab${rulesGameRulesTabActive ? " app-header-tab--active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              navigate("/rules#game-rules-h", { replace: true });
            }}
          >
            Game Rules
          </Link>
          <Link
            to="/rules#prize-structure-h"
            replace
            className={`app-header-tab${rulesPrizeTabActive ? " app-header-tab--active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              navigate("/rules#prize-structure-h", { replace: true });
            }}
          >
            Prize Structure
          </Link>
        </nav>
      ) : null}
      {!isRulesPage && !isAccountPage && isGroupHubRoute ? (
        <nav
          className="app-header-tabs app-header-tabs--groups-hub app-header-tabs--hub-directory"
          role="navigation"
          aria-label="Group page sections"
        >
          <NavLink
            to="/groups/my"
            className={({ isActive }) =>
              `app-header-tab${isActive ? " app-header-tab--active" : ""}`
            }
            end
          >
            My Groups
          </NavLink>
          <NavLink
            to="/groups/create"
            className={({ isActive }) =>
              `app-header-tab${isActive ? " app-header-tab--active" : ""}`
            }
          >
            Create Group
          </NavLink>
          <NavLink
            to="/groups/join"
            className={({ isActive }) =>
              `app-header-tab${isActive ? " app-header-tab--active" : ""}`
            }
          >
            Join Group
          </NavLink>
        </nav>
      ) : null}
      {!isRulesPage &&
      !isAccountPage &&
      groupNavBase &&
      isInsideGroupAppRoute ? (
        <nav
          className="app-header-tabs app-header-tabs--groups-hub app-header-tabs--group-app"
          role="navigation"
          aria-label="Group sections"
        >
          <NavLink
            to={bracketNavPath}
            role="tab"
            aria-selected={bracketTabActive}
            className={() =>
              `app-header-tab${bracketTabActive ? " app-header-tab--active" : ""}`
            }
          >
            Bracket
          </NavLink>
          <NavLink
            to={myTeamsNavPath}
            role="tab"
            aria-selected={myTeamsTabActive}
            className={() =>
              `app-header-tab${myTeamsTabActive ? " app-header-tab--active" : ""}`
            }
          >
            My Teams
          </NavLink>
          <NavLink
            to={leaderboardNavPath}
            role="tab"
            aria-selected={leaderboardTabActive}
            className={() =>
              `app-header-tab${leaderboardTabActive ? " app-header-tab--active" : ""}`
            }
          >
            Leaderboard
          </NavLink>
          {isActiveGroupMember ? (
            <NavLink
              to={settingsNavPath}
              role="tab"
              aria-selected={settingsTabActive}
              className={() =>
                `app-header-tab${settingsTabActive ? " app-header-tab--active" : ""}`
              }
            >
              Settings
            </NavLink>
          ) : null}
        </nav>
      ) : null}

      <main
        className={`bracket-main${groupHubMainChrome ? " bracket-main--group-hub" : ""}`}
      >
        <Routes>
          <Route
            path="/"
            element={
              firebaseGroupMode ? (
                <Navigate to="/groups/my" replace />
              ) : (
                <Navigate to="/bracket" replace />
              )
            }
          />
          <Route
            path="/groups"
            element={<Navigate to="/groups/my" replace />}
          />
          <Route
            path="/groups/:hubTab"
            element={
              session.kind === "google" && session.uid ? (
                <GroupHubPage
                  uid={session.uid}
                  displayName={session.label}
                  games={games}
                  teams={teams}
                  results={results}
                  usersById={mergedUsersById}
                  onEnterGroup={(id) => {
                    setActiveGroupId(id);
                    navigate(groupBracketPath(id), { replace: true });
                  }}
                />
              ) : (
                <Navigate to="/bracket" replace />
              )
            }
          />
          <Route
            path="/group/:groupId/settings/assign"
            element={
              session.kind === "google" && session.uid ? (
                <GroupAssignmentPage
                  uid={session.uid}
                  games={games}
                  allTeamIds={allTeamIds}
                  teamsById={teamsById}
                  results={results}
                />
              ) : (
                <Navigate to="/groups/my" replace />
              )
            }
          />
          <Route
            path="/group/:groupId/assign"
            element={<LegacyGroupAssignToSettingsAssignRedirect />}
          />
          <Route
            path="/group/:groupId/settings"
            element={
              session.kind === "google" && session.uid ? (
                <GroupLeagueSettingsPage uid={session.uid} />
              ) : (
                <Navigate to="/groups/my" replace />
              )
            }
          />
          <Route
            path="/group/:groupId/bracket"
            element={
              session.kind === "mock" || !firebaseGroupMode ? (
                <Navigate to="/bracket" replace />
              ) : (
                <KalshiBracketArena {...bracketArenaProps} />
              )
            }
          />
          <Route
            path="/group/:groupId/my-teams/user/:userId"
            element={
              session.kind === "mock" || !firebaseGroupMode ? (
                <RedirectMockGroupMyTeamsUser />
              ) : (
                <MyTeamsRoute
                  session={session}
                  games={games}
                  results={results}
                  ownership={effectiveOwnership}
                  teamsById={teamsById}
                  usersById={mergedUsersById}
                  rosterUsers={rosterUsersForGroup}
                />
              )
            }
          />
          <Route
            path="/group/:groupId/my-teams"
            element={
              session.kind === "mock" || !firebaseGroupMode ? (
                <Navigate to="/my-teams" replace />
              ) : (
                <MyTeamsRoute
                  session={session}
                  games={games}
                  results={results}
                  ownership={effectiveOwnership}
                  teamsById={teamsById}
                  usersById={mergedUsersById}
                  rosterUsers={rosterUsersForGroup}
                />
              )
            }
          />
          <Route
            path="/group/:groupId/leaderboard"
            element={
              session.kind === "mock" || !firebaseGroupMode ? (
                <Navigate to="/leaderboard" replace />
              ) : (
                <LeaderboardPage
                  users={leaderboardUsers}
                  games={games}
                  results={results}
                  ownershipRows={effectiveOwnership}
                  teamsById={teamsById}
                />
              )
            }
          />
          <Route
            path="/bracket"
            element={
              firebaseGroupMode ? (
                activeGroupId ? (
                  <Navigate to={groupBracketPath(activeGroupId)} replace />
                ) : (
                  <Navigate to="/groups/my" replace />
                )
              ) : (
                <KalshiBracketArena {...bracketArenaProps} />
              )
            }
          />
          <Route
            path="/my-teams/user/:userId"
            element={
              firebaseGroupMode ? (
                <LegacyMyTeamsUserRedirect activeGroupId={activeGroupId} />
              ) : (
                <MyTeamsRoute
                  session={session}
                  games={games}
                  results={results}
                  ownership={effectiveOwnership}
                  teamsById={teamsById}
                  usersById={mergedUsersById}
                  rosterUsers={rosterUsersForGroup}
                />
              )
            }
          />
          <Route
            path="/my-teams"
            element={
              firebaseGroupMode ? (
                activeGroupId ? (
                  <Navigate to={groupMyTeamsPath(activeGroupId)} replace />
                ) : (
                  <Navigate to="/groups/my" replace />
                )
              ) : (
                <MyTeamsRoute
                  session={session}
                  games={games}
                  results={results}
                  ownership={effectiveOwnership}
                  teamsById={teamsById}
                  usersById={mergedUsersById}
                  rosterUsers={rosterUsersForGroup}
                />
              )
            }
          />
          <Route
            path="/leaderboard"
            element={
              firebaseGroupMode ? (
                activeGroupId ? (
                  <Navigate to={groupLeaderboardPath(activeGroupId)} replace />
                ) : (
                  <Navigate to="/groups/my" replace />
                )
              ) : (
                <LeaderboardPage
                  users={leaderboardUsers}
                  games={games}
                  results={results}
                  ownershipRows={effectiveOwnership}
                  teamsById={teamsById}
                />
              )
            }
          />
          <Route path="/rules" element={<PoolRulesPage />} />
          <Route
            path="/account"
            element={
              session.kind === "google" &&
              session.uid &&
              auth?.currentUser ? (
                <AccountSettingsPage
                  uid={session.uid}
                  authUser={auth.currentUser}
                  onProfileUpdated={() => {
                    const u = auth?.currentUser;
                    if (!u) return;
                    void reload(u).then(() => {
                      setSession({
                        kind: "google",
                        uid: u.uid,
                        label:
                          u.displayName ?? u.email ?? "Google user",
                      });
                    });
                  }}
                  onDeleted={() => {
                    setSession(null);
                    writeStoredActiveGroupId(null);
                    navigate("/", { replace: true });
                  }}
                />
              ) : (
                <Navigate to="/groups/my" replace />
              )
            }
          />
          <Route
            path="*"
            element={
              firebaseGroupMode ? (
                <Navigate to="/groups/my" replace />
              ) : (
                <Navigate to="/bracket" replace />
              )
            }
          />
        </Routes>
      </main>
    </div>
  );
}
