import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import { normalizeResultsFileObject } from "./lib/gameResult";
import { applyScheduleLineOverlayToGames } from "./lib/mergeGameOverlay";
import type { OwnershipRow } from "./lib/ownershipMap";
import {
  KalshiBracketArena,
  type KalshiBracketArenaProps,
} from "./components/KalshiBracketArena";
import { LeaderboardPage } from "./components/LeaderboardPage";
import { MyTeamsPage } from "./components/MyTeamsPage";
import { PoolRulesPage } from "./components/PoolRulesPage";
import "./App.css";

type Session =
  | { kind: "mock"; userId: string; label: string }
  | { kind: "google"; label: string };

function decodeJwtPayload(credential: string): { email?: string; name?: string } {
  try {
    const payload = credential.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { email?: string; name?: string };
  } catch {
    return {};
  }
}

function UserAccountMenu({
  displayName,
  onSignOut,
}: {
  displayName: string;
  onSignOut: () => void;
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

const LIVE_POLL_MS = Number(
  import.meta.env.VITE_LIVE_POLL_MS ?? 90_000
);

type BracketLocationState = { focusGameId?: string };

type MyTeamsRouteProps = {
  session: Session;
  games: BracketGame[];
  results: Map<string, GameResult>;
  ownership: OwnershipRow[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
};

function MyTeamsRoute({
  session,
  games,
  results,
  ownership,
  teamsById,
  usersById,
}: MyTeamsRouteProps) {
  const navigate = useNavigate();
  const { userId: userIdParam } = useParams<{ userId: string }>();

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
        session.kind === "mock" && session.userId === userIdParam;
      return {
        viewerUserId: userIdParam,
        userNotFound: false as const,
        perspective: isOwn ? ("self" as const) : ("peer" as const),
        peerName: u.display_name,
      };
    }
    return {
      viewerUserId: session.kind === "mock" ? session.userId : null,
      userNotFound: false as const,
      perspective: "self" as const,
      peerName: "",
    };
  }, [userIdParam, session, usersById]);

  const rosterUsers = useMemo(
    () =>
      [...usersById.values()].sort((a, b) =>
        a.display_name.localeCompare(b.display_name)
      ),
    [usersById]
  );

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
        if (session.kind === "mock" && session.userId === userId) {
          navigate("/my-teams");
        } else {
          navigate(`/my-teams/user/${encodeURIComponent(userId)}`);
        }
      }}
      onOpenGameInBracket={(gameId) => {
        navigate("/bracket", {
          state: { focusGameId: gameId },
        });
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

  /** Apply focus from router state (e.g. My Teams → bracket) and clear state so refresh/back behave. */
  useEffect(() => {
    if (location.pathname !== "/bracket") return;
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

  const teamsById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams]
  );
  const usersById = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users]
  );

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

  const onGoogleSuccess = (cred: CredentialResponse) => {
    if (!cred.credential) return;
    const p = decodeJwtPayload(cred.credential);
    setSession({
      kind: "google",
      label: p.name ?? p.email ?? "Google user",
    });
    navigate("/bracket", { replace: true });
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

  const myTeamsTabActive =
    location.pathname === "/my-teams" ||
    location.pathname.startsWith("/my-teams/user/");

  if (!session) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="sr-only">Spread Madness</h1>
          <div className="pp-brand">
            <span className="pp-mark">P</span>
            <span>Spread Madness</span>
          </div>
          <p className="login-sub">POC — March Madness pool (ATS)</p>

          <div className="login-section">
            <h2>Mock login (internal demo)</h2>
            <div className="mock-row">
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
                    setSession({
                      kind: "mock",
                      userId: u.id,
                      label: u.display_name,
                    });
                    navigate("/bracket", { replace: true });
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
              <GoogleLogin
                onSuccess={onGoogleSuccess}
                onError={() => console.warn("Google login failed")}
                useOneTap={false}
              />
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <div className="pp-brand pp-brand-sm">
            <span className="pp-mark">P</span>
            <span>Spread Madness</span>
          </div>
          <UserAccountMenu
            displayName={session.label}
            onSignOut={() => setSession(null)}
          />
        </div>
        <nav
          className="app-header-tabs"
          role="tablist"
          aria-label="App sections"
        >
          <NavLink
            to="/bracket"
            role="tab"
            aria-selected={location.pathname === "/bracket"}
            className={({ isActive }) =>
              `app-header-tab${isActive ? " app-header-tab--active" : ""}`
            }
          >
            Bracket
          </NavLink>
          <NavLink
            to="/my-teams"
            role="tab"
            aria-selected={myTeamsTabActive}
            className={() =>
              `app-header-tab${myTeamsTabActive ? " app-header-tab--active" : ""}`
            }
          >
            My Teams
          </NavLink>
          <NavLink
            to="/leaderboard"
            role="tab"
            aria-selected={location.pathname === "/leaderboard"}
            className={({ isActive }) =>
              `app-header-tab${isActive ? " app-header-tab--active" : ""}`
            }
          >
            Leaderboard
          </NavLink>
          <NavLink
            to="/rules"
            role="tab"
            aria-selected={location.pathname === "/rules"}
            className={({ isActive }) =>
              `app-header-tab${isActive ? " app-header-tab--active" : ""}`
            }
          >
            Rules
          </NavLink>
        </nav>
      </header>

      <main className="bracket-main">
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/bracket" replace />}
          />
          <Route
            path="/bracket"
            element={
              <KalshiBracketArena
                {...({
                  games,
                  allGames: games,
                  teamsById,
                  usersById,
                  ownershipRows: ownership,
                  results,
                  viewerUserId:
                    session.kind === "mock" ? session.userId : null,
                  focusGameId: bracketFocusGameId,
                  onFocusGameConsumed: () => setBracketFocusGameId(null),
                } satisfies KalshiBracketArenaProps)}
              />
            }
          />
          <Route
            path="/my-teams/user/:userId"
            element={
              <MyTeamsRoute
                session={session}
                games={games}
                results={results}
                ownership={ownership}
                teamsById={teamsById}
                usersById={usersById}
              />
            }
          />
          <Route
            path="/my-teams"
            element={
              <MyTeamsRoute
                session={session}
                games={games}
                results={results}
                ownership={ownership}
                teamsById={teamsById}
                usersById={usersById}
              />
            }
          />
          <Route
            path="/leaderboard"
            element={
              <LeaderboardPage
                users={users}
                games={games}
                results={results}
                ownershipRows={ownership}
                teamsById={teamsById}
              />
            }
          />
          <Route path="/rules" element={<PoolRulesPage />} />
          <Route
            path="*"
            element={<Navigate to="/bracket" replace />}
          />
        </Routes>
      </main>
    </div>
  );
}
