import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import type {
  BracketGame,
  GameResult,
  GameScheduleLineOverlayPatch,
  Team,
  User,
} from "./types";
import {
  finalGameResult,
  mergeGameResultWithScoresTime,
  normalizeResultsFileObject,
} from "./lib/gameResult";
import { applyScheduleLineOverlayToGames } from "./lib/mergeGameOverlay";
import type { OwnershipRow } from "./lib/ownershipMap";
import { KalshiBracketArena } from "./components/KalshiBracketArena";
import { ScoreModal } from "./components/ScoreModal";
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [games, setGames] = useState<BracketGame[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ownership, setOwnership] = useState<OwnershipRow[]>([]);
  const [results, setResults] = useState<Map<string, GameResult>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scoreGameId, setScoreGameId] = useState<string | null>(null);

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

  const onSaveScore = useCallback((gameId: string, scores: Record<string, number>) => {
    setResults((prev) => {
      const next = new Map(prev);
      next.set(
        gameId,
        mergeGameResultWithScoresTime(prev.get(gameId), finalGameResult(scores))
      );
      return next;
    });
  }, []);

  const scoreGame = scoreGameId
    ? games.find((g) => g.id === scoreGameId) ?? null
    : null;

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
          <div className="pp-brand">
            <span className="pp-mark">P</span>
            <span>PrizePicks</span>
          </div>
          <h1>Spread Madness</h1>
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
        <div className="pp-brand pp-brand-sm">
          <span className="pp-mark">P</span>
          <span>PrizePicks</span>
        </div>
        <span className="app-title">Spread Madness</span>
        <div className="header-right">
          <span className="session-label">{session.label}</span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setSession(null)}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="bracket-main">
        <KalshiBracketArena
          games={games}
          allGames={games}
          teamsById={teamsById}
          usersById={usersById}
          ownershipRows={ownership}
          results={results}
          onOpenScore={setScoreGameId}
          viewerUserId={session.kind === "mock" ? session.userId : null}
        />
      </main>

      <ScoreModal
        game={scoreGame}
        allGames={games}
        teamsById={teamsById}
        results={results}
        onSave={onSaveScore}
        onClose={() => setScoreGameId(null)}
      />
    </div>
  );
}
