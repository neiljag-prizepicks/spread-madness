import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { requireDb } from "../lib/firebase";
import {
  deleteGroup,
  removeGroupMember,
  subscribeGroupDocument,
  subscribeGroupMembers,
  updatePrivateGroupPassword,
  type GroupDoc,
  type MemberDoc,
} from "../lib/firestore/groupsApi";
import { writeStoredActiveGroupId } from "../lib/activeGroupStorage";
import { groupAssignPath } from "../lib/groupPaths";

type Props = {
  uid: string;
};

function CopyClipboardIcon() {
  return (
    <svg
      className="group-settings-copy-svg"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="9"
        y="9"
        width="13"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsInviteCopyRow({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const display = value.trim() ? value : "—";
  const canCopy = Boolean(value.trim());

  const copy = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group-settings-value-row">
      <button
        type="button"
        className="group-settings-code group-settings-code--tap"
        onClick={() => void copy()}
        disabled={!canCopy}
        title={copied ? "Copied" : `Copy ${label}`}
      >
        {display}
      </button>
      <button
        type="button"
        className="group-settings-copy-icon-btn"
        onClick={() => void copy()}
        disabled={!canCopy}
        aria-label={`Copy ${label} to clipboard`}
        title="Copy to clipboard"
      >
        <CopyClipboardIcon />
      </button>
    </div>
  );
}

export function GroupLeagueSettingsPage({ uid }: Props) {
  const { groupId = "" } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const db = useMemo(() => requireDb(), []);

  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [groupDoc, setGroupDoc] = useState<GroupDoc | null>(null);
  const [members, setMembers] = useState<{ uid: string; data: MemberDoc }[]>(
    []
  );
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const unsub = subscribeGroupMembers(
      db,
      groupId,
      (rows) => {
        setMembers(rows);
        const me = rows.find((r) => r.uid === uid);
        setRole(me?.data.role ?? null);
      },
      (e) => setError(String(e.message))
    );
    return () => unsub();
  }, [db, groupId, uid]);

  useEffect(() => {
    const unsub = subscribeGroupDocument(
      db,
      groupId,
      setGroupDoc,
      (e) => setError(String(e.message))
    );
    return () => unsub();
  }, [db, groupId]);

  const adminCount = useMemo(
    () => members.filter((m) => m.data.role === "admin").length,
    [members]
  );

  const handleRemove = async (targetUid: string, displayName: string) => {
    if (
      !window.confirm(
        `Remove ${displayName} from this group? They will lose access to this group.`
      )
    ) {
      return;
    }
    setError(null);
    setRemovingId(targetUid);
    try {
      await removeGroupMember(db, groupId, targetUid, uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingId(null);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavingPassword(true);
    try {
      await updatePrivateGroupPassword(db, groupId, uid, newPassword);
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteGroup = async () => {
    const label = groupDoc?.name || "this group";
    if (
      !window.confirm(
        `Delete "${label}" permanently? All members will lose access and ownership data for this group will be removed. This cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteGroup(db, groupId, uid);
      writeStoredActiveGroupId(null);
      navigate("/groups", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  if (role === null) {
    return (
      <div className="group-hub">
        <p className="group-hub-muted">Checking access…</p>
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="group-hub">
        <p className="group-hub-error">Only group admins can manage group settings.</p>
        <Link to="/groups" className="btn-ghost">
          Back to groups
        </Link>
      </div>
    );
  }

  return (
    <div className="group-settings">
      <header className="group-hub-header">
        <h1 className="group-hub-title">Group settings</h1>
        {groupDoc?.name ? (
          <p className="group-hub-lede">{groupDoc.name}</p>
        ) : null}
      </header>

      {error ? (
        <div className="group-hub-error" role="alert">
          {error}
        </div>
      ) : null}

      {groupDoc?.visibility === "private" ? (
        <section
          className="group-settings-section"
          aria-labelledby="private-invite-h"
        >
          <h2 id="private-invite-h" className="group-hub-section-title">
            Private invite
          </h2>
          <p className="group-settings-desc">
            Share the join code and password so people can join from the groups
            home page until the group is full.
          </p>
          <dl className="group-settings-invite-dl">
            <div className="group-settings-invite-row">
              <dt>Join code</dt>
              <dd>
                <SettingsInviteCopyRow
                  value={groupDoc.joinCode || ""}
                  label="join code"
                />
              </dd>
            </div>
            <div className="group-settings-invite-row">
              <dt>Group password</dt>
              <dd>
                <SettingsInviteCopyRow
                  value={groupDoc.joinPassword || ""}
                  label="group password"
                />
              </dd>
            </div>
          </dl>
          <form className="group-settings-form" onSubmit={handleSavePassword}>
            <label className="group-hub-label">
              New password
              <input
                className="group-hub-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Enter a new group password"
              />
            </label>
            <button
              type="submit"
              className="btn-primary"
              disabled={savingPassword || !newPassword.trim()}
            >
              {savingPassword ? "Saving…" : "Update password"}
            </button>
          </form>
        </section>
      ) : null}

      <section
        className="group-settings-section"
        aria-labelledby="assign-teams-h"
      >
        <h2 id="assign-teams-h" className="group-hub-section-title">
          Assign teams
        </h2>
        <p className="group-settings-desc">
          Split tournament teams across members (First Four pairs stay together).
        </p>
        <Link className="btn-primary" to={groupAssignPath(groupId)}>
          Assign teams
        </Link>
      </section>

      <section
        className="group-settings-section"
        aria-labelledby="remove-players-h"
      >
        <h2 id="remove-players-h" className="group-hub-section-title">
          Remove players
        </h2>
        <p className="group-settings-desc">
          Players must have no teams assigned yet, or you need to reassign their
          teams in Assign teams first.
        </p>
        {members.length === 0 ? (
          <p className="group-hub-muted">No members loaded.</p>
        ) : (
          <ul className="group-settings-member-list">
            {members.map((m) => {
              const isSelf = m.uid === uid;
              const soleAdmin =
                m.data.role === "admin" && adminCount <= 1;
              const disableRemove = isSelf || soleAdmin;
              return (
                <li key={m.uid} className="group-settings-member-row">
                  <div>
                    <span className="group-settings-member-name">
                      {m.data.displayName}
                    </span>
                    <span className="group-settings-member-role">
                      {" "}
                      · {m.data.role === "admin" ? "Admin" : "Member"}
                      {isSelf ? " (you)" : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost btn-sm group-settings-remove"
                    disabled={disableRemove || removingId === m.uid}
                    onClick={() => void handleRemove(m.uid, m.data.displayName)}
                    title={
                      isSelf
                        ? "You cannot remove yourself here"
                        : soleAdmin
                          ? "Cannot remove the only admin"
                          : undefined
                    }
                  >
                    {removingId === m.uid ? "Removing…" : "Remove"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="group-settings-section group-settings-danger"
        aria-labelledby="delete-group-h"
      >
        <h2 id="delete-group-h" className="group-hub-section-title">
          Delete group
        </h2>
        <p className="group-settings-desc">
          Permanently delete this group for everyone. This removes member links
          and team ownership for this group.
        </p>
        <button
          type="button"
          className="group-settings-delete-btn"
          disabled={deleting}
          onClick={() => void handleDeleteGroup()}
        >
          {deleting ? "Deleting…" : "Delete group"}
        </button>
      </section>
    </div>
  );
}
