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

export function MyTeamsPage({
  viewerUserId,
  games,
  results,
  ownershipRows,
  teamsById,
  usersById,
  onOpenGameInBracket,
}: Props) {
  const { active, lost } = useMemo(() => {
    if (!viewerUserId) {
      return { active: [] as MyTeamRow[], lost: [] as MyTeamRow[] };
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
        <strong>In Control</strong> lists teams you control in the bracket (spread outcomes).{" "}
        <strong>Lost Control</strong> lists teams you no longer control because they did not beat the spread.
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
                  className="my-teams-card"
                  onClick={() => onOpenGameInBracket(row.focusGameId)}
                >
                  <div className="my-teams-card-head">
                    <span className="my-teams-seed">({row.seed})</span>
                    <span className="my-teams-school">{row.school}</span>
                    {row.mascot ? (
                      <span className="my-teams-mascot">{row.mascot}</span>
                    ) : null}
                  </div>
                  <div className="my-teams-meta">
                    <span>{row.region}</span>
                  </div>
                  <dl className="my-teams-dl">
                    <div>
                      <dt>Round</dt>
                      <dd>{row.roundLabel}</dd>
                    </div>
                    <div>
                      <dt>Next opponent</dt>
                      <dd>{row.nextOpponentLabel}</dd>
                    </div>
                    <div>
                      <dt>Game time</dt>
                      <dd>{row.nextTipLabel}</dd>
                    </div>
                    <div>
                      <dt>Spread</dt>
                      <dd>{row.nextSpreadLabel}</dd>
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
            None yet — your Round 1 teams are still yours.
          </p>
        ) : (
          <ul className="my-teams-list">
            {lost.map((row) => (
              <li key={row.teamId}>
                <button
                  type="button"
                  className="my-teams-card my-teams-card--lost"
                  onClick={() => onOpenGameInBracket(row.focusGameId)}
                >
                  <div className="my-teams-card-head">
                    <span className="my-teams-seed">({row.seed})</span>
                    <span className="my-teams-school">{row.school}</span>
                    {row.mascot ? (
                      <span className="my-teams-mascot">{row.mascot}</span>
                    ) : null}
                  </div>
                  <div className="my-teams-meta">
                    <span>{row.region}</span>
                  </div>
                  {row.lastOutcomeMessage ? (
                    <p className="my-teams-outcome my-teams-outcome--emphasis">
                      {row.lastOutcomeMessage}
                    </p>
                  ) : null}
                  <dl className="my-teams-dl my-teams-dl--muted">
                    <div className="my-teams-dl-fullwidth">
                      <dt>Lost control</dt>
                      <dd>
                        {row.lostControlRoundLabel ??
                          row.roundLabel.replace(/\s*—\s*out\s*$/i, "")}
                      </dd>
                    </div>
                    <div>
                      <dt>Game time</dt>
                      <dd>{row.nextTipLabel}</dd>
                    </div>
                  </dl>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
