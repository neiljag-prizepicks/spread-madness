import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { GroupMemberCap } from "../groupConstants";
import { teamsPerMember } from "../groupConstants";

export type GroupVisibility = "public" | "private";

export type GroupDoc = {
  name: string;
  memberCap: GroupMemberCap;
  visibility: GroupVisibility;
  /** Uppercase code for private groups; empty for public. */
  joinCode: string;
  joinPassword: string;
  createdBy: string;
  createdAt: Timestamp;
  memberCount: number;
  maxMembers: number;
};

export type MemberDoc = {
  role: "admin" | "member";
  displayName: string;
  joinedAt: Timestamp;
};

export type UserGroupLinkDoc = {
  groupId: string;
  role: "admin" | "member";
  name: string;
  memberCap: number;
  visibility: GroupVisibility;
  joinedAt: Timestamp;
};

export async function createGroup(
  firestore: Firestore,
  uid: string,
  displayName: string,
  params: {
    name: string;
    memberCap: GroupMemberCap;
    visibility: GroupVisibility;
    joinCode: string;
    joinPassword: string;
  }
): Promise<string> {
  const code =
    params.visibility === "private"
      ? params.joinCode.trim().toUpperCase()
      : "";
  if (params.visibility === "private") {
    if (code.length < 4) throw new Error("Join code must be at least 4 characters.");
    if (!params.joinPassword.trim()) throw new Error("Password is required for private groups.");
    const q = query(
      collection(firestore, "groups"),
      where("joinCode", "==", code),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) throw new Error("That join code is already taken.");
  }

  const groupRef = doc(collection(firestore, "groups"));
  const groupId = groupRef.id;
  const now = Timestamp.now();

  await runTransaction(firestore, async (transaction) => {
    transaction.set(groupRef, {
      name: params.name.trim(),
      memberCap: params.memberCap,
      visibility: params.visibility,
      joinCode: code,
      joinPassword:
        params.visibility === "private" ? params.joinPassword : "",
      createdBy: uid,
      createdAt: now,
      memberCount: 1,
      maxMembers: params.memberCap,
    } satisfies GroupDoc);

    transaction.set(doc(firestore, "groups", groupId, "members", uid), {
      role: "admin",
      displayName,
      joinedAt: now,
    } satisfies MemberDoc);

    transaction.set(doc(firestore, "users", uid, "groups", groupId), {
      groupId,
      role: "admin",
      name: params.name.trim(),
      memberCap: params.memberCap,
      visibility: params.visibility,
      joinedAt: now,
    } satisfies UserGroupLinkDoc);
  });

  return groupId;
}

export async function joinPublicGroup(
  firestore: Firestore,
  groupId: string,
  uid: string,
  displayName: string
): Promise<void> {
  const gRef = doc(firestore, "groups", groupId);
  await runTransaction(firestore, async (transaction) => {
    const gSnap = await transaction.get(gRef);
    if (!gSnap.exists()) throw new Error("Group not found.");
    const data = gSnap.data() as GroupDoc;
    if (data.visibility !== "public") throw new Error("This group is not public.");
    if (data.memberCount >= data.maxMembers) throw new Error("This group is full.");
    const mRef = doc(firestore, "groups", groupId, "members", uid);
    const mSnap = await transaction.get(mRef);
    if (mSnap.exists()) throw new Error("You are already in this group.");

    transaction.update(gRef, { memberCount: increment(1) });
    transaction.set(mRef, {
      role: "member",
      displayName,
      joinedAt: Timestamp.now(),
    } satisfies MemberDoc);
    transaction.set(doc(firestore, "users", uid, "groups", groupId), {
      groupId,
      role: "member",
      name: data.name,
      memberCap: data.memberCap,
      visibility: data.visibility,
      joinedAt: Timestamp.now(),
    } satisfies UserGroupLinkDoc);
  });
}

export async function joinPrivateGroup(
  firestore: Firestore,
  joinCode: string,
  password: string,
  uid: string,
  displayName: string
): Promise<string> {
  const code = joinCode.trim().toUpperCase();
  const q = query(
    collection(firestore, "groups"),
    where("joinCode", "==", code),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) throw new Error("No group found with that code.");
  const gDoc = snap.docs[0];
  const groupId = gDoc.id;
  const data = gDoc.data() as GroupDoc;
  if (data.visibility !== "private") throw new Error("Invalid group.");
  if (data.joinPassword !== password) throw new Error("Incorrect password.");

  const gRef = doc(firestore, "groups", groupId);
  await runTransaction(firestore, async (transaction) => {
    const gSnap = await transaction.get(gRef);
    if (!gSnap.exists()) throw new Error("Group not found.");
    const g = gSnap.data() as GroupDoc;
    if (g.memberCount >= g.maxMembers) throw new Error("This group is full.");
    const mRef = doc(firestore, "groups", groupId, "members", uid);
    const mSnap = await transaction.get(mRef);
    if (mSnap.exists()) throw new Error("You are already in this group.");

    transaction.update(gRef, { memberCount: increment(1) });
    transaction.set(mRef, {
      role: "member",
      displayName,
      joinedAt: Timestamp.now(),
    } satisfies MemberDoc);
    transaction.set(doc(firestore, "users", uid, "groups", groupId), {
      groupId,
      role: "member",
      name: g.name,
      memberCap: g.memberCap,
      visibility: g.visibility,
      joinedAt: Timestamp.now(),
    } satisfies UserGroupLinkDoc);
  });

  return groupId;
}

export async function fetchPublicGroups(
  firestore: Firestore
): Promise<{ id: string; data: GroupDoc }[]> {
  const q = query(
    collection(firestore, "groups"),
    where("visibility", "==", "public")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    data: d.data() as GroupDoc,
  }));
}

export function subscribeUserGroups(
  firestore: Firestore,
  uid: string,
  onNext: (rows: { id: string; data: UserGroupLinkDoc }[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(firestore, "users", uid, "groups"),
    (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as UserGroupLinkDoc,
      }));
      onNext(rows);
    },
    onError
  );
}

export function subscribeGroupOwnership(
  firestore: Firestore,
  groupId: string,
  onNext: (rows: { user_id: string; team_id: string }[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(firestore, "groups", groupId, "ownership"),
    (snap) => {
      const rows = snap.docs.map((d) => ({
        team_id: d.id,
        user_id: (d.data() as { userId: string }).userId,
      }));
      onNext(rows);
    },
    onError
  );
}

export function subscribeGroupMembers(
  firestore: Firestore,
  groupId: string,
  onNext: (rows: { uid: string; data: MemberDoc }[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(firestore, "groups", groupId, "members"),
    (snap) => {
      const rows = snap.docs.map((d) => ({
        uid: d.id,
        data: d.data() as MemberDoc,
      }));
      onNext(rows);
    },
    onError
  );
}

export async function setGroupOwnership(
  firestore: Firestore,
  groupId: string,
  pairs: { team_id: string; user_id: string }[]
): Promise<void> {
  const batch = writeBatch(firestore);
  for (const { team_id, user_id } of pairs) {
    const ref = doc(firestore, "groups", groupId, "ownership", team_id);
    batch.set(ref, { userId: user_id });
  }
  await batch.commit();
}

/** Random fair split: shuffle teams, assign `teamsPerMember` consecutive slots per member (by stable uid sort). */
export function buildRandomOwnership(
  teamIds: string[],
  memberUids: string[],
  memberCap: GroupMemberCap
): { team_id: string; user_id: string }[] {
  const per = teamsPerMember(memberCap);
  if (teamIds.length !== 64) {
    throw new Error(`Expected 64 team ids, got ${teamIds.length}`);
  }
  if (memberUids.length !== memberCap) {
    throw new Error(
      `Need exactly ${memberCap} members to randomize; have ${memberUids.length}`
    );
  }
  const sortedMembers = [...memberUids].sort();
  const shuffled = [...teamIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const out: { team_id: string; user_id: string }[] = [];
  let idx = 0;
  for (const uid of sortedMembers) {
    for (let k = 0; k < per; k++) {
      out.push({ team_id: shuffled[idx++], user_id: uid });
    }
  }
  return out;
}
