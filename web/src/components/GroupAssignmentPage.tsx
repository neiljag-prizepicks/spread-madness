import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import type { BracketGame, Team } from "../types";
import { requireDb } from "../lib/firebase";
import {
  setGroupOwnership,
  subscribeGroupMembers,
  subscribeGroupOwnership,
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
  /** After first Firestore ownership snapshot (may be empty). */
  const [ownershipReady, setOwnershipReady] = useState(false);
  const seededDefault = useRef(false);

  const ffPairMap = useMemo(() => buildFfPairMap(games), [games]);

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
    const unsub = subscribeGroupOwnership(
      db,
      groupId,
      (rows) => {
        setOwnershipReady(true);
        if (rows.length > 0) {
          seededDefault.current = true;
          setLocal(rows);
        }
      },
      (e) => setError(String(e.message))
    );
    return () => unsub();
  }, [db, groupId]);

  useEffect(() => {
    if (!ownershipReady || seededDefault.current) return;
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
  }, [ownershipReady, memberCap, allTeamIds, members, games, teamsById]);

  const countsOk = useMemo(() => {
    if (!memberCap || members.length !== memberCap) return false;
    if (!canSplitTournamentEvenly(memberCap)) return false;
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

  /** Same condition as the “Waiting for … more member(s)” line — group not full yet. */
  const waitingForMoreMembers = Boolean(
    members.length > 0 &&
      memberCap != null &&
      members.length !== memberCap
  );

  const handleRandomize = () => {
    setError(null);
    try {
      if (!memberCap || members.length !== memberCap) {
        setError(
          `Group needs exactly ${memberCap ?? "?"} members before randomizing.`
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

  const handleSave = async () => {
    if (!countsOk) {
      setError(
        `Each member must have the correct number of logical bracket slots (${PHYSICAL_TEAM_ID_COUNT} team ids total, First Four pairs count as one slot each), and play-in opponents must share an owner.`
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

  const updateTeamOwner = (teamId: string, userId: string) => {
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
            <Link to="/groups" className="btn-ghost">
              Back to groups
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="group-assign">
      <header className="group-hub-header">
        <h1 className="group-hub-title">Assign teams</h1>
        <p className="group-hub-lede">
          First Four opponents stay together (same owner). Each play-in game
          counts as one bracket slot (two team ids). Fair split: everyone gets{" "}
          {memberCap && canSplitTournamentEvenly(memberCap)
            ? teamsPerMember(memberCap)
            : "—"}{" "}
          logical slots when the group is full ({memberCap ?? "—"} members).
          People with play-in games may have more team rows than others—that is
          expected.
        </p>
        <div className="group-assign-toolbar">
          <button type="button" className="btn-ghost" onClick={handleRandomize}>
            Randomize (fair split)
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleSave()}
            disabled={!countsOk || saving || waitingForMoreMembers}
          >
            {saving ? "Saving…" : "Save & go to bracket"}
          </button>
          <Link to={groupSettingsPath(groupId)} className="btn-ghost">
            League settings
          </Link>
        </div>
      </header>

      {error ? (
        <div className="group-hub-error" role="alert">
          {error}
        </div>
      ) : null}

      {waitingForMoreMembers ? (
        <p className="group-hub-error">
          Waiting for {(memberCap ?? 0) - members.length} more member(s) before
          assignment is valid.
        </p>
      ) : null}

      <div className="group-assign-grid">
        {local.map((r) => {
          const team = teamsById.get(r.team_id);
          return (
            <label key={r.team_id} className="group-assign-row">
              <span className="group-assign-team">
                {team
                  ? `${team.school} (${r.team_id})`
                  : r.team_id}
              </span>
              <select
                className="group-hub-input group-assign-select"
                value={r.user_id}
                onChange={(e) => updateTeamOwner(r.team_id, e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
