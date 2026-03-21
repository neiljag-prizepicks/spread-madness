import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import type { Team } from "../types";
import { requireDb } from "../lib/firebase";
import {
  buildRandomOwnership,
  setGroupOwnership,
  subscribeGroupMembers,
  subscribeGroupOwnership,
} from "../lib/firestore/groupsApi";
import {
  isValidMemberCap,
  teamsPerMember,
  type GroupMemberCap,
} from "../lib/groupConstants";
import type { OwnershipRow } from "../lib/ownershipMap";

function buildDefaultGrid(
  teamIds: string[],
  memberUids: string[],
  cap: GroupMemberCap
): OwnershipRow[] {
  const per = teamsPerMember(cap);
  const sortedTeams = [...teamIds].sort();
  const sortedMembers = [...memberUids].sort((a, b) => a.localeCompare(b));
  const rows: OwnershipRow[] = [];
  let t = 0;
  for (const muid of sortedMembers) {
    for (let k = 0; k < per; k++) {
      const tid = sortedTeams[t++];
      if (tid) rows.push({ user_id: muid, team_id: tid });
    }
  }
  return rows;
}

type Props = {
  uid: string;
  allTeamIds: string[];
  teamsById: Map<string, Team>;
};

export function GroupAssignmentPage({ uid, allTeamIds, teamsById }: Props) {
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
        setError("You are not in this pool.");
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
    if (!memberCap || allTeamIds.length !== 64) return;
    if (members.length !== memberCap) return;
    const uids = members.map((m) => m.uid);
    seededDefault.current = true;
    setLocal(buildDefaultGrid(allTeamIds, uids, memberCap));
  }, [ownershipReady, memberCap, allTeamIds, members]);

  const countsOk = useMemo(() => {
    if (!memberCap || members.length !== memberCap) return false;
    const per = teamsPerMember(memberCap);
    const byUser = new Map<string, number>();
    for (const m of members) byUser.set(m.uid, 0);
    for (const r of local) {
      byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
    }
    for (const [, n] of byUser) {
      if (n !== per) return false;
    }
    const teams = new Set(local.map((r) => r.team_id));
    return teams.size === 64;
  }, [local, memberCap, members]);

  const handleRandomize = () => {
    setError(null);
    try {
      if (!memberCap || members.length !== memberCap) {
        setError(
          `Pool needs exactly ${memberCap ?? "?"} members before randomizing.`
        );
        return;
      }
      const uids = members.map((m) => m.uid);
      const rows = buildRandomOwnership(allTeamIds, uids, memberCap);
      setLocal(rows.map((r) => ({ user_id: r.user_id, team_id: r.team_id })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSave = async () => {
    if (!countsOk) {
      setError("Each member must have the correct number of unique teams.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setGroupOwnership(db, groupId, local);
      navigate("/bracket", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateTeamOwner = (teamId: string, userId: string) => {
    setLocal((prev) =>
      prev.map((r) =>
        r.team_id === teamId ? { ...r, user_id: userId } : r
      )
    );
  };

  if (role !== "admin") {
    return (
      <div className="group-hub">
        {role === null ? (
          <p className="group-hub-muted">Checking access…</p>
        ) : (
          <>
            <p className="group-hub-error">Only pool admins can assign teams.</p>
            <Link to="/groups" className="btn-ghost">
              Back to pools
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
          Each team goes to exactly one person. Everyone should have{" "}
          {memberCap ? teamsPerMember(memberCap) : "—"} teams when the pool is
          full ({memberCap ?? "—"} members).
        </p>
        <div className="group-assign-toolbar">
          <button type="button" className="btn-ghost" onClick={handleRandomize}>
            Randomize (fair split)
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleSave()}
            disabled={!countsOk || saving}
          >
            {saving ? "Saving…" : "Save & go to bracket"}
          </button>
          <Link to="/groups" className="btn-ghost">
            Back
          </Link>
        </div>
      </header>

      {error ? (
        <div className="group-hub-error" role="alert">
          {error}
        </div>
      ) : null}

      {members.length > 0 &&
      memberCap &&
      members.length !== memberCap ? (
        <p className="group-hub-error">
          Waiting for {memberCap - members.length} more member(s) before
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
