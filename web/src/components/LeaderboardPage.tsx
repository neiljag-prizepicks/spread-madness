import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { groupMyTeamsUserPath } from "../lib/groupPaths";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import {
  buildLeaderboardRows,
  type LeaderboardRow,
  type LeaderboardSortKey,
} from "../lib/leaderboard";

type Props = {
  users: User[];
  games: BracketGame[];
  results: Map<string, GameResult>;
  ownershipRows: OwnershipRow[];
  teamsById: Map<string, Team>;
};

type SortDir = "asc" | "desc";

function formatPct(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}

function formatRoundCell(value: number | null): string {
  if (value == null) return "-";
  return String(value);
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: SortDir
): number {
  const na = a == null;
  const nb = b == null;
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

function compareRows(
  a: LeaderboardRow,
  b: LeaderboardRow,
  key: LeaderboardSortKey,
  dir: SortDir
): number {
  let cmp = 0;
  switch (key) {
    case "displayName":
      cmp = a.displayName.localeCompare(b.displayName);
      break;
    case "teamsInControl":
      cmp = a.teamsInControl - b.teamsInControl;
      break;
    case "coverRate":
      return compareNullableNumber(a.coverRate, b.coverRate, dir);
    case "roundOf32":
      return compareNullableNumber(a.roundOf32, b.roundOf32, dir);
    case "sweet16":
      return compareNullableNumber(a.sweet16, b.sweet16, dir);
    case "elite8":
      return compareNullableNumber(a.elite8, b.elite8, dir);
    case "finalFour":
      return compareNullableNumber(a.finalFour, b.finalFour, dir);
    case "championship":
      return compareNullableNumber(a.championship, b.championship, dir);
    default:
      cmp = 0;
  }
  if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
  return a.displayName.localeCompare(b.displayName);
}

function SortIndicator({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDir;
}) {
  if (!active) return <span className="leaderboard-sort-placeholder" aria-hidden />;
  return (
    <span className="leaderboard-sort-indicator" aria-hidden>
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

export function LeaderboardPage({
  users,
  games,
  results,
  ownershipRows,
  teamsById,
}: Props) {
  const { groupId } = useParams<{ groupId?: string }>();
  const rows = useMemo(
    () =>
      buildLeaderboardRows(users, games, results, ownershipRows, teamsById),
    [users, games, results, ownershipRows, teamsById]
  );

  const [sortKey, setSortKey] = useState<LeaderboardSortKey>("teamsInControl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => compareRows(a, b, sortKey, sortDir));
    return out;
  }, [rows, sortKey, sortDir]);

  const onHeaderClick = (key: LeaderboardSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "displayName" ? "asc" : "desc");
    }
  };

  const th = (key: LeaderboardSortKey, label: string, className?: string) => (
    <th scope="col" className={className}>
      <button
        type="button"
        className="leaderboard-th-btn"
        onClick={() => onHeaderClick(key)}
        aria-sort={
          sortKey === key
            ? sortDir === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <span className="leaderboard-th-label">{label}</span>
        <SortIndicator active={sortKey === key} dir={sortDir} />
      </button>
    </th>
  );

  return (
    <div className="leaderboard-page">
      <h1 className="leaderboard-page-title">Leaderboard</h1>

      <div className="leaderboard-table-wrap">
        <table className="leaderboard-table">
          <thead>
            <tr>
              {th("displayName", "Player", "leaderboard-col-player")}
              {th("teamsInControl", "In control")}
              {th("coverRate", "Cover %")}
              {th("roundOf32", "R32")}
              {th("sweet16", "S16")}
              {th("elite8", "E8")}
              {th("finalFour", "FF")}
              {th("championship", "Champ")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.userId}>
                <td className="leaderboard-col-player">
                  <Link
                    className="leaderboard-col-player-link"
                    to={
                      groupId
                        ? groupMyTeamsUserPath(groupId, r.userId)
                        : `/my-teams/user/${encodeURIComponent(r.userId)}`
                    }
                  >
                    <span className="leaderboard-col-player-link-text">
                      {r.displayName}
                    </span>
                    <span
                      className="leaderboard-col-player-link-chevron"
                      aria-hidden
                    >
                      <svg
                        className="leaderboard-col-player-link-chevron-svg"
                        viewBox="0 0 10 10"
                        width="10"
                        height="10"
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
                    </span>
                  </Link>
                </td>
                <td>{r.teamsInControl}</td>
                <td>{formatPct(r.coverRate)}</td>
                <td>{formatRoundCell(r.roundOf32)}</td>
                <td>{formatRoundCell(r.sweet16)}</td>
                <td>{formatRoundCell(r.elite8)}</td>
                <td>{formatRoundCell(r.finalFour)}</td>
                <td>{formatRoundCell(r.championship)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="leaderboard-key">
        <summary className="leaderboard-key-summary">
          Table key
          <span className="leaderboard-key-chevron" aria-hidden>
            <svg
              className="leaderboard-key-chevron-svg"
              viewBox="0 0 12 12"
              width="12"
              height="12"
            >
              <path
                d="M2.75 4.25 L6 7.75 L9.25 4.25"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </summary>
        <dl className="leaderboard-key-dl">
          <div className="leaderboard-key-row">
            <dt>In control</dt>
            <dd>Number of teams the player currently has in control.</dd>
          </div>
          <div className="leaderboard-key-row">
            <dt>Cover %</dt>
            <dd>
              How often the player&apos;s side covered the spread in finalized games where they
              controlled a team in that matchup.
            </dd>
          </div>
          <div className="leaderboard-key-row">
            <dt>R32</dt>
            <dd>Number of teams the player controlled in the Round of 32.</dd>
          </div>
          <div className="leaderboard-key-row">
            <dt>S16</dt>
            <dd>Number of teams the player controlled in the Sweet 16.</dd>
          </div>
          <div className="leaderboard-key-row">
            <dt>E8</dt>
            <dd>Number of teams the player controlled in the Elite 8.</dd>
          </div>
          <div className="leaderboard-key-row">
            <dt>FF</dt>
            <dd>Number of teams the player controlled in the Final 4.</dd>
          </div>
          <div className="leaderboard-key-row">
            <dt>Champ</dt>
            <dd>Number of teams the player controlled in the Championship Game.</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
