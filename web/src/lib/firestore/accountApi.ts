import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { deleteUser, reload, updateProfile, type User } from "firebase/auth";
import {
  deleteGroup,
  firstLastFromMemberDoc,
  leaveGroupAsAdminWithCoAdmins,
  leaveGroupAsMember,
  type MemberDocWithLegacy,
} from "./groupsApi";

export async function fetchViewerProfileFromMemberships(
  firestore: Firestore,
  uid: string
): Promise<{ displayName: string; firstName: string; lastName: string }> {
  const linkSnap = await getDocs(collection(firestore, "users", uid, "groups"));
  if (linkSnap.empty) {
    return { displayName: "", firstName: "", lastName: "" };
  }
  const firstGroupId = linkSnap.docs[0].id;
  const mSnap = await getDoc(
    doc(firestore, "groups", firstGroupId, "members", uid)
  );
  if (!mSnap.exists()) return { displayName: "", firstName: "", lastName: "" };
  const m = mSnap.data() as MemberDocWithLegacy;
  const { first_name, last_name } = firstLastFromMemberDoc(m);
  return {
    displayName: m.displayName ?? "",
    firstName: first_name,
    lastName: last_name,
  };
}

export async function syncViewerDisplayName(
  firestore: Firestore,
  authUser: User,
  displayName: string
): Promise<void> {
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Display name is required.");

  await updateProfile(authUser, { displayName: trimmed });
  await reload(authUser);

  const linkSnap = await getDocs(
    collection(firestore, "users", authUser.uid, "groups")
  );
  if (linkSnap.empty) return;

  let batch = writeBatch(firestore);
  let n = 0;
  for (const d of linkSnap.docs) {
    const mRef = doc(firestore, "groups", d.id, "members", authUser.uid);
    batch.update(mRef, { displayName: trimmed });
    n++;
    if (n >= 450) {
      await batch.commit();
      batch = writeBatch(firestore);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

export async function syncViewerFirstLastName(
  firestore: Firestore,
  uid: string,
  firstName: string,
  lastName: string
): Promise<void> {
  const f = firstName.trim();
  const l = lastName.trim();
  const linkSnap = await getDocs(collection(firestore, "users", uid, "groups"));
  if (linkSnap.empty) return;

  let batch = writeBatch(firestore);
  let n = 0;
  for (const d of linkSnap.docs) {
    const mRef = doc(firestore, "groups", d.id, "members", uid);
    batch.update(mRef, {
      firstName: f ? f : deleteField(),
      lastName: l ? l : deleteField(),
      name: deleteField(),
    });
    n++;
    if (n >= 450) {
      await batch.commit();
      batch = writeBatch(firestore);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

/**
 * Removes the user from every group (deleting groups where they are the sole admin),
 * then deletes the Firebase Auth account. Requires a recent sign-in for `deleteUser`.
 */
export async function deleteAccountAndFirestoreMemberships(
  firestore: Firestore,
  authUser: User
): Promise<void> {
  const uid = authUser.uid;

  for (;;) {
    const linkSnap = await getDocs(collection(firestore, "users", uid, "groups"));
    if (linkSnap.empty) break;

    const groupId = linkSnap.docs[0].id;
    const mRef = doc(firestore, "groups", groupId, "members", uid);
    const mSnap = await getDoc(mRef);

    if (!mSnap.exists()) {
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, "users", uid, "groups", groupId));
      await batch.commit();
      continue;
    }

    const member = mSnap.data() as MemberDoc;

    if (member.role === "member") {
      await leaveGroupAsMember(firestore, groupId, uid);
    } else {
      const membersSnap = await getDocs(
        collection(firestore, "groups", groupId, "members")
      );
      const adminCount = membersSnap.docs.filter(
        (d) => (d.data() as MemberDoc).role === "admin"
      ).length;
      if (adminCount <= 1) {
        await deleteGroup(firestore, groupId, uid);
      } else {
        await leaveGroupAsAdminWithCoAdmins(firestore, groupId, uid);
      }
    }
  }

  await deleteUser(authUser);
}
