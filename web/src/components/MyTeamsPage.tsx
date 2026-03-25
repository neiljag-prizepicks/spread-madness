import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { groupLeaderboardPath } from "../lib/groupPaths";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { buildMyTeamsSections, type MyTeamRow } from "../lib/myTeams";

type MyTeamsPerspective = "self" | "peer";

type Props = {
  viewerUserId: string | null;
  /** True when my-teams peer route does not match a roster user. */
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

function matchupShortLine(row: MyTeamRow): string {
  const opp = row.nextOpponentLabel.trim();
  if (opp.startsWith("Winner of")) {
    return `${row.school} · ${opp}`;
  }
  const first = opp.split(/\s+/)[0] ?? opp;
  return `${row.school} vs ${first}`;
}

/** Private-use char: masks the period in “vs.” so sentence split does not break there. */
const VS_DOT_SENTINEL = "\uE000";

/** Split outcome copy into short lines for the “Previous game” list. */
function outcomeBulletTexts(text: string | null): string[] {
  if (text == null || text.trim() === "") return [];
  const masked = text.replace(/\bvs\./gi, `vs${VS_DOT_SENTINEL}`);
  const parts = masked
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replaceAll(VS_DOT_SENTINEL, "."))
    .filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()];
}

type MyTeamsCardVariant = "active" | "changed" | "lost";

function myTeamsCardDetailRows(
  variant: MyTeamsCardVariant,
  row: MyTeamRow
): { label: string; value: ReactNode }[] {
  const bullets = outcomeBulletTexts(row.lastOutcomeMessage);
  const prevGame: { label: string; value: ReactNode } | null =
    bullets.length > 0
      ? {
          label: "Previous game",
          value: (
            <ul className="my-teams-card-detail-bullets">
              {bullets.map((line, i) => (
                <li key={`${i}-${line.slice(0, 48)}`}>{line}</li>
              ))}
            </ul>
          ),
        }
      : null;

  if (variant === "active") {
    return [
      { label: "Round", value: row.roundLabel },
      { label: "Next owner", value: row.nextOpponentOwnerLabel },
      ...(prevGame ? [prevGame] : []),
    ];
  }

  if (variant === "changed") {
    const roundVal =
      row.lostControlRoundLabel ??
      row.roundLabel.replace(/\s*—\s*out\s*$/i, "");
    return [
      { label: "Round", value: roundVal },
      { label: "Changed to", value: row.changedToTeamLabel ?? "—" },
      { label: "Previous owner", value: row.previousOwnerLabel ?? "—" },
      ...(prevGame ? [prevGame] : []),
    ];
  }

  return [
    {
      label: "Lost control in",
      value:
        row.lostControlRoundLabel ??
        row.roundLabel.replace(/\s*—\s*out\s*$/i, ""),
    },
    { label: "Lost control to", value: row.lostControlToLabel ?? "—" },
    { label: "Current owner", value: row.currentOwnerLabel ?? "—" },
    ...(prevGame ? [prevGame] : []),
  ];
}

function MyTeamsCardAvatarBadge({ live }: { live: boolean }) {
  return (
    <span className="my-teams-card-avatar-badge" aria-hidden>
      {live ? (
        <span className="my-teams-card-avatar-live-dot" />
      ) : (
        <svg
          className="my-teams-card-avatar-clock"
          viewBox="0 0 10 10"
          fill="none"
        >
          <circle
            cx="5"
            cy="5"
            r="4.25"
            stroke="currentColor"
            strokeWidth="0.85"
          />
          <path
            d="M5 2.85V5l1.65 1.1"
            stroke="currentColor"
            strokeWidth="0.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

/**
 * My Teams row — Figma Team Card (339:13438): event header, avatar + team +
 * spread module, nested detail panel.
 */
function MyTeamsTeamCard({
  row,
  teamsById,
  variant,
  onOpen,
}: {
  row: MyTeamRow;
  teamsById: Map<string, Team>;
  variant: MyTeamsCardVariant;
  onOpen: () => void;
}) {
  const abbrev =
    teamsById.get(row.teamId)?.abbrev?.toUpperCase() ??
    row.school.slice(0, 3).toUpperCase();
  const teamTitle = [row.school, row.mascot].filter(Boolean).join(" ");
  const regionSeed = `${row.region} (${row.seed})`;
  const detailRows = myTeamsCardDetailRows(variant, row);
  const live = row.nextGameLive;

  const variantClass =
    variant === "changed"
      ? " my-teams-card--changed"
      : variant === "lost"
        ? " my-teams-card--lost"
        : "";

  return (
    <button
      type="button"
      className={`my-teams-card${variantClass}${live ? " my-teams-card--live" : ""}`}
      onClick={onOpen}
      aria-label={`${teamTitle}: view next game in bracket`}
    >
      <div className="my-teams-card-event-header">
        <div className="my-teams-card-event-left">
          <span className="my-teams-sport-badge">CBB</span>
          <span className="my-teams-card-matchup">{matchupShortLine(row)}</span>
        </div>
        <div className="my-teams-card-event-time">
          {live ? (
            <span className="my-teams-live-pill">Live</span>
          ) : (
            row.nextTipLabel
          )}
        </div>
      </div>
      <MyTeamsLiveScoreboard row={row} />
      <div className="my-teams-card-body">
        <div className="my-teams-card-pick-row">
          <div className="my-teams-card-avatar-wrap">
            <div className="my-teams-card-avatar" aria-hidden>
              {abbrev}
            </div>
            <MyTeamsCardAvatarBadge live={live} />
          </div>
          <div className="my-teams-card-titles">
            <p className="my-teams-card-team-name">{teamTitle}</p>
            <p className="my-teams-card-region-seed">{regionSeed}</p>
          </div>
          <div className="my-teams-card-spread-box">
            <p className="my-teams-card-spread-value">{row.nextSpreadLabel}</p>
            <p className="my-teams-card-spread-label">Spread</p>
          </div>
        </div>
        <div className="my-teams-card-details">
          {detailRows.map(({ label, value }) => (
            <div key={label} className="my-teams-card-detail-row">
              <div className="my-teams-card-detail-label">{label}</div>
              <div className="my-teams-card-detail-value">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </button>
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
  const { groupId } = useParams<{ groupId?: string }>();
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
          <Link
            className="my-teams-inline-link"
            to={
              groupId ? groupLeaderboardPath(groupId) : "/leaderboard"
            }
          >
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
          This proof-of-concept ties teams to <strong>mock group users</strong> from
          the demo login. Sign in with <strong>Mock login</strong> and pick your name
          to see the teams you control and your Round 1 picks here. Google sign-in
          does not yet map to group rosters.
        </p>
      </div>
    );
  }

  const peer = perspective === "peer";
  const name = peerName;

  const copy = {
    inControlDesc: peer
      ? `${name}'s teams that they own the group outcome for.`
      : "Your teams that you own the group outcome for.",
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
                <MyTeamsTeamCard
                  row={row}
                  teamsById={teamsById}
                  variant="active"
                  onOpen={() => onOpenGameInBracket(row.focusGameId)}
                />
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
                <MyTeamsTeamCard
                  row={row}
                  teamsById={teamsById}
                  variant="changed"
                  onOpen={() => onOpenGameInBracket(row.focusGameId)}
                />
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
                <MyTeamsTeamCard
                  row={row}
                  teamsById={teamsById}
                  variant="lost"
                  onOpen={() => onOpenGameInBracket(row.focusGameId)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
