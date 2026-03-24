import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import type { BracketGame, GameResult, Team } from "../types";
import {
  assignableTeamIdsSet,
  buildAssignmentOwnershipUnits,
  fairTargetLogicalUnitsPerMemberPerRegionFromUnits,
  ownershipSkeletonFromAssignmentUnits,
  reconcileOwnershipToAssignmentSkeleton,
  shouldRestrictToSurvivingTeams,
} from "../lib/assignableTeams";
import {
  buildRegionAssignRows,
  logicalUnitsOwnedInRegionForUnits,
  ownershipRowsEqual,
  regionAssignRowSelectValue,
  regionSeedSlotProgressAssignable,
  representativeTeamIdForAssignUi,
  tabRegionsFromGames,
  validateAssignableOwnership,
  type RegionAssignRow,
} from "../lib/assignPageRegions";
import { anyBracketGameStarted } from "../lib/bracketGameStarted";
import { isOwnershipLocked } from "../lib/autoAssignWhenFull";
import { requireDb } from "../lib/firebase";
import {
  setGroupOwnership,
  subscribeGroupDocument,
  subscribeGroupMembers,
  subscribeGroupOwnership,
  unlockGroupOwnershipForEditing,
  updateGroupAllowAssignEliminatedTeams,
  updateGroupAutoAssignWhenFull,
  type GroupDoc,
} from "../lib/firestore/groupsApi";
import {
  assignUnitsForAssignmentList,
  buildFfPairMap,
} from "../lib/ownershipUnits";
import {
  canSplitTournamentEvenly,
  isValidMemberCap,
  LOGICAL_BRACKET_SLOTS,
  PHYSICAL_TEAM_ID_COUNT,
  type GroupMemberCap,
} from "../lib/groupConstants";
import type { OwnershipRow } from "../lib/ownershipMap";
import { groupBracketPath, groupSettingsPath } from "../lib/groupPaths";

type Props = {
  uid: string;
  games: BracketGame[];
  allTeamIds: string[];
  teamsById: Map<string, Team>;
  results: Map<string, GameResult>;
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

export function GroupAssignmentPage({
  uid,
  games,
  allTeamIds,
  teamsById,
  results,
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
  /** Local toggle value before Save; null means use `groupDoc.autoAssignWhenFull`. */
  const [pendingAutoAssignWhenFull, setPendingAutoAssignWhenFull] = useState<
    boolean | null
  >(null);
  const [savingAllowEliminated, setSavingAllowEliminated] = useState(false);
  const [activeRegion, setActiveRegion] = useState("");
  const seededDefault = useRef(false);
  const prevLockedRef = useRef<boolean | null>(null);

  const ffPairMap = useMemo(() => buildFfPairMap(games), [games]);
  const tabRegions = useMemo(() => tabRegionsFromGames(games), [games]);

  const restrictToSurvivors = useMemo(
    () =>
      shouldRestrictToSurvivingTeams(
        groupDoc?.visibility ?? "public",
        groupDoc?.allowAssignEliminatedTeams
      ),
    [groupDoc?.visibility, groupDoc?.allowAssignEliminatedTeams]
  );

  const assignableTeamIds = useMemo(
    () =>
      assignableTeamIdsSet(allTeamIds, games, results, restrictToSurvivors),
    [allTeamIds, games, results, restrictToSurvivors]
  );

  const assignmentUnits = useMemo(
    () =>
      buildAssignmentOwnershipUnits(
        games,
        allTeamIds,
        teamsById,
        assignableTeamIds
      ),
    [games, allTeamIds, teamsById, assignableTeamIds]
  );

  const skeletonRows = useMemo(
    () => ownershipSkeletonFromAssignmentUnits(assignmentUnits),
    [assignmentUnits]
  );

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
    setPendingAutoAssignWhenFull(null);
  }, [groupId]);

  useEffect(() => {
    setPendingAutoAssignWhenFull(null);
  }, [groupDoc?.autoAssignWhenFull]);

  useEffect(() => {
    const locked = isOwnershipLocked(groupDoc, firestoreOwnRows.length);
    const prevLocked = prevLockedRef.current;
    prevLockedRef.current = locked;

    if (skeletonRows.length === 0) return;

    const reconciled = reconcileOwnershipToAssignmentSkeleton(
      firestoreOwnRows,
      skeletonRows
    );

    if (locked) {
      seededDefault.current = firestoreOwnRows.length > 0;
      setLocal(reconciled);
      return;
    }

    if (firestoreOwnRows.length === 0) {
      return;
    }

    const justUnlocked = prevLocked === true && !locked;
    setLocal((prev) => {
      if (justUnlocked) return reconciled;
      if (prev.length === 0) return reconciled;
      return prev;
    });
    seededDefault.current = true;
  }, [groupDoc, firestoreOwnRows, skeletonRows]);

  /** When the pool is full and auto-assign is off, show every surviving slot unassigned until an admin acts. */
  useEffect(() => {
    if (groupDoc === null) return;
    if (!ownershipReady || seededDefault.current) return;
    if (groupDoc.autoAssignWhenFull) return;
    if (!memberCap) return;
    if (allTeamIds.length !== PHYSICAL_TEAM_ID_COUNT) return;
    if (members.length !== memberCap) return;
    if (assignmentUnits.length === 0) return;
    if (assignmentUnits.length < memberCap) return;
    if (
      assignmentUnits.length === LOGICAL_BRACKET_SLOTS &&
      !canSplitTournamentEvenly(memberCap)
    ) {
      return;
    }
    setLocal(skeletonRows.map((r) => ({ ...r })));
    seededDefault.current = true;
  }, [
    ownershipReady,
    memberCap,
    allTeamIds,
    members,
    groupDoc,
    groupDoc?.autoAssignWhenFull,
    assignmentUnits,
    skeletonRows,
  ]);

  const assignmentsLocked = isOwnershipLocked(
    groupDoc,
    firestoreOwnRows.length
  );

  const hasSavedAssignments = firestoreOwnRows.length > 0;

  const assignmentSurvivorToggleLocked =
    hasSavedAssignments && anyBracketGameStarted(results);

  const dirty = useMemo(
    () => !ownershipRowsEqual(local, firestoreOwnRows),
    [local, firestoreOwnRows]
  );

  const showManualUi = !groupDoc?.autoAssignWhenFull;

  const savedAutoAssignWhenFull = Boolean(groupDoc?.autoAssignWhenFull);
  const effectiveAutoAssignWhenFull =
    pendingAutoAssignWhenFull !== null
      ? pendingAutoAssignWhenFull
      : savedAutoAssignWhenFull;
  const autoAssignSettingDirty =
    pendingAutoAssignWhenFull !== null &&
    pendingAutoAssignWhenFull !== savedAutoAssignWhenFull;

  const targetsPerRegion = useMemo(() => {
    if (!memberCap || assignmentUnits.length === 0)
      return new Map<string, number>();
    return fairTargetLogicalUnitsPerMemberPerRegionFromUnits(
      assignmentUnits,
      memberCap
    );
  }, [assignmentUnits, memberCap]);

  const countsOk = useMemo(() => {
    if (!memberCap || members.length !== memberCap) return false;
    if (local.some((r) => !String(r.user_id ?? "").trim())) return false;
    if (assignmentUnits.length === 0) return false;
    if (assignmentUnits.length < memberCap) return false;
    if (
      assignmentUnits.length === LOGICAL_BRACKET_SLOTS &&
      !canSplitTournamentEvenly(memberCap)
    ) {
      return false;
    }
    const uids = members.map((m) => m.uid);
    return validateAssignableOwnership(
      local,
      uids,
      memberCap,
      assignmentUnits,
      ffPairMap
    );
  }, [local, memberCap, members, assignmentUnits, ffPairMap]);

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
      if (allTeamIds.length !== PHYSICAL_TEAM_ID_COUNT) {
        setError(
          `Roster must have ${PHYSICAL_TEAM_ID_COUNT} team ids (found ${allTeamIds.length}).`
        );
        return;
      }
      if (assignmentUnits.length === 0) {
        setError("No assignable teams for the current bracket state.");
        return;
      }
      if (assignmentUnits.length < memberCap) {
        setError("Not enough surviving teams for each member to hold at least one.");
        return;
      }
      if (
        assignmentUnits.length === LOGICAL_BRACKET_SLOTS &&
        !canSplitTournamentEvenly(memberCap)
      ) {
        setError(
          "This group size cannot split the 64-slot bracket evenly. Use group size 2, 4, 8, 16, 32, or 64."
        );
        return;
      }
      const uids = members.map((m) => m.uid);
      const rows = assignUnitsForAssignmentList(
        assignmentUnits,
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
        "Assign every surviving team to a member (no empty slots). Each member must meet the fair-share targets for this bracket state (First Four pairs still share an owner when both are alive)."
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

  const handleAutoAssignToggle = (enabled: boolean) => {
    setError(null);
    setPendingAutoAssignWhenFull(enabled);
  };

  const handleSaveAutoAssignWhenFull = async () => {
    if (!groupDoc || pendingAutoAssignWhenFull === null) return;
    if (pendingAutoAssignWhenFull === savedAutoAssignWhenFull) return;
    setError(null);
    setSavingAutoAssign(true);
    try {
      await updateGroupAutoAssignWhenFull(
        db,
        groupId,
        uid,
        pendingAutoAssignWhenFull
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAutoAssign(false);
    }
  };

  const handleAllowEliminatedToggle = async (allow: boolean) => {
    if (assignmentSurvivorToggleLocked) return;
    setError(null);
    setSavingAllowEliminated(true);
    try {
      await updateGroupAllowAssignEliminatedTeams(db, groupId, uid, allow);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAllowEliminated(false);
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
        <div className="group-assign-v2-card-header-with-action">
          <h2
            id="auto-team-assign-page-h"
            className="group-assign-v2-card-title group-assign-v2-card-title--header-action"
          >
            Auto Team Assignment
          </h2>
          <button
            type="button"
            className="btn-primary group-assign-v2-lock-btn"
            disabled={
              !autoAssignSettingDirty || savingAutoAssign || !groupDoc
            }
            onClick={() => void handleSaveAutoAssignWhenFull()}
          >
            {savingAutoAssign ? "Saving…" : "Save"}
          </button>
        </div>
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
              checked={effectiveAutoAssignWhenFull}
              disabled={savingAutoAssign || !groupDoc}
              onChange={(e) => handleAutoAssignToggle(e.target.checked)}
            />
            <span className="group-settings-v2-toggle-track" aria-hidden />
            <span className="group-settings-v2-toggle-label">
              {effectiveAutoAssignWhenFull
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
            <br />
            Changes apply only after you click Save.
          </p>
        </div>
      </section>

      {groupDoc?.visibility === "private" ? (
        <section
          className="group-assign-v2-card"
          aria-labelledby="mid-tourney-assign-h"
        >
          <h2 id="mid-tourney-assign-h" className="group-assign-v2-card-title">
            Mid-tournament assignment
          </h2>
          <p className="group-assign-v2-desc">
            By default, teams that have already lost cannot be assigned—this
            keeps late-joining pools fair. Leave the option below{" "}
            <strong>on</strong> for that behavior. Turn it <strong>off</strong>{" "}
            only if you want the classic full 68-team draft including
            eliminated teams.
          </p>
          <div
            className={`group-settings-v2-toggle${savingAllowEliminated || !groupDoc ? " group-settings-v2-toggle--disabled" : ""}`}
          >
            <label
              htmlFor="assign-page-allow-eliminated"
              className="group-settings-v2-toggle-label-row"
            >
              <input
                id="assign-page-allow-eliminated"
                type="checkbox"
                role="switch"
                className="group-settings-v2-toggle-input"
                checked={!Boolean(groupDoc?.allowAssignEliminatedTeams)}
                disabled={
                  savingAllowEliminated ||
                  assignmentSurvivorToggleLocked ||
                  !groupDoc
                }
                onChange={(e) =>
                  void handleAllowEliminatedToggle(!e.target.checked)
                }
              />
              <span className="group-settings-v2-toggle-track" aria-hidden />
              <span className="group-settings-v2-toggle-label">
                {!groupDoc?.allowAssignEliminatedTeams
                  ? "Only surviving teams can be assigned (recommended)"
                  : "Eliminated teams can be assigned"}
              </span>
            </label>
            {assignmentSurvivorToggleLocked ? (
              <p className="group-settings-v2-toggle-help">
                Locked after teams are assigned and the tournament has started.
              </p>
            ) : (
              <p className="group-settings-v2-toggle-help">
                Public groups always use surviving teams only.
              </p>
            )}
          </div>
        </section>
      ) : null}

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
                              const got = logicalUnitsOwnedInRegionForUnits(
                                m.uid,
                                reg,
                                assignmentUnits,
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
                const { assigned, total } = regionSeedSlotProgressAssignable(
                  rows,
                  local,
                  assignableTeamIds
                );
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
                const rowHasAssignable = row.teamIds.some((tid) =>
                  assignableTeamIds.has(tid)
                );
                const rowAllEliminated =
                  row.teamIds.length > 0 && !rowHasAssignable;
                const assignTargetId = representativeTeamIdForAssignUi(
                  row,
                  assignableTeamIds
                );
                const disabled =
                  assignmentsLocked ||
                  rowAllEliminated ||
                  row.teamIds.length === 0 ||
                  !assignTargetId;
                const val = regionAssignRowSelectValue(row, local);
                const eliminatedSentinel = "__eliminated_bracket__";
                const selectValue = rowAllEliminated ? eliminatedSentinel : val;
                return (
                  <div key={row.key} className="group-assign-v2-row">
                    <span
                      className={`group-assign-v2-team-label${rowAllEliminated ? " group-assign-v2-team-label--eliminated" : ""}`}
                    >
                      {row.label}
                    </span>
                    <select
                      className="group-hub-input group-assign-v2-select"
                      value={selectValue}
                      disabled={disabled}
                      onChange={(e) =>
                        updateTeamOwner(assignTargetId, e.target.value)
                      }
                    >
                      {rowAllEliminated ? (
                        <option value={eliminatedSentinel}>Eliminated</option>
                      ) : (
                        <>
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.uid} value={m.uid}>
                              {m.displayName}
                            </option>
                          ))}
                        </>
                      )}
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
