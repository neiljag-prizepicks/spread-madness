import { useEffect, useId, useRef, useState } from "react";
import type { BracketGame, GameResult, Team, User } from "../types";
import {
  computePoolOutcome,
  getOwnerDisplayForSide,
  getOwnerUserIdForSide,
} from "../lib/ats";
import type { OwnershipRow } from "../lib/ownershipMap";
import { buildTeamToUserId } from "../lib/ownershipMap";
import { getMatchupTooltipRegion } from "../lib/matchupTooltip";
import {
  feederSourceGameIdForSide,
  gameMap,
  resolveTeamId,
} from "../lib/resolveTeams";
import { isPoolSettledForGame } from "../lib/gameResult";
import {
  isOverviewLiveResult,
  viewerPoolOutcomeTone,
} from "../lib/overviewPickStatus";
import { teamAbbrev, teamSchool } from "../lib/teamLabels";

type Props = {
  game: BracketGame;
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
  /** Mock login user; omit for Google / anonymous — outcome line uses neutral styling. */
  viewerUserId?: string | null;
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
  viewerUserId = null,
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

  const ownerUidA = getOwnerUserIdForSide(
    game,
    "side_a",
    allGames,
    results,
    ownershipRows
  );
  const ownerUidB = getOwnerUserIdForSide(
    game,
    "side_b",
    allGames,
    results,
    ownershipRows
  );

  const score = (tid: string | null) =>
    tid && r?.scores?.[tid] != null ? String(r.scores[tid]) : "";

  const final = isPoolSettledForGame(r, ta, tb);
  const live = Boolean(
    ta && tb && !final && r && isOverviewLiveResult(r, ta, tb)
  );

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

  /** Bold line: covered spread (ATS), or advances / won game for edge cases. */
  const outcomeHeadline =
    final && outcome && ta && tb
      ? (() => {
          const teamToUser = buildTeamToUserId(ownershipRows);
          const oa = teamToUser.get(ta);
          const ob = teamToUser.get(tb);
          if (oa && ob && oa === ob) {
            return `${teamAbbrev(outcome.ncaaWinnerId, teamsById)} advances!`;
          }
          if (noLine) {
            return `${teamAbbrev(outcome.ncaaWinnerId, teamsById)} won the game!`;
          }
          const covered = outcome.coveredTeamId;
          const other = covered === ta ? tb : ta;
          return `${teamAbbrev(covered, teamsById)} covered the spread vs. ${teamAbbrev(other, teamsById)}!`;
        })()
      : null;

  /** Grey subtext: scoreboard winner margin (no final score sentence on bracket cards). */
  const outcomeDetailLine =
    final && outcome ? outcome.bracketMarginLine : null;

  const outcomeTone: "hit" | "miss" | "neutral" | null =
    final && outcome
      ? ta && tb
        ? viewerPoolOutcomeTone(
            viewerUserId,
            outcome.poolOwnerUserId,
            ta,
            tb,
            ownershipRows
          )
        : "neutral"
      : null;

  const Row = ({
    tid,
    side,
    owner,
    ownerUserId,
  }: {
    tid: string | null;
    side: "side_a" | "side_b";
    owner: string;
    ownerUserId: string | null;
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

    const viewerOwnsRow =
      Boolean(viewerUserId && ownerUserId && viewerUserId === ownerUserId);

    return (
      <>
        <span className="matchup-seed">{seed}</span>
        <div
          className={`matchup-logo${viewerOwnsRow ? " matchup-logo--viewer" : ""}`}
          title={school}
          aria-hidden
        >
          {abbr}
        </div>
        <div className="matchup-main">
          <div className="matchup-name-row">
            <span
              className={`matchup-name${pending ? " matchup-name--pending" : ""}`}
            >
              {school}
            </span>
          </div>
          <div
            className={`matchup-owner${viewerOwnsRow ? " matchup-owner--viewer" : ""}`}
          >
            {owner}
          </div>
        </div>
        <span className="matchup-spread">{noLine ? "—" : spread}</span>
        <span className="matchup-score">{score(tid)}</span>
      </>
    );
  };

  const hasOutcomeBlock = Boolean(final && outcome);

  const poolOutcomeClass =
    !live && final && outcome && outcomeTone
      ? outcomeTone === "hit"
        ? " matchup--pool-hit"
        : outcomeTone === "miss"
          ? " matchup--pool-miss"
          : " matchup--pool-neutral"
      : "";

  const tipLabel =
    !final && !live && game.scheduled_tip_utc
      ? new Date(game.scheduled_tip_utc).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

  return (
    <div
      data-game-id={game.id}
      className={`matchup${live ? " matchup--live" : ""}${hasOutcomeBlock ? " matchup--final" : ""}${poolOutcomeClass}`}
    >
      <div className="matchup-top">
        <div className="matchup-top-meta">
          {noLine && (
            <div className="matchup-top-line matchup-no-line">
              Spread not set yet
            </div>
          )}
          {final && (
            <div className="matchup-top-line matchup-status">Final</div>
          )}
          {!final && live && (
            <div className="matchup-top-line matchup-status matchup-status-live">
              <span className="matchup-live-label">Live</span>
              {r?.clock ? (
                <span className="matchup-clock">{r.clock}</span>
              ) : null}
            </div>
          )}
          {tipLabel && (
            <div className="matchup-top-line matchup-status matchup-status-tip">
              {tipLabel}
            </div>
          )}
        </div>
        <div className="matchup-top-actions">
          <GameIdInfo game={game} allGames={allGames} result={r} />
        </div>
      </div>
      <div className="matchup-body">
        <div className="matchup-rows" role="presentation">
          <Row tid={ta} side="side_a" owner={ownerA} ownerUserId={ownerUidA} />
          <Row tid={tb} side="side_b" owner={ownerB} ownerUserId={ownerUidB} />
        </div>
        {final && outcome && (
          <div className="matchup-outcome">
            {outcomeHeadline && (
              <span className="matchup-margin matchup-margin--headline">
                {outcomeHeadline}
              </span>
            )}
            {outcomeDetailLine && (
              <p className="matchup-message">{outcomeDetailLine}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
