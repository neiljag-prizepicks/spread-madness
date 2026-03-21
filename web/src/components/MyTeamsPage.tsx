import { useMemo } from "react";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { buildMyTeamsSections, type MyTeamRow } from "../lib/myTeams";

type Props = {
  viewerUserId: string | null;
  games: BracketGame[];
  results: Map<string, GameResult>;
  ownershipRows: OwnershipRow[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  onOpenGameInBracket: (gameId: string) => void;
};

function MyTeamsLiveScoreboard({ row }: { row: MyTeamRow }) {
  if (!row.nextGameLive) return null;
  if (!row.liveGameScoreLabel && !row.liveGameClock) return null;
  return (
    <div className="my-teams-live-board" aria-live="polite">
      {row.liveGameScoreLabel ? (
        <p className="my-teams-live-score">{row.liveGameScoreLabel}</p>
      ) : null}
      {row.liveGameClock ? (
        <p className="my-teams-live-clock">{row.liveGameClock}</p>
      ) : null}
    </div>
  );
}

/** Top-right hint that the whole card opens the bracket at this game. */
function MyTeamsCardBracketAffordance() {
  return (
    <div className="my-teams-card-affordance">
      <span className="my-teams-card-affordance-text">View in bracket</span>
      <svg
        className="my-teams-card-affordance-chevron"
        viewBox="0 0 10 10"
        aria-hidden
      >
        <path
          d="M3.25 2.5 L6.25 5 L3.25 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function MyTeamsPage({
  viewerUserId,
  games,
  results,
  ownershipRows,
  teamsById,
  usersById,
  onOpenGameInBracket,
}: Props) {
  const { active, changedControl, lost } = useMemo(() => {
    if (!viewerUserId) {
      return {
        active: [] as MyTeamRow[],
        changedControl: [] as MyTeamRow[],
        lost: [] as MyTeamRow[],
      };
    }
    return buildMyTeamsSections(
      viewerUserId,
      games,
      results,
      ownershipRows,
      teamsById,
      usersById
    );
  }, [viewerUserId, games, results, ownershipRows, teamsById, usersById]);

  if (!viewerUserId) {
    return (
      <div className="my-teams-page">
        <h1 className="my-teams-page-title">My Teams</h1>
        <p className="my-teams-page-lead">
          This proof-of-concept ties teams to <strong>mock league users</strong> from
          the demo login. Sign in with <strong>Mock login</strong> and pick your name
          to see the teams you control and your Round 1 picks here. Google sign-in
          does not yet map to pool rosters.
        </p>
      </div>
    );
  }

  return (
    <div className="my-teams-page">
      <h1 className="my-teams-page-title">My Teams</h1>
      <p className="my-teams-page-lead">
        <strong>In Control</strong> — you own the pool outcome for that team right now.{" "}
        <strong>Changed Control</strong> — your pick lost the game but covered the spread (someone else
        controls the slot that advanced). <strong>Lost Control</strong> — your pick did not cover (or lost
        outright without covering).
      </p>

      <section
        className="my-teams-section"
        aria-labelledby="my-teams-in-control-heading"
      >
        <h2 id="my-teams-in-control-heading" className="my-teams-section-title">
          In Control
        </h2>
        {active.length === 0 ? (
          <p className="my-teams-empty">
            You are not in control of any teams right now.
          </p>
        ) : (
          <ul className="my-teams-list">
            {active.map((row) => (
              <li key={row.teamId}>
                <button
                  type="button"
                  className={`my-teams-card${row.nextGameLive ? " my-teams-card--live" : ""}`}
                  onClick={() => onOpenGameInBracket(row.focusGameId)}
                  aria-label={
                    row.nextGameLive
                      ? `${row.school}: game in progress, view in bracket`
                      : undefined
                  }
                >
                  <div className="my-teams-card-top">
                    <div className="my-teams-card-head">
                      <span className="my-teams-seed">({row.seed})</span>
                      <span className="my-teams-school">{row.school}</span>
                      {row.mascot ? (
                        <span className="my-teams-mascot">{row.mascot}</span>
                      ) : null}
                    </div>
                    <MyTeamsCardBracketAffordance />
                  </div>
                  <div className="my-teams-meta">
                    <span>{row.region}</span>
                    {row.nextGameLive ? (
                      <span className="my-teams-live-pill" aria-hidden>
                        Live
                      </span>
                    ) : null}
                  </div>
                  <MyTeamsLiveScoreboard row={row} />
                  <dl className="my-teams-dl my-teams-dl--split">
                    <div className="my-teams-dl-split-col my-teams-dl-split-col--game">
                      <div className="my-teams-dl-field">
                        <dt>Round</dt>
                        <dd>{row.roundLabel}</dd>
                      </div>
                      <div className="my-teams-dl-field">
                        <dt>Game time</dt>
                        <dd>{row.nextTipLabel}</dd>
                      </div>
                      <div className="my-teams-dl-field">
                        <dt>Spread</dt>
                        <dd>{row.nextSpreadLabel}</dd>
                      </div>
                    </div>
                    <div className="my-teams-dl-split-col my-teams-dl-split-col--opponent">
                      <div className="my-teams-dl-field">
                        <dt>Next opponent</dt>
                        <dd>{row.nextOpponentLabel}</dd>
                      </div>
                      <div className="my-teams-dl-field">
                        <dt>Next owner</dt>
                        <dd>{row.nextOpponentOwnerLabel}</dd>
                      </div>
                    </div>
                  </dl>
                  {row.lastOutcomeMessage ? (
                    <p className="my-teams-outcome">{row.lastOutcomeMessage}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="my-teams-section"
        aria-labelledby="my-teams-changed-control-heading"
      >
        <h2
          id="my-teams-changed-control-heading"
          className="my-teams-section-title"
        >
          Changed Control
        </h2>
        {changedControl.length === 0 ? (
          <p className="my-teams-empty">
            None yet — no Round 1 picks lost the game while covering the spread.
          </p>
        ) : (
          <ul className="my-teams-list">
            {changedControl.map((row) => (
              <li key={row.teamId}>
                <button
                  type="button"
                  className={`my-teams-card my-teams-card--changed${row.nextGameLive ? " my-teams-card--live" : ""}`}
                  onClick={() => onOpenGameInBracket(row.focusGameId)}
                  aria-label={
                    row.nextGameLive
                      ? `${row.school}: game in progress, view in bracket`
                      : undefined
                  }
                >
                  <div className="my-teams-card-top">
                    <div className="my-teams-card-head">
                      <span className="my-teams-seed">({row.seed})</span>
                      <span className="my-teams-school">{row.school}</span>
                      {row.mascot ? (
                        <span className="my-teams-mascot">{row.mascot}</span>
                      ) : null}
                    </div>
                    <MyTeamsCardBracketAffordance />
                  </div>
                  <div className="my-teams-meta">
                    <span>{row.region}</span>
                    {row.nextGameLive ? (
                      <span className="my-teams-live-pill" aria-hidden>
                        Live
                      </span>
                    ) : null}
                  </div>
                  <MyTeamsLiveScoreboard row={row} />
                  <dl className="my-teams-dl my-teams-dl--muted my-teams-dl--stacked">
                    <div className="my-teams-dl-field">
                      <dt>Round</dt>
                      <dd>
                        {row.lostControlRoundLabel ??
                          row.roundLabel.replace(/\s*—\s*out\s*$/i, "")}
                      </dd>
                    </div>
                    <div className="my-teams-dl-field">
                      <dt>Game time</dt>
                      <dd>{row.nextTipLabel}</dd>
                    </div>
                  </dl>
                  {row.lastOutcomeMessage ? (
                    <p className="my-teams-outcome">{row.lastOutcomeMessage}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="my-teams-section"
        aria-labelledby="my-teams-lost-control-heading"
      >
        <h2 id="my-teams-lost-control-heading" className="my-teams-section-title">
          Lost Control
        </h2>
        {lost.length === 0 ? (
          <p className="my-teams-empty">
            None yet — no Round 1 picks failed to cover (including skinny wins where you lost
            the pool slot).
          </p>
        ) : (
          <ul className="my-teams-list">
            {lost.map((row) => (
              <li key={row.teamId}>
                <button
                  type="button"
                  className={`my-teams-card my-teams-card--lost${row.nextGameLive ? " my-teams-card--live" : ""}`}
                  onClick={() => onOpenGameInBracket(row.focusGameId)}
                  aria-label={
                    row.nextGameLive
                      ? `${row.school}: game in progress, view in bracket`
                      : undefined
                  }
                >
                  <div className="my-teams-card-top">
                    <div className="my-teams-card-head">
                      <span className="my-teams-seed">({row.seed})</span>
                      <span className="my-teams-school">{row.school}</span>
                      {row.mascot ? (
                        <span className="my-teams-mascot">{row.mascot}</span>
                      ) : null}
                    </div>
                    <MyTeamsCardBracketAffordance />
                  </div>
                  <div className="my-teams-meta">
                    <span>{row.region}</span>
                    {row.nextGameLive ? (
                      <span className="my-teams-live-pill" aria-hidden>
                        Live
                      </span>
                    ) : null}
                  </div>
                  <MyTeamsLiveScoreboard row={row} />
                  <dl className="my-teams-dl my-teams-dl--split my-teams-dl--muted">
                    <div className="my-teams-dl-split-col my-teams-dl-split-col--game">
                      <div className="my-teams-dl-field">
                        <dt>Lost control</dt>
                        <dd>
                          {row.lostControlRoundLabel ??
                            row.roundLabel.replace(/\s*—\s*out\s*$/i, "")}
                        </dd>
                      </div>
                      <div className="my-teams-dl-field">
                        <dt>Game time</dt>
                        <dd>{row.nextTipLabel}</dd>
                      </div>
                    </div>
                    <div className="my-teams-dl-split-col my-teams-dl-split-col--opponent">
                      <div className="my-teams-dl-field">
                        <dt>Owner</dt>
                        <dd>{row.lostSlotOwnerLabel ?? "—"}</dd>
                      </div>
                    </div>
                  </dl>
                  {row.lastOutcomeMessage ? (
                    <p className="my-teams-outcome">{row.lastOutcomeMessage}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
