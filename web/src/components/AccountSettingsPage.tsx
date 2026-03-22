import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import type { User } from "firebase/auth";
import { requireDb } from "../lib/firebase";
import {
  deleteAccountAndFirestoreMemberships,
  fetchViewerProfileFromMemberships,
  syncViewerDisplayName,
  syncViewerFirstLastName,
} from "../lib/firestore/accountApi";

type Props = {
  uid: string;
  authUser: User;
  onProfileUpdated: () => void;
  onDeleted: () => void;
};

export function AccountSettingsPage({
  uid,
  authUser,
  onProfileUpdated,
  onDeleted,
}: Props) {
  const db = requireDb();
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [displaySaving, setDisplaySaving] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [displaySaved, setDisplaySaved] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [inLeagues, setInLeagues] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const linkSnap = await getDocs(collection(db, "users", uid, "groups"));
        const joined = !linkSnap.empty;
        if (cancelled) return;
        setInLeagues(joined);
        const fromMembers = joined
          ? await fetchViewerProfileFromMemberships(db, uid)
          : { displayName: "", firstName: "", lastName: "" };
        if (cancelled) return;
        const dn =
          authUser.displayName?.trim() ||
          fromMembers.displayName.trim() ||
          authUser.email?.trim() ||
          "";
        setDisplayName(dn);
        setFirstName(fromMembers.firstName);
        setLastName(fromMembers.lastName);
      } catch (e) {
        if (!cancelled) setLoadError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, uid, authUser]);

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setDisplaySaved(false);
    setDisplaySaving(true);
    try {
      await syncViewerDisplayName(db, authUser, displayName);
      onProfileUpdated();
      setDisplaySaved(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setDisplaySaving(false);
    }
  };

  const handleSaveNames = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNameSaved(false);
    if (!inLeagues) {
      setFormError(
        "Join a league first — your first and last name are stored with each league membership."
      );
      return;
    }
    setNameSaving(true);
    try {
      await syncViewerFirstLastName(db, uid, firstName, lastName);
      setNameSaved(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setNameSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    if (deletePhrase.trim().toUpperCase() !== "DELETE") {
      setDeleteError('Type the word DELETE (all caps) to confirm.');
      return;
    }
    setDeleteWorking(true);
    try {
      await deleteAccountAndFirestoreMemberships(db, authUser);
      onDeleted();
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code === "auth/requires-recent-login") {
        setDeleteError(
          "For security, sign out and sign in again, then try deleting your account."
        );
      } else {
        setDeleteError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setDeleteWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="account-settings-page">
        <p className="account-settings-muted">Loading account…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="account-settings-page">
        <p className="account-settings-error" role="alert">
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="account-settings-page">
      <p className="account-settings-lead">
        Your <strong>display name</strong> is what other players see in each
        league. <strong>First name</strong> and <strong>last name</strong> are
        optional; we use them for your initials in the bracket overview when both
        are set. Otherwise initials come from your display name.
      </p>

      {formError ? (
        <p className="account-settings-error" role="alert">
          {formError}
        </p>
      ) : null}

      <form className="account-settings-block" onSubmit={handleSaveDisplayName}>
        <h2 className="account-settings-heading">Display name</h2>
        <label className="account-settings-label" htmlFor="acct-display-name">
          Display name
        </label>
        <input
          id="acct-display-name"
          className="account-settings-input"
          type="text"
          value={displayName}
          onChange={(ev) => {
            setDisplayName(ev.target.value);
            setDisplaySaved(false);
          }}
          autoComplete="nickname"
          maxLength={80}
        />
        <div className="account-settings-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={displaySaving}
          >
            {displaySaving ? "Saving…" : "Save display name"}
          </button>
          {displaySaved ? (
            <span className="account-settings-saved">Saved.</span>
          ) : null}
        </div>
      </form>

      <form className="account-settings-block" onSubmit={handleSaveNames}>
        <h2 className="account-settings-heading">First and last name</h2>
        {!inLeagues ? (
          <p className="account-settings-muted">
            Join a league to save your name — it is stored on your membership
            in each league.
          </p>
        ) : null}
        <label className="account-settings-label" htmlFor="acct-first-name">
          First name
        </label>
        <input
          id="acct-first-name"
          className="account-settings-input"
          type="text"
          value={firstName}
          onChange={(ev) => {
            setFirstName(ev.target.value);
            setNameSaved(false);
          }}
          autoComplete="given-name"
          maxLength={80}
          placeholder="Optional"
          disabled={!inLeagues}
        />
        <label className="account-settings-label" htmlFor="acct-last-name">
          Last name
        </label>
        <input
          id="acct-last-name"
          className="account-settings-input"
          type="text"
          value={lastName}
          onChange={(ev) => {
            setLastName(ev.target.value);
            setNameSaved(false);
          }}
          autoComplete="family-name"
          maxLength={80}
          placeholder="Optional"
          disabled={!inLeagues}
        />
        <div className="account-settings-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={nameSaving || !inLeagues}
          >
            {nameSaving ? "Saving…" : "Save first and last name"}
          </button>
          {nameSaved ? (
            <span className="account-settings-saved">Saved.</span>
          ) : null}
        </div>
      </form>

      <section
        className="account-settings-block account-settings-block--danger"
        aria-labelledby="acct-delete-h"
      >
        <h2 id="acct-delete-h" className="account-settings-heading">
          Delete account
        </h2>
        <p className="account-settings-muted">
          This removes you from all leagues (and deletes any league where you
          are the only admin), then deletes your sign-in. This cannot be undone.
        </p>
        <label className="account-settings-label" htmlFor="acct-delete-confirm">
          Type <strong>DELETE</strong> to confirm
        </label>
        <input
          id="acct-delete-confirm"
          className="account-settings-input"
          type="text"
          value={deletePhrase}
          onChange={(ev) => setDeletePhrase(ev.target.value)}
          autoComplete="off"
          placeholder="DELETE"
        />
        {deleteError ? (
          <p className="account-settings-error" role="alert">
            {deleteError}
          </p>
        ) : null}
        <div className="account-settings-actions">
          <button
            type="button"
            className="account-settings-delete-btn"
            disabled={deleteWorking}
            onClick={() => void handleDeleteAccount()}
          >
            {deleteWorking ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </section>
    </div>
  );
}
