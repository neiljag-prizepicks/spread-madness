import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import type { BracketGame, Team } from "../types";
import {
  buildRegionAssignRows,
  fairTargetLogicalUnitsPerMemberPerRegion,
  logicalUnitsOwnedInRegion,
  ownershipRowsEqual,
  regionSeedSlotProgress,
  tabRegionsFromGames,
  type RegionAssignRow,
} from "../lib/assignPageRegions";
import { isOwnershipLocked } from "../lib/autoAssignWhenFull";
import { requireDb } from "../lib/firebase";
import {
  setGroupOwnership,
  subscribeGroupDocument,
  subscribeGroupMembers,
  subscribeGroupOwnership,
  unlockGroupOwnershipForEditing,
  updateGroupAutoAssignWhenFull,
  type GroupDoc,
} from "../lib/firestore/groupsApi";
import {
  buildBalancedOwnership,
  buildFfPairMap,
  logicalBracketSlotsForUser,
} from "../lib/ownershipUnits";
import {
  canSplitTournamentEvenly,
  isValidMemberCap,
  PHYSICAL_TEAM_ID_COUNT,
  teamsPerMember,
  type GroupMemberCap,
} from "../lib/groupConstants";
import type { OwnershipRow } from "../lib/ownershipMap";
import { groupBracketPath, groupSettingsPath } from "../lib/groupPaths";

type Props = {
  uid: string;
  games: BracketGame[];
  allTeamIds: string[];
  teamsById: Map<string, Team>;
};

function IconWarning({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
      />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

function IconShuffle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.41 4l2 2H21v2h-4.59l-2-2h-.01zm2.59 8v2l4 4-4 4v-2h-8v-4h8v-2zm-8-2V8H4V6h8v4zm8 2v2H4v-2h12z"
      />
    </svg>
  );
}

function IconLock({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      {locked ? (
        <path
          fill="currentColor"
          d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
        />
      ) : (
        <path
          fill="currentColor"
          d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"
        />
      )}
    </svg>
  );
}

function selectValueForRow(row: RegionAssignRow, local: OwnershipRow[]): string {
  if (row.teamIds.length === 0) return "";
  const uid =
    local.find((r) => r.team_id === row.representativeTeamId)?.user_id ?? "";
  if (row.isPair && row.teamIds.length === 2) {
    const [a, b] = row.teamIds;
    const ua = local.find((r) => r.team_id === a)?.user_id ?? "";
    const ub = local.find((r) => r.team_id === b)?.user_id ?? "";
    if (ua !== ub) return "";
    return ua;
  }
  return uid;
}

export function GroupAssignmentPage({
  uid,
  games,
  allTeamIds,
  teamsById,
}: Props) {
  const { groupId = "" } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const db = useMemo(() => requireDb(), []);

  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [memberCap, setMemberCap] = useState<GroupMemberCap | null>(null);
  const [members, setMembers] = useState<{ uid: string; displayName: string }[]>(
    []
  );
  const [local, setLocal] = useState<OwnershipRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ownershipReady, setOwnershipReady] = useState(false);
  const [groupDoc, setGroupDoc] = useState<GroupDoc | null>(null);
  const [firestoreOwnRows, setFirestoreOwnRows] = useState<OwnershipRow[]>([]);
  const [unlockingAssignments, setUnlockingAssignments] = useState(false);
  const [savingAutoAssign, setSavingAutoAssign] = useState(false);
  const [activeRegion, setActiveRegion] = useState("");
  const seededDefault = useRef(false);
  const prevLockedRef = useRef<boolean | null>(null);

  const ffPairMap = useMemo(() => buildFfPairMap(games), [games]);
  const tabRegions = useMemo(() => tabRegionsFromGames(games), [games]);

  const rowsByRegion = useMemo(() => {
    const m = new Map<string, RegionAssignRow[]>();
    for (const reg of tabRegions) {
      m.set(reg, buildRegionAssignRows(reg, games, teamsById, ffPairMap));
    }
    return m;
  }, [tabRegions, games, teamsById, ffPairMap]);

  useEffect(() => {
    setGroupDoc(null);
    setFirestoreOwnRows([]);
    setLocal([]);
    setOwnershipReady(false);
    seededDefault.current = false;
    prevLockedRef.current = null;
    setActiveRegion("");
  }, [groupId]);

  useEffect(() => {
    if (tabRegions.length === 0) return;
    setActiveRegion((prev) =>
      prev && tabRegions.includes(prev) ? prev : tabRegions[0]!
    );
  }, [tabRegions]);

  useEffect(() => {
    const unsub = subscribeGroupMembers(
      db,
      groupId,
      (rows) => {
        setMembers(
          rows.map((r) => ({
            uid: r.uid,
            displayName: r.data.displayName,
          }))
        );
        const me = rows.find((r) => r.uid === uid);
        setRole(me?.data.role ?? null);
      },
      (e) => setError(String(e.message))
    );
    return () => unsub();
  }, [db, groupId, uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const link = await getDoc(doc(db, "users", uid, "groups", groupId));
      const g = await getDoc(doc(db, "groups", groupId));
      if (cancelled) return;
      if (!link.exists() || !g.exists()) {
        setError("You are not in this group.");
        return;
      }
      const cap = g.data()?.memberCap;
      if (typeof cap === "number" && isValidMemberCap(cap)) setMemberCap(cap);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, uid, groupId]);

  useEffect(() => {
    const unsub = subscribeGroupDocument(
      db,
      groupId,
      setGroupDoc,
      (e) => setError(String(e.message))
    );
    return () => unsub();
  }, [db, groupId]);

  useEffect(() => {
    const unsub = subscribeGroupOwnership(
      db,
      groupId,
      (rows) => {
        setOwnershipReady(true);
        setFirestoreOwnRows(rows);
      },
      (e) => setError(String(e.message))
    );
    return () => unsub();
  }, [db, groupId]);

  useEffect(() => {
    const locked = isOwnershipLocked(groupDoc, firestoreOwnRows.length);
    const prevLocked = prevLockedRef.current;
    prevLockedRef.current = locked;

    if (locked) {
      seededDefault.current = firestoreOwnRows.length > 0;
      setLocal(firestoreOwnRows);
      return;
    }

    if (firestoreOwnRows.length === 0) {
      return;
    }

    const justUnlocked = prevLocked === true && !locked;
    setLocal((prev) => {
      if (justUnlocked) return firestoreOwnRows;
      if (prev.length === 0) return firestoreOwnRows;
      return prev;
    });
    seededDefault.current = true;
  }, [groupDoc, firestoreOwnRows]);

  useEffect(() => {
    if (groupDoc === null) return;
    if (!ownershipReady || seededDefault.current) return;
    if (groupDoc.autoAssignWhenFull) return;
    if (!memberCap || !canSplitTournamentEvenly(memberCap)) return;
    if (allTeamIds.length !== PHYSICAL_TEAM_ID_COUNT) return;
    if (members.length !== memberCap) return;
    const uids = members.map((m) => m.uid);
    try {
      const rows = buildBalancedOwnership(
        games,
        allTeamIds,
        teamsById,
        uids,
        memberCap,
        false
      );
      setLocal(rows.map((r) => ({ user_id: r.user_id, team_id: r.team_id })));
      seededDefault.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [
    ownershipReady,
    memberCap,
    allTeamIds,
    members,
    games,
    teamsById,
    groupDoc?.autoAssignWhenFull,
  ]);

  const assignmentsLocked = isOwnershipLocked(
    groupDoc,
    firestoreOwnRows.length
  );

  const hasSavedAssignments = firestoreOwnRows.length > 0;

  const dirty = useMemo(
    () => !ownershipRowsEqual(local, firestoreOwnRows),
    [local, firestoreOwnRows]
  );

  const showManualUi = !groupDoc?.autoAssignWhenFull;

  const targetsPerRegion = useMemo(() => {
    if (!memberCap || allTeamIds.length !== PHYSICAL_TEAM_ID_COUNT)
      return new Map<string, number>();
    try {
      return fairTargetLogicalUnitsPerMemberPerRegion(
        games,
        allTeamIds,
        teamsById,
        memberCap
      );
    } catch {
      return new Map<string, number>();
    }
  }, [games, allTeamIds, teamsById, memberCap]);

  const countsOk = useMemo(() => {
    if (!memberCap || members.length !== memberCap) return false;
    if (!canSplitTournamentEvenly(memberCap)) return false;
    if (local.some((r) => !String(r.user_id ?? "").trim())) return false;
    const logicalPer = teamsPerMember(memberCap);
    for (const m of members) {
      if (
        logicalBracketSlotsForUser(m.uid, local, ffPairMap) !== logicalPer
      ) {
        return false;
      }
    }
    const teams = new Set(local.map((r) => r.team_id));
    if (teams.size !== allTeamIds.length) return false;
    if (allTeamIds.length !== PHYSICAL_TEAM_ID_COUNT) return false;

    const userByTeam = new Map(local.map((r) => [r.team_id, r.user_id]));
    for (const [tid, other] of ffPairMap) {
      if (tid.localeCompare(other) >= 0) continue;
      const ua = userByTeam.get(tid);
      const ub = userByTeam.get(other);
      if (ua == null || ub == null || ua !== ub) return false;
    }
    return true;
  }, [local, memberCap, members, ffPairMap, allTeamIds.length]);

  const waitingForMoreMembers = Boolean(
    members.length > 0 &&
      memberCap != null &&
      members.length !== memberCap
  );

  const activeRows = activeRegion ? rowsByRegion.get(activeRegion) ?? [] : [];

  const hasAnyAssignment = useMemo(
    () => local.some((r) => String(r.user_id ?? "").trim() !== ""),
    [local]
  );

  const handleClearTeams = () => {
    if (assignmentsLocked || !showManualUi) return;
    if (
      !window.confirm(
        "Clear all team assignments? You can shuffle or assign again before locking."
      )
    ) {
      return;
    }
    setError(null);
    setLocal((prev) => prev.map((r) => ({ ...r, user_id: "" })));
  };

  const handleShuffleTeams = () => {
    if (assignmentsLocked || !showManualUi) return;
    setError(null);
    try {
      if (!memberCap || members.length !== memberCap) {
        setError(
          `Group needs exactly ${memberCap ?? "?"} members before shuffling.`
        );
        return;
      }
      if (!canSplitTournamentEvenly(memberCap)) {
        setError(
          "This group size cannot split the 64-slot bracket evenly. Use group size 2, 4, 8, 16, 32, or 64."
        );
        return;
      }
      if (allTeamIds.length !== PHYSICAL_TEAM_ID_COUNT) {
        setError(
          `Roster must have ${PHYSICAL_TEAM_ID_COUNT} team ids (found ${allTeamIds.length}).`
        );
        return;
      }
      const uids = members.map((m) => m.uid);
      const rows = buildBalancedOwnership(
        games,
        allTeamIds,
        teamsById,
        uids,
        memberCap,
        true
      );
      setLocal(rows.map((r) => ({ user_id: r.user_id, team_id: r.team_id })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toolbarDisabled = assignmentsLocked || waitingForMoreMembers;

  const handleUnlockAssignments = async () => {
    if (
      !window.confirm(
        "Unlock team assignments? You can edit assignments here. Use Lock to save and lock again for everyone."
      )
    ) {
      return;
    }
    setError(null);
    setUnlockingAssignments(true);
    try {
      await unlockGroupOwnershipForEditing(db, groupId, uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUnlockingAssignments(false);
    }
  };

  const handleLock = async () => {
    if (assignmentsLocked) {
      setError("Unlock assignments before making changes.");
      return;
    }
    if (!countsOk) {
      setError(
        `Assign every team to a member (no empty slots). Each member needs the correct number of logical slots (${PHYSICAL_TEAM_ID_COUNT} team ids total; First Four pairs share an owner).`
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setGroupOwnership(db, groupId, local);
      navigate(groupBracketPath(groupId), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAutoAssignToggle = async (enabled: boolean) => {
    setError(null);
    setSavingAutoAssign(true);
    try {
      await updateGroupAutoAssignWhenFull(db, groupId, uid, enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAutoAssign(false);
    }
  };

  const updateTeamOwner = (teamId: string, userId: string) => {
    if (assignmentsLocked || !teamId) return;
    setLocal((prev) => {
      const other = ffPairMap.get(teamId);
      return prev.map((r) => {
        if (r.team_id === teamId || (other && r.team_id === other)) {
          return { ...r, user_id: userId };
        }
        return r;
      });
    });
  };

  if (role !== "admin") {
    return (
      <div className="group-hub">
        {role === null ? (
          <p className="group-hub-muted">Checking access…</p>
        ) : (
          <>
            <p className="group-hub-error">Only group admins can assign teams.</p>
            <Link to={groupSettingsPath(groupId)} className="btn-ghost">
              Back to settings
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="group-assign-v2">
      <header className="group-assign-v2-header">
        <h1 className="group-assign-v2-title">Assign teams</h1>
      </header>

      {assignmentsLocked && hasSavedAssignments ? (
        <div className="group-assign-v2-banner group-assign-v2-banner--warn">
          <IconWarning className="group-assign-v2-banner-icon" />
          <p>
            Teams are locked. You must unlock the current team assignments to
            make changes.
          </p>
        </div>
      ) : null}

      {!assignmentsLocked && hasSavedAssignments && dirty ? (
        <div className="group-assign-v2-banner group-assign-v2-banner--unsaved">
          <p>
            <strong>Changes not saved.</strong> Use Lock below to save and lock
            assignments for everyone.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="group-hub-error" role="alert">
          {error}
        </div>
      ) : null}

      <section
        className="group-assign-v2-card"
        aria-labelledby="unlock-teams-h"
      >
        <h2 id="unlock-teams-h" className="group-assign-v2-card-title">
          Unlock teams
        </h2>
        <p className="group-assign-v2-desc">
          {assignmentsLocked && hasSavedAssignments
            ? "Teams are currently locked. Unlock to edit assignments."
            : "Teams are unlocked for editing. Lock saves your assignments and locks them for all admins."}
        </p>
        <div className="group-assign-v2-unlock-row">
          {assignmentsLocked && hasSavedAssignments ? (
            <button
              type="button"
              className="btn-primary group-assign-v2-lock-btn"
              disabled={unlockingAssignments}
              onClick={() => void handleUnlockAssignments()}
            >
              <IconLock locked />
              {unlockingAssignments ? "Unlocking…" : "Unlock"}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary group-assign-v2-lock-btn"
              disabled={
                saving ||
                !countsOk ||
                waitingForMoreMembers ||
                assignmentsLocked
              }
              onClick={() => void handleLock()}
            >
              <IconLock locked={false} />
              {saving ? "Locking…" : "Lock"}
            </button>
          )}
        </div>
      </section>

      <section
        className="group-assign-v2-card"
        aria-labelledby="auto-team-assign-page-h"
      >
        <h2 id="auto-team-assign-page-h" className="group-assign-v2-card-title">
          Auto Team Assignment
        </h2>
        <div
          className={`group-settings-v2-toggle${savingAutoAssign || !groupDoc ? " group-settings-v2-toggle--disabled" : ""}`}
        >
          <label
            htmlFor="assign-page-auto-assign"
            className="group-settings-v2-toggle-label-row"
          >
            <input
              id="assign-page-auto-assign"
              type="checkbox"
              role="switch"
              className="group-settings-v2-toggle-input"
              checked={Boolean(groupDoc?.autoAssignWhenFull)}
              disabled={savingAutoAssign || !groupDoc}
              onChange={(e) => void handleAutoAssignToggle(e.target.checked)}
            />
            <span className="group-settings-v2-toggle-track" aria-hidden />
            <span className="group-settings-v2-toggle-label">
              {groupDoc?.autoAssignWhenFull
                ? "Auto-assignment is enabled"
                : "Auto-assignment is disabled"}
            </span>
          </label>
          <p className="group-settings-v2-toggle-help">
            Disabled by default.
            <br />
            If enabled, teams are randomly and evenly assigned once the group is
            full. This requires an admin to have the app open.
            <br />
            If disabled, teams must be assigned manually by an admin.
          </p>
        </div>
      </section>

      {groupDoc?.autoAssignWhenFull ? (
        <p className="group-assign-v2-auto-blocked" role="status">
          To manually make team assignments, you must disable random
          auto-assignment.
        </p>
      ) : null}

      {waitingForMoreMembers ? (
        <p className="group-hub-error">
          Waiting for {(memberCap ?? 0) - members.length} more member(s) before
          assignment is valid.
        </p>
      ) : null}

      {showManualUi ? (
        <>
          <section
            className="group-assign-v2-card"
            aria-labelledby="team-assignments-h"
          >
            <h2 id="team-assignments-h" className="group-assign-v2-card-title">
              Team assignments
            </h2>
            <p className="group-assign-v2-desc">
              Manually draft or assign teams to group members.
            </p>

            <div
              className="group-assign-v2-toolbar"
              role="group"
              aria-label="Bulk assignment actions"
            >
              <button
                type="button"
                className="group-assign-v2-clear-btn"
                onClick={handleClearTeams}
                disabled={toolbarDisabled || !hasAnyAssignment}
              >
                <IconTrash className="group-assign-v2-toolbar-icon" />
                Clear teams
              </button>
              <button
                type="button"
                className="btn-primary group-assign-v2-shuffle-btn"
                onClick={handleShuffleTeams}
                disabled={toolbarDisabled}
              >
                <IconShuffle className="group-assign-v2-toolbar-icon" />
                Shuffle teams
              </button>
            </div>

            <details className="leaderboard-key group-assign-v2-breakdown">
              <summary className="leaderboard-key-summary">
                Member : Region breakdown
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
              <div className="leaderboard-key-dl">
                <p className="group-assign-breakdown-intro">
                  View the number of teams per region assigned to each group
                  member. Region tabs show assigned teams / total teams.
                </p>
                {memberCap ? (
                  <div className="group-assign-v2-matrix-wrap">
                    <table className="group-assign-v2-matrix">
                      <thead>
                        <tr>
                          <th scope="col">Player</th>
                          {tabRegions.map((reg) => (
                            <th key={reg} scope="col">
                              {reg.toUpperCase()}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={m.uid}>
                            <th scope="row">{m.displayName}</th>
                            {tabRegions.map((reg) => {
                              const tgt = targetsPerRegion.get(reg) ?? 0;
                              const got = logicalUnitsOwnedInRegion(
                                m.uid,
                                reg,
                                games,
                                allTeamIds,
                                teamsById,
                                local
                              );
                              const tgtDisplay =
                                Number.isInteger(tgt)
                                  ? String(tgt)
                                  : tgt.toFixed(1);
                              const ok =
                                tgt > 0 &&
                                (Number.isInteger(tgt)
                                  ? got === tgt
                                  : Math.abs(got - tgt) < 0.5);
                              return (
                                <td key={reg}>
                                  {got}/{tgtDisplay}
                                  {ok ? (
                                    <span
                                      className="group-assign-v2-matrix-check"
                                      aria-label="On target"
                                    >
                                      ✓
                                    </span>
                                  ) : null}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </details>

            <div
              className="group-assign-v2-tabs"
              role="tablist"
              aria-label="Tournament region"
            >
              {tabRegions.map((reg) => {
                const rows = rowsByRegion.get(reg) ?? [];
                const { assigned, total } = regionSeedSlotProgress(rows, local);
                const complete = total > 0 && assigned === total;
                return (
                  <button
                    key={reg}
                    type="button"
                    role="tab"
                    aria-selected={reg === activeRegion}
                    className={`group-assign-v2-tab${reg === activeRegion ? " group-assign-v2-tab--active" : ""}${complete ? " group-assign-v2-tab--complete" : ""}`}
                    onClick={() => setActiveRegion(reg)}
                  >
                    {reg.toUpperCase()}{" "}
                    <span className="group-assign-v2-tab-count">
                      {assigned}/{total}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              className="group-assign-v2-grid"
              role="tabpanel"
              aria-label={`${activeRegion} teams`}
            >
              {activeRows.map((row) => {
                const disabled =
                  assignmentsLocked ||
                  row.teamIds.length === 0 ||
                  !row.representativeTeamId;
                const val = selectValueForRow(row, local);
                return (
                  <div key={row.key} className="group-assign-v2-row">
                    <span className="group-assign-v2-team-label">{row.label}</span>
                    <select
                      className="group-hub-input group-assign-v2-select"
                      value={val}
                      disabled={disabled}
                      onChange={(e) =>
                        updateTeamOwner(
                          row.representativeTeamId,
                          e.target.value
                        )
                      }
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
