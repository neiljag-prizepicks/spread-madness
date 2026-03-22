import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { GroupMemberCap } from "../groupConstants";

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
  firstName?: string;
  lastName?: string;
  joinedAt: Timestamp;
};

/** Legacy docs may still have `name` instead of firstName/lastName. */
export type MemberDocWithLegacy = MemberDoc & { name?: string };

export function firstLastFromMemberDoc(
  d: MemberDocWithLegacy
): { first_name: string; last_name: string } {
  let first_name = typeof d.firstName === "string" ? d.firstName.trim() : "";
  let last_name = typeof d.lastName === "string" ? d.lastName.trim() : "";
  if (!first_name && !last_name && typeof d.name === "string" && d.name.trim()) {
    const parts = d.name.trim().split(/\s+/).filter(Boolean);
    first_name = parts[0] ?? "";
    last_name = parts.length > 1 ? parts.slice(1).join(" ") : "";
  }
  return { first_name, last_name };
}

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

/**
 * Non-admin leaves any public or private group (same rules as leaving from the hub for public groups).
 * Admins must use group admin tools or {@link leaveGroupAsAdminWithCoAdmins}.
 */
export async function leaveGroupAsMember(
  firestore: Firestore,
  groupId: string,
  uid: string
): Promise<void> {
  const gRef = doc(firestore, "groups", groupId);
  const mRef = doc(firestore, "groups", groupId, "members", uid);

  const mSnap = await getDoc(mRef);
  if (!mSnap.exists()) throw new Error("You're not in this group.");
  const member = mSnap.data() as MemberDoc;
  if (member.role === "admin") {
    throw new Error(
      "Group admins can't leave from here. Use Group settings or delete the group from My groups."
    );
  }

  const ownershipQ = query(
    collection(firestore, "groups", groupId, "ownership"),
    where("userId", "==", uid)
  );
  const ownSnap = await getDocs(ownershipQ);
  if (!ownSnap.empty) {
    throw new Error(
      "You still have teams assigned in this group. Reassign them in Assign teams before leaving."
    );
  }

  await runTransaction(firestore, async (transaction) => {
    const gT = await transaction.get(gRef);
    const mT = await transaction.get(mRef);
    if (!gT.exists() || !mT.exists()) {
      throw new Error("Could not leave the group. Try again.");
    }
    const gData = gT.data() as GroupDoc;
    if ((mT.data() as MemberDoc).role === "admin") {
      throw new Error(
        "Group admins can't leave from here. Use Group settings or delete the group from My groups."
      );
    }
    if (gData.memberCount < 1) {
      throw new Error("Group data is inconsistent.");
    }
    transaction.update(gRef, { memberCount: increment(-1) });
    transaction.delete(mRef);
    transaction.delete(doc(firestore, "users", uid, "groups", groupId));
  });
}

/** Member leaves a public group (not available for admins — use group settings). */
export async function leavePublicGroup(
  firestore: Firestore,
  groupId: string,
  uid: string
): Promise<void> {
  const gRef = doc(firestore, "groups", groupId);
  const gSnap = await getDoc(gRef);
  if (!gSnap.exists()) throw new Error("Group not found.");
  const group = gSnap.data() as GroupDoc;
  if (group.visibility !== "public") {
    throw new Error("Only public groups can be left from here.");
  }
  await leaveGroupAsMember(firestore, groupId, uid);
}

/** Admin leaves when at least one other admin exists; fails if user still has teams assigned. */
export async function leaveGroupAsAdminWithCoAdmins(
  firestore: Firestore,
  groupId: string,
  uid: string
): Promise<void> {
  const membersSnap = await getDocs(
    collection(firestore, "groups", groupId, "members")
  );
  const adminCount = membersSnap.docs.filter(
    (d) => (d.data() as MemberDoc).role === "admin"
  ).length;
  const selfDoc = membersSnap.docs.find((d) => d.id === uid);
  if (!selfDoc || (selfDoc.data() as MemberDoc).role !== "admin") {
    throw new Error("You are not an admin of this group.");
  }
  if (adminCount <= 1) {
    throw new Error(
      "You are the only admin. Delete the group from My groups or promote another admin first."
    );
  }

  const ownershipQ = query(
    collection(firestore, "groups", groupId, "ownership"),
    where("userId", "==", uid)
  );
  const ownSnap = await getDocs(ownershipQ);
  if (!ownSnap.empty) {
    throw new Error(
      "You still have teams assigned in this group. Reassign them in Assign teams before leaving."
    );
  }

  const gRef = doc(firestore, "groups", groupId);
  await runTransaction(firestore, async (transaction) => {
    const gSnap = await transaction.get(gRef);
    if (!gSnap.exists()) throw new Error("Group not found.");
    transaction.update(gRef, { memberCount: increment(-1) });
    transaction.delete(doc(firestore, "groups", groupId, "members", uid));
    transaction.delete(doc(firestore, "users", uid, "groups", groupId));
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

/** Live group document (visibility, join code/password, counts). */
export function subscribeGroupDocument(
  firestore: Firestore,
  groupId: string,
  onNext: (data: GroupDoc | null) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(firestore, "groups", groupId),
    (snap) => {
      if (!snap.exists()) {
        onNext(null);
        return;
      }
      onNext(snap.data() as GroupDoc);
    },
    onError
  );
}

export async function updatePrivateGroupPassword(
  firestore: Firestore,
  groupId: string,
  adminUid: string,
  newPassword: string
): Promise<void> {
  const trimmed = newPassword.trim();
  if (!trimmed) throw new Error("Password cannot be empty.");

  const adminRef = doc(firestore, "groups", groupId, "members", adminUid);
  const adminSnap = await getDoc(adminRef);
  if (!adminSnap.exists() || (adminSnap.data() as MemberDoc).role !== "admin") {
    throw new Error("Only group admins can change the password.");
  }

  const gRef = doc(firestore, "groups", groupId);
  const gSnap = await getDoc(gRef);
  if (!gSnap.exists()) throw new Error("Group not found.");
  const g = gSnap.data() as GroupDoc;
  if (g.visibility !== "private") {
    throw new Error("This group is not private.");
  }

  await updateDoc(gRef, { joinPassword: trimmed });
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

/** Admin removes another member. Fails if the player still has teams in ownership. */
export async function removeGroupMember(
  firestore: Firestore,
  groupId: string,
  targetUid: string,
  adminUid: string
): Promise<void> {
  if (targetUid === adminUid) {
    throw new Error("You cannot remove yourself here.");
  }

  const adminRef = doc(firestore, "groups", groupId, "members", adminUid);
  const adminSnap = await getDoc(adminRef);
  if (!adminSnap.exists() || (adminSnap.data() as MemberDoc).role !== "admin") {
    throw new Error("Only group admins can remove members.");
  }

  const membersSnap = await getDocs(
    collection(firestore, "groups", groupId, "members")
  );
  const targetDoc = membersSnap.docs.find((d) => d.id === targetUid);
  if (!targetDoc) throw new Error("That player is not in this group.");

  const adminCount = membersSnap.docs.filter(
    (d) => (d.data() as MemberDoc).role === "admin"
  ).length;
  const targetRole = (targetDoc.data() as MemberDoc).role;
  if (targetRole === "admin" && adminCount <= 1) {
    throw new Error("Cannot remove the only admin.");
  }

  const ownershipQ = query(
    collection(firestore, "groups", groupId, "ownership"),
    where("userId", "==", targetUid)
  );
  const ownSnap = await getDocs(ownershipQ);
  if (!ownSnap.empty) {
    throw new Error(
      "This player still has teams assigned. Reassign their teams in Assign teams before removing them."
    );
  }

  const gRef = doc(firestore, "groups", groupId);
  await runTransaction(firestore, async (transaction) => {
    const gSnap = await transaction.get(gRef);
    if (!gSnap.exists()) throw new Error("Group not found.");
    transaction.update(gRef, { memberCount: increment(-1) });
    transaction.delete(doc(firestore, "groups", groupId, "members", targetUid));
    transaction.delete(doc(firestore, "users", targetUid, "groups", groupId));
  });
}

/** Deletes the group and all member links, ownership rows, and the group document. */
export async function deleteGroup(
  firestore: Firestore,
  groupId: string,
  adminUid: string
): Promise<void> {
  const adminRef = doc(firestore, "groups", groupId, "members", adminUid);
  const adminSnap = await getDoc(adminRef);
  if (!adminSnap.exists() || (adminSnap.data() as MemberDoc).role !== "admin") {
    throw new Error("Only group admins can delete the group.");
  }

  const membersSnap = await getDocs(
    collection(firestore, "groups", groupId, "members")
  );
  const ownershipSnap = await getDocs(
    collection(firestore, "groups", groupId, "ownership")
  );

  const refsToDelete: DocumentReference[] = [
    ...ownershipSnap.docs.map((d) => d.ref),
    ...membersSnap.docs.map((d) => d.ref),
    ...membersSnap.docs.map((d) =>
      doc(firestore, "users", d.id, "groups", groupId)
    ),
    doc(firestore, "groups", groupId),
  ];

  const chunkSize = 450;
  for (let i = 0; i < refsToDelete.length; i += chunkSize) {
    const batch = writeBatch(firestore);
    for (const ref of refsToDelete.slice(i, i + chunkSize)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}
