import { useEffect, useId, useRef, useState } from "react";
import type { BracketGame, GameResult, Team, User } from "../types";
import { computePoolOutcome, getOwnerDisplayForSide } from "../lib/ats";
import type { OwnershipRow } from "../lib/ownershipMap";
import { getMatchupTooltipRegion } from "../lib/matchupTooltip";
import {
  feederSourceGameIdForSide,
  gameMap,
  resolveTeamId,
} from "../lib/resolveTeams";
import { isPoolSettledForGame } from "../lib/gameResult";
import { teamAbbrev, teamSchool } from "../lib/teamLabels";

type Props = {
  game: BracketGame;
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
};

function spreadLabel(
  teamId: string | null,
  favId: string | null,
  spread: number | null
): string {
  if (!teamId || !favId || spread == null) return "—";
  const line = Math.abs(spread);
  if (teamId === favId) return `${spread.toFixed(1)}`;
  return `+${line.toFixed(1)}`;
}

function formatUpdatedAtLabel(iso: string | undefined | null): string | null {
  if (!iso || String(iso).trim() === "") return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function GameIdInfo({
  game,
  allGames,
  result,
}: {
  game: BracketGame;
  allGames: BracketGame[];
  result: GameResult | undefined;
}) {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { regionLabel, regionValue, advancesToGameId } =
    getMatchupTooltipRegion(game, allGames);
  const scoreUpdated = formatUpdatedAtLabel(result?.scores_updated_at);
  const spreadUpdated = formatUpdatedAtLabel(game.spread_updated_at ?? null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="matchup-info-wrap" ref={wrapRef}>
      <button
        type="button"
        className="matchup-info-btn"
        aria-label={`Game info: ${game.id}`}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="matchup-info-icon" aria-hidden>
          ⓘ
        </span>
      </button>
      {open && (
        <div
          id={tipId}
          className="matchup-game-id-tip"
          role="tooltip"
        >
          <span className="matchup-game-id-tip-label">Game id</span>
          <code className="matchup-game-id-code">{game.id}</code>
          <span className="matchup-game-id-tip-label">{regionLabel}</span>
          <span className="matchup-game-id-region">{regionValue}</span>
          {advancesToGameId && (
            <>
              <span className="matchup-game-id-tip-label">Advances to</span>
              <code className="matchup-game-id-code matchup-game-id-code--sm">
                {advancesToGameId}
              </code>
            </>
          )}
          {scoreUpdated && (
            <>
              <span className="matchup-game-id-tip-label">Score last updated</span>
              <span className="matchup-game-id-meta">{scoreUpdated}</span>
            </>
          )}
          {spreadUpdated && (
            <>
              <span className="matchup-game-id-tip-label">Spread last updated</span>
              <span className="matchup-game-id-meta">{spreadUpdated}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Matchup({
  game,
  allGames,
  teamsById,
  usersById,
  ownershipRows,
  results,
}: Props) {
  const gm = gameMap(allGames);
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  const tb = resolveTeamId(game, "side_b", gm, results, new Set());
  const r = results.get(game.id);
  const fav = game.favorite_team_id;
  const sp = game.spread_from_favorite_perspective;
  const noLine = fav == null || sp == null;

  const dn = (uid: string) => usersById.get(uid)?.display_name ?? uid;

  const ownerA = getOwnerDisplayForSide(
    game,
    "side_a",
    allGames,
    results,
    ownershipRows,
    dn
  );
  const ownerB = getOwnerDisplayForSide(
    game,
    "side_b",
    allGames,
    results,
    ownershipRows,
    dn
  );

  const score = (tid: string | null) =>
    tid && r?.scores?.[tid] != null ? String(r.scores[tid]) : "";

  const final = isPoolSettledForGame(r, ta, tb);

  const outcome = final
    ? computePoolOutcome(
        game,
        allGames,
        results,
        ownershipRows,
        teamsById,
        dn
      )
    : null;

  /** One line: team that covered won or lost on the scoreboard, by how many. */
  const coveredSpreadLine =
    final &&
    outcome &&
    ta &&
    tb &&
    r?.scores &&
    r.scores[outcome.coveredTeamId] != null
      ? (() => {
          const covered = outcome.coveredTeamId;
          const other = covered === ta ? tb : ta;
          const cs = r.scores![covered];
          const os = r.scores![other];
          if (cs == null || os == null) return null;
          const diff = Math.abs(cs - os);
          const abbr = teamAbbrev(covered, teamsById);
          if (cs > os) return `${abbr} won by ${diff}`;
          if (cs < os) return `${abbr} lost by ${diff}`;
          return `${abbr} tie`;
        })()
      : null;

  const Row = ({
    tid,
    side,
    owner,
  }: {
    tid: string | null;
    side: "side_a" | "side_b";
    owner: string;
  }) => {
    const pendingRef = feederSourceGameIdForSide(game, side, gm);
    const t = tid ? teamsById.get(tid) : null;
    const seed = t?.seed ?? "—";
    const school =
      tid != null
        ? teamSchool(tid, teamsById)
        : pendingRef
          ? `W of ${pendingRef}`
          : "TBD";
    const pending = tid == null && pendingRef != null;
    const abbr = tid != null ? teamAbbrev(tid, teamsById) : "—";
    const spread = noLine ? "" : spreadLabel(tid, fav, sp);

    return (
      <div className="matchup-row">
        <div className="matchup-row-inner">
          <span className="matchup-seed">{seed}</span>
          <div className="matchup-logo" title={school} aria-hidden>
            {abbr}
          </div>
          <div className="matchup-main">
            <div className="matchup-name-row">
              <span
                className={`matchup-name${pending ? " matchup-name--pending" : ""}`}
              >
                {school}
              </span>
              <span className="matchup-spread">
                {noLine ? "—" : spread}
              </span>
            </div>
            <div className="matchup-owner">{owner}</div>
          </div>
        </div>
        <span className="matchup-score">{score(tid)}</span>
      </div>
    );
  };

  return (
    <div className="matchup">
      <div className="matchup-top">
        <GameIdInfo game={game} allGames={allGames} result={r} />
      </div>
      {noLine && (
        <div className="matchup-no-line">Spread not set yet</div>
      )}
      <Row tid={ta} side="side_a" owner={ownerA} />
      {final && <div className="matchup-status">Final</div>}
      {!final && r?.status === "in_progress" && (
        <div className="matchup-status matchup-status-live">
          <span className="matchup-live-label">Live</span>
          {r.clock ? (
            <span className="matchup-clock">{r.clock}</span>
          ) : null}
        </div>
      )}
      {!final &&
        r?.status !== "in_progress" &&
        game.scheduled_tip_utc && (
        <div className="matchup-status matchup-status-tip">
          {new Date(game.scheduled_tip_utc).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      )}
      <Row tid={tb} side="side_b" owner={ownerB} />
      {final && outcome && (
        <div className="matchup-outcome">
          {coveredSpreadLine && (
            <span className="matchup-margin">{coveredSpreadLine}</span>
          )}
          <p className="matchup-message">{outcome.message}</p>
        </div>
      )}
    </div>
  );
}
