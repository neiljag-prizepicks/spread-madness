import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { BracketGame, Team } from "../types";
import {
  canSplitTournamentEvenly,
  isValidMemberCap,
  PHYSICAL_TEAM_ID_COUNT,
  type GroupMemberCap,
} from "./groupConstants";
import { buildBalancedOwnership } from "./ownershipUnits";
import type { GroupDoc, MemberDoc } from "./firestore/groupsApi";

/**
 * When there are saved ownership rows, assignments are read-only until an admin unlocks,
 * except while `ownershipLocked === false` (explicit unlock for editing).
 */
export function isOwnershipLocked(
  groupDoc: GroupDoc | null | undefined,
  persistedOwnershipRowCount: number
): boolean {
  if (persistedOwnershipRowCount === 0) return false;
  if (groupDoc?.ownershipLocked === false) return false;
  return true;
}

/**
 * If enabled on the group and the pool is full with no ownership yet, writes a fair
 * random assignment and locks ownership. Caller should be a group admin (verified).
 */
export async function tryCommitAutoAssignWhenFull(
  firestore: Firestore,
  groupId: string,
  adminUid: string,
  games: BracketGame[],
  allTeamIds: string[],
  teamsById: Map<string, Team>
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const adminRef = doc(firestore, "groups", groupId, "members", adminUid);
  const adminSnap = await getDoc(adminRef);
  if (!adminSnap.exists() || (adminSnap.data() as MemberDoc).role !== "admin") {
    return { ok: false, reason: "Only a group admin can run auto-assign." };
  }

  const gRef = doc(firestore, "groups", groupId);
  const gSnap = await getDoc(gRef);
  if (!gSnap.exists()) return { ok: false, reason: "Group not found." };
  const g = gSnap.data() as GroupDoc;

  if (!g.autoAssignWhenFull) {
    return { ok: false, reason: "Auto-assign is off." };
  }
  if (g.memberCount !== g.maxMembers) {
    return { ok: false, reason: "Group is not full." };
  }
  if (!isValidMemberCap(g.memberCap) || !canSplitTournamentEvenly(g.memberCap)) {
    return { ok: false, reason: "This group size cannot auto-assign evenly." };
  }

  const ownershipSnap = await getDocs(
    collection(firestore, "groups", groupId, "ownership")
  );
  if (!ownershipSnap.empty) {
    return { ok: false, reason: "Teams already assigned." };
  }

  const membersSnap = await getDocs(
    collection(firestore, "groups", groupId, "members")
  );
  if (membersSnap.size !== g.maxMembers) {
    return { ok: false, reason: "Member list does not match group size yet." };
  }

  if (allTeamIds.length !== PHYSICAL_TEAM_ID_COUNT) {
    return { ok: false, reason: "Tournament roster is not ready." };
  }

  const memberUids = membersSnap.docs.map((d) => d.id).sort((a, b) => a.localeCompare(b));
  const memberCap = g.memberCap as GroupMemberCap;

  let pairs: { team_id: string; user_id: string }[];
  try {
    pairs = buildBalancedOwnership(
      games,
      allTeamIds,
      teamsById,
      memberUids,
      memberCap,
      true
    );
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  const batch = writeBatch(firestore);
  batch.update(gRef, { ownershipLocked: true });
  for (const { team_id, user_id } of pairs) {
    const ref = doc(firestore, "groups", groupId, "ownership", team_id);
    batch.set(ref, { userId: user_id });
  }
  await batch.commit();

  return { ok: true };
}
