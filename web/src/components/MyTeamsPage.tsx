import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { buildMyTeamsSections, type MyTeamRow } from "../lib/myTeams";

type MyTeamsPerspective = "self" | "peer";

type Props = {
  viewerUserId: string | null;
  /** True when `/my-teams/user/:id` does not match a roster user. */
  userNotFound?: boolean;
  /** First-person vs third-person section copy. */
  perspective?: MyTeamsPerspective;
  /** Display name for `peer` copy (ignored when `perspective` is `self`). */
  peerName?: string;
  games: BracketGame[];
  results: Map<string, GameResult>;
  ownershipRows: OwnershipRow[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  /** Sorted roster for the title dropdown; omit to hide switcher. */
  rosterUsers?: User[];
  onSelectRosterUser?: (userId: string) => void;
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

function MyTeamsTitlePicker({
  pageTitle,
  rosterUsers,
  selectedUserId,
  onSelect,
}: {
  pageTitle: string;
  rosterUsers: User[];
  selectedUserId: string;
  onSelect: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerId = "my-teams-title-picker-trigger";
  const menuId = "my-teams-title-picker-menu";

  return (
    <div className="my-teams-title-picker" ref={rootRef}>
      <button
        id={triggerId}
        type="button"
        className="my-teams-title-picker-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="my-teams-title-picker-label">{pageTitle}</span>
        <svg
          className="my-teams-title-picker-chevron"
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
        <ul
          id={menuId}
          className="my-teams-title-picker-menu"
          role="listbox"
          aria-labelledby={triggerId}
        >
          {rosterUsers.map((u) => (
            <li key={u.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={u.id === selectedUserId}
                className={`my-teams-title-picker-option${
                  u.id === selectedUserId
                    ? " my-teams-title-picker-option--current"
                    : ""
                }`}
                onClick={() => {
                  onSelect(u.id);
                  setOpen(false);
                }}
              >
                {u.display_name} Teams
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Seed + school on row 1 with bracket affordance; mascot on row 2 when present. */
function MyTeamsCardHeadRow({
  seed,
  school,
  mascot,
}: {
  seed: number;
  school: string;
  mascot: string;
}) {
  return (
    <div className="my-teams-card-top">
      <div className="my-teams-card-head-line">
        <span className="my-teams-seed">({seed})</span>
        <span className="my-teams-school">{school}</span>
      </div>
      <MyTeamsCardBracketAffordance />
      {mascot ? (
        <div className="my-teams-mascot-row">
          <span className="my-teams-mascot">{mascot}</span>
        </div>
      ) : null}
    </div>
  );
}

export function MyTeamsPage({
  viewerUserId,
  userNotFound = false,
  perspective = "self",
  peerName = "",
  games,
  results,
  ownershipRows,
  teamsById,
  usersById,
  rosterUsers = [],
  onSelectRosterUser,
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

  if (userNotFound) {
    return (
      <div className="my-teams-page">
        <h1 className="my-teams-page-title">My Teams</h1>
        <p className="my-teams-page-lead">
          No player found with that ID.{" "}
          <Link className="my-teams-inline-link" to="/leaderboard">
            Back to Leaderboard
          </Link>
        </p>
      </div>
    );
  }

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

  const peer = perspective === "peer";
  const name = peerName;

  const copy = {
    inControlDesc: peer
      ? `${name}'s teams that they own the pool outcome for.`
      : "Your teams that you own the pool outcome for.",
    inControlEmpty: peer
      ? `${name} is not in control of any teams right now.`
      : "You are not in control of any teams right now.",
    changedDesc: peer
      ? `${name}'s teams that lost their game but covered the spread.`
      : "Your teams that lost their game but covered the spread.",
    changedEmpty: peer
      ? `None yet — none of ${name}'s teams lost the game while covering the spread.`
      : "None yet — none of your teams lost the game while covering the spread.",
    lostDesc: peer
      ? `${name}'s teams that did not cover the spread.`
      : "Your teams that did not cover the spread.",
    lostEmpty: peer
      ? `None yet — none of ${name}'s teams have failed to cover the spread.`
      : "None yet — none of your teams have failed to cover the spread.",
  };

  const pageTitle = peer ? `${name} Teams` : "My Teams";
  const showTitlePicker =
    Boolean(viewerUserId) &&
    rosterUsers.length > 0 &&
    typeof onSelectRosterUser === "function";

  return (
    <div className="my-teams-page">
      {showTitlePicker ? (
        <h1 className="my-teams-page-title my-teams-page-title--picker">
          <MyTeamsTitlePicker
            pageTitle={pageTitle}
            rosterUsers={rosterUsers}
            selectedUserId={viewerUserId!}
            onSelect={onSelectRosterUser!}
          />
        </h1>
      ) : (
        <h1 className="my-teams-page-title">{pageTitle}</h1>
      )}

      <section
        className="my-teams-section"
        aria-labelledby="my-teams-in-control-heading"
        aria-describedby="my-teams-in-control-desc"
      >
        <header className="my-teams-section-header">
          <h2 id="my-teams-in-control-heading" className="my-teams-section-title">
            <span className="my-teams-section-title-label">In Control</span>
            <span className="my-teams-section-count">{active.length}</span>
          </h2>
          <p id="my-teams-in-control-desc" className="my-teams-section-subtext">
            {copy.inControlDesc}
          </p>
        </header>
        {active.length === 0 ? (
          <p className="my-teams-empty">{copy.inControlEmpty}</p>
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
                  <MyTeamsCardHeadRow
                    seed={row.seed}
                    school={row.school}
                    mascot={row.mascot}
                  />
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
        aria-describedby="my-teams-changed-control-desc"
      >
        <header className="my-teams-section-header">
          <h2
            id="my-teams-changed-control-heading"
            className="my-teams-section-title"
          >
            <span className="my-teams-section-title-label">Changed Control</span>
            <span className="my-teams-section-count">
              {changedControl.length}
            </span>
          </h2>
          <p id="my-teams-changed-control-desc" className="my-teams-section-subtext">
            {copy.changedDesc}
          </p>
        </header>
        {changedControl.length === 0 ? (
          <p className="my-teams-empty">{copy.changedEmpty}</p>
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
                  <MyTeamsCardHeadRow
                    seed={row.seed}
                    school={row.school}
                    mascot={row.mascot}
                  />
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
                        <dt>Changed to</dt>
                        <dd>{row.changedToTeamLabel ?? "—"}</dd>
                      </div>
                      <div className="my-teams-dl-field">
                        <dt>Previous owner</dt>
                        <dd>{row.previousOwnerLabel ?? "—"}</dd>
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
        aria-labelledby="my-teams-lost-control-heading"
        aria-describedby="my-teams-lost-control-desc"
      >
        <header className="my-teams-section-header">
          <h2 id="my-teams-lost-control-heading" className="my-teams-section-title">
            <span className="my-teams-section-title-label">Lost Control</span>
            <span className="my-teams-section-count">{lost.length}</span>
          </h2>
          <p id="my-teams-lost-control-desc" className="my-teams-section-subtext">
            {copy.lostDesc}
          </p>
        </header>
        {lost.length === 0 ? (
          <p className="my-teams-empty">{copy.lostEmpty}</p>
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
                  <MyTeamsCardHeadRow
                    seed={row.seed}
                    school={row.school}
                    mascot={row.mascot}
                  />
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
                        <dt>Lost control in</dt>
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
                        <dt>Lost control to</dt>
                        <dd>{row.lostControlToLabel ?? "—"}</dd>
                      </div>
                      <div className="my-teams-dl-field">
                        <dt>Current owner</dt>
                        <dd>{row.currentOwnerLabel ?? "—"}</dd>
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
