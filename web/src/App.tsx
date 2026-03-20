import { useEffect, useMemo, useRef, useState } from "react";
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
import { KalshiBracketArena } from "./components/KalshiBracketArena";
import { PoolRulesPage } from "./components/PoolRulesPage";
import "./App.css";

type MainTab = "bracket" | "rules";

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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [games, setGames] = useState<BracketGame[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ownership, setOwnership] = useState<OwnershipRow[]>([]);
  const [results, setResults] = useState<Map<string, GameResult>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("bracket");

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
                  if (u)
                    setSession({
                      kind: "mock",
                      userId: u.id,
                      label: u.display_name,
                    });
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
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === "bracket"}
            className={`app-header-tab${mainTab === "bracket" ? " app-header-tab--active" : ""}`}
            onClick={() => setMainTab("bracket")}
          >
            Bracket
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === "rules"}
            className={`app-header-tab${mainTab === "rules" ? " app-header-tab--active" : ""}`}
            onClick={() => setMainTab("rules")}
          >
            Rules
          </button>
        </nav>
      </header>

      <main className="bracket-main">
        {mainTab === "bracket" ? (
          <KalshiBracketArena
            games={games}
            allGames={games}
            teamsById={teamsById}
            usersById={usersById}
            ownershipRows={ownership}
            results={results}
            viewerUserId={session.kind === "mock" ? session.userId : null}
          />
        ) : (
          <PoolRulesPage />
        )}
      </main>
    </div>
  );
}
