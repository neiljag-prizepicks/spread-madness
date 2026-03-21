import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
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
  subscribeGroupDocument,
  subscribeGroupMembers,
  subscribeGroupOwnership,
  subscribeUserGroups,
  type GroupDoc,
  type UserGroupLinkDoc,
} from "./lib/firestore/groupsApi";
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
import { GroupAssignmentPage } from "./components/GroupAssignmentPage";
import { GroupHubPage } from "./components/GroupHubPage";
import { GroupLeagueSettingsPage } from "./components/GroupLeagueSettingsPage";
import { LeaderboardPage } from "./components/LeaderboardPage";
import { MyTeamsPage } from "./components/MyTeamsPage";
import { PoolRulesPage } from "./components/PoolRulesPage";
import { POOL_RULES_PAGE_TITLE } from "./content/poolRulesCopy";
import { useMediaQuery } from "./hooks/useMediaQuery";
import "./App.css";

/** Mobile brand line matches this reference length (see SpreadMadnessBrandMenu). */
const MOBILE_BRAND_MAX_CHARS = "Spread Madness Home".length;

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
}: {
  displayName: string;
  onSignOut: () => void;
  showRulesLink?: boolean;
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
        className="app-header-user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
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
      </button>
      {open ? (
        <div
          id={menuId}
          className="app-header-user-dropdown"
          role="menu"
          aria-labelledby={triggerId}
        >
          {showRulesLink ? (
            <Link
              to="/rules"
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
}: {
  userGroupRows: { id: string; data: UserGroupLinkDoc }[];
  activeGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
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
    if (inGroupsSection) return "Spread Madness Home";
    const row = activeGroupId
      ? userGroupRows.find((r) => r.id === activeGroupId)
      : undefined;
    if (row) return row.data.name;
    return "Spread Madness";
  }, [inGroupsSection, activeGroupId, userGroupRows]);

  const isMobile = useMediaQuery("(max-width: 699px)");
  const displayLabel = useMemo(() => {
    if (!isMobile || triggerLabel.length <= MOBILE_BRAND_MAX_CHARS) {
      return triggerLabel;
    }
    return `${triggerLabel.slice(0, MOBILE_BRAND_MAX_CHARS - 1)}\u2026`;
  }, [isMobile, triggerLabel]);

  return (
    <div className="app-header-brand-menu" ref={rootRef}>
      <button
        id={triggerId}
        type="button"
        className="app-header-brand-trigger pp-brand-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        title={triggerLabel}
        aria-label={
          displayLabel !== triggerLabel ? triggerLabel : undefined
        }
      >
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
              navigate("/groups");
            }}
          >
            Spread Madness Home
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
    return <Navigate to="/groups" replace />;
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
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() =>
    readStoredActiveGroupId()
  );
  const [firestoreOwnership, setFirestoreOwnership] = useState<
    OwnershipRow[]
  >([]);
  const [memberUsers, setMemberUsers] = useState<Map<string, User>>(new Map());
  const [activeGroupDoc, setActiveGroupDoc] = useState<GroupDoc | null>(null);

  const mockRowRef = useRef<HTMLDivElement>(null);
  const loginCardRef = useRef<HTMLDivElement>(null);
  const [googleLoginWidth, setGoogleLoginWidth] = useState(200);

  /**
   * Match GSI button width to the mock **row** (same as full-width dropdown on mobile, and
   * dropdown + “Enter league” on desktop). Measuring only the `<select>` was too narrow when
   * the button sat beside it. Clamp to card content width to avoid horizontal bleed.
   */
  useLayoutEffect(() => {
    if (session !== null) return;
    const rowEl = mockRowRef.current;
    const cardEl = loginCardRef.current;
    if (!rowEl || !cardEl) return;

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
      const rowW = rowEl.getBoundingClientRect().width;
      const w = Math.min(rowW, inner, 400);
      setGoogleLoginWidth(Math.round(Math.max(160, w)));
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(rowEl);
    ro.observe(cardEl);
    return () => ro.disconnect();
  }, [session]);

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
        setUsers((u.users ?? []) as User[]);
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
      return;
    }
    const unsub = subscribeUserGroups(db, session.uid, setUserGroupRows);
    return () => unsub();
  }, [session]);

  useEffect(() => {
    if (session?.kind !== "google" || !session.uid) return;
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
        navigate("/groups", { replace: true });
      }
      return;
    }
    setActiveGroupId((prev) => {
      if (prev && userGroupRows.some((r) => r.id === prev)) return prev;
      const stored = readStoredActiveGroupId();
      if (stored && userGroupRows.some((r) => r.id === stored)) return stored;
      return userGroupRows[0].id;
    });
  }, [session, userGroupRows, location.pathname, navigate]);

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
          m.set(r.uid, { id: r.uid, display_name: r.data.displayName });
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

  useEffect(() => {
    if (!firebaseGroupMode || userGroupRows.length > 0) return;
    const p = location.pathname;
    if (p === "/groups" || p === "/rules" || p.startsWith("/groups/")) return;
    if (
      p.startsWith("/bracket") ||
      p.startsWith("/my-teams") ||
      p.startsWith("/leaderboard") ||
      p.startsWith("/group/")
    ) {
      navigate("/groups", { replace: true });
    }
  }, [firebaseGroupMode, userGroupRows.length, location.pathname, navigate]);

  const teamsById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
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

  const effectiveOwnership = useMemo(() => {
    if (session?.kind === "mock") return ownership;
    if (
      session?.kind === "google" &&
      isFirebaseConfigured() &&
      session.uid &&
      activeGroupId
    ) {
      return firestoreOwnership;
    }
    return ownership;
  }, [session, ownership, firestoreOwnership, activeGroupId]);

  const groupTeamsUnassigned = useMemo(() => {
    if (
      !firebaseGroupMode ||
      !activeGroupId ||
      effectiveOwnership.length >= PHYSICAL_TEAM_ID_COUNT
    ) {
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
    effectiveOwnership,
    userGroupRows,
    memberUsers,
    bracketPrivateInvite,
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

  const allTeamIds = useMemo(
    () => [...teams.map((t) => t.id)].sort(),
    [teams]
  );

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

  const onGoogleSuccess = async (cred: CredentialResponse) => {
    if (!cred.credential) return;
    if (isFirebaseConfigured() && auth) {
      try {
        const credential = GoogleAuthProvider.credential(cred.credential);
        await signInWithCredential(auth, credential);
        navigate("/groups", { replace: true });
      } catch (e) {
        console.warn("Firebase sign-in failed", e);
      }
    } else {
      const p = decodeJwtPayload(cred.credential);
      setSession({
        kind: "google",
        label: p.name ?? p.email ?? "Google user",
      });
      navigate("/groups", { replace: true });
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
  const isGroupsHome = location.pathname === "/groups";
  const groupsNavHash = isGroupsHome ? location.hash : "";

  if (!session) {
    return (
      <div className="login-screen">
        <div ref={loginCardRef} className="login-card">
          <h1 className="sr-only">Spread Madness</h1>
          <div className="pp-brand">
            <span className="pp-mark">P</span>
            <span>Spread Madness</span>
          </div>
          <p className="login-sub">POC — March Madness group (ATS)</p>

          <div className="login-section">
            <h2>Mock login (internal demo)</h2>
            <div ref={mockRowRef} className="mock-row">
              <select
                id="mock-user"
                className="mock-select"
                defaultValue="1"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const sel = document.getElementById(
                    "mock-user"
                  ) as HTMLSelectElement;
                  const u = users.find((x) => x.id === sel.value);
                  if (u) {
                    void (async () => {
                      if (auth) await signOut(auth);
                      setSession({
                        kind: "mock",
                        userId: u.id,
                        label: u.display_name,
                      });
                      navigate("/groups", { replace: true });
                    })();
                  }
                }}
              >
                Enter league
              </button>
            </div>
          </div>

          {googleClientId && (
            <div className="login-section">
              <h2>Google</h2>
              <div className="login-google-button-host">
                <GoogleLogin
                  onSuccess={onGoogleSuccess}
                  onError={() => console.warn("Google login failed")}
                  useOneTap={false}
                  width={googleLoginWidth}
                />
              </div>
            </div>
          )}

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
    : "/groups";

  const isActiveGroupAdmin = Boolean(
    groupNavBase &&
      userGroupRows.some(
        (r) => r.id === groupNavBase && r.data.role === "admin"
      )
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
        location.pathname === groupAssignPath(groupNavBase))
  );

  return (
    <div className="app">
      <header
        className={`app-header${isGroupsHome && !isRulesPage ? " app-header--groups-top" : ""}`}
      >
        <div className="app-header-top">
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
          ) : firebaseGroupMode ? (
            <SpreadMadnessBrandMenu
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
            displayName={session.label}
            onSignOut={() => void handleSignOut()}
            showRulesLink={!isRulesPage}
          />
        </div>
        {!isRulesPage && !isGroupsHome ? (
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
            {isActiveGroupAdmin ? (
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
      {!isRulesPage && isGroupsHome ? (
        <nav
          className="app-header-tabs app-header-tabs--groups-hub"
          role="navigation"
          aria-label="Group page sections"
        >
          <a
            href="#my-groups-h"
            className={`app-header-tab${groupsNavHash === "#my-groups-h" ? " app-header-tab--active" : ""}`}
          >
            My Groups
          </a>
          <a
            href="#create-h"
            className={`app-header-tab${groupsNavHash === "#create-h" ? " app-header-tab--active" : ""}`}
          >
            Create Group
          </a>
          <a
            href="#market-h"
            className={`app-header-tab${groupsNavHash === "#market-h" ? " app-header-tab--active" : ""}`}
          >
            Public Groups
          </a>
          <a
            href="#priv-join-h"
            className={`app-header-tab${groupsNavHash === "#priv-join-h" ? " app-header-tab--active" : ""}`}
          >
            Private Groups
          </a>
        </nav>
      ) : null}

      <main className="bracket-main">
        <Routes>
          <Route
            path="/"
            element={
              firebaseGroupMode ? (
                <Navigate to="/groups" replace />
              ) : (
                <Navigate to="/bracket" replace />
              )
            }
          />
          <Route
            path="/groups"
            element={
              session.kind === "google" && session.uid ? (
                <GroupHubPage
                  uid={session.uid}
                  displayName={session.label}
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
                />
              ) : (
                <Navigate to="/groups" replace />
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
                <Navigate to="/groups" replace />
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
                  <Navigate to="/groups" replace />
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
                  <Navigate to="/groups" replace />
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
                  <Navigate to="/groups" replace />
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
            path="*"
            element={
              firebaseGroupMode ? (
                <Navigate to="/groups" replace />
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
