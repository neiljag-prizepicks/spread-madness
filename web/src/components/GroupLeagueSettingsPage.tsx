import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { requireDb } from "../lib/firebase";
import { anyBracketGameStarted } from "../lib/bracketGameStarted";
import {
  deleteGroup,
  leaveGroupAsMember,
  removeGroupMember,
  subscribeGroupDocument,
  subscribeGroupMembers,
  subscribeGroupOwnership,
  updateGroupName,
  updateGroupPrizeStartRound,
  updatePrivateGroupPassword,
  type GroupDoc,
  type MemberDoc,
} from "../lib/firestore/groupsApi";
import { normalizeResultsFileObject } from "../lib/gameResult";
import {
  PRIZE_START_ROUND_OPTIONS,
  parsePrizeStartRound,
  type PrizeStartRound,
} from "../lib/prizeStartRound";
import type { GameResult } from "../types";
import { writeStoredActiveGroupId } from "../lib/activeGroupStorage";
import { groupAssignPath } from "../lib/groupPaths";
import { PasswordFieldWithToggle } from "./PasswordFieldWithToggle";

type Props = {
  uid: string;
};

function IconPencil({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  );
}

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

function IconUserPlus({ className }: { className?: string }) {
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
        d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H5v3H2v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
      />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M7 10l5 5 5-5H7z"
      />
    </svg>
  );
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
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

function IconPlus({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
      />
    </svg>
  );
}

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
  const [leaving, setLeaving] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [ownershipRows, setOwnershipRows] = useState<
    { user_id: string; team_id: string }[]
  >([]);
  const [bracketResults, setBracketResults] = useState<
    Map<string, GameResult>
  >(() => new Map());
  const [savingPrizeRound, setSavingPrizeRound] = useState(false);

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

  useEffect(() => {
    if (groupDoc?.name != null) setNameDraft(groupDoc.name);
  }, [groupDoc?.name]);

  useEffect(() => {
    const unsub = subscribeGroupOwnership(
      db,
      groupId,
      setOwnershipRows,
      (e) => setError(String(e.message))
    );
    return () => unsub();
  }, [db, groupId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/results.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((raw) => {
        if (!cancelled) setBracketResults(normalizeResultsFileObject(raw));
      })
      .catch(() => {
        if (!cancelled) setBracketResults(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.VITE_LIVE_POLL !== "1") return;
    const ms = Number(import.meta.env.VITE_LIVE_POLL_MS ?? 90_000);
    const tick = async () => {
      try {
        const r = await fetch(`/api/live/data?ts=${Date.now()}`);
        if (!r.ok) return;
        const data = (await r.json()) as { results?: unknown };
        if (data.results && typeof data.results === "object") {
          setBracketResults(normalizeResultsFileObject(data.results));
        }
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(() => void tick(), ms);
    void tick();
    return () => clearInterval(id);
  }, []);

  const adminCount = useMemo(
    () => members.filter((m) => m.data.role === "admin").length,
    [members]
  );

  const isAdmin = role === "admin";
  const nameDirty =
    groupDoc != null && nameDraft.trim() !== (groupDoc.name ?? "").trim();

  const waitingCount =
    groupDoc != null && groupDoc.memberCount < groupDoc.maxMembers
      ? groupDoc.maxMembers - groupDoc.memberCount
      : 0;

  const inviteSlotCount =
    groupDoc != null && groupDoc.maxMembers > 0
      ? Math.max(0, groupDoc.maxMembers - members.length)
      : 0;

  const teamsAssigned = ownershipRows.length > 0;
  const tournamentStarted = anyBracketGameStarted(bracketResults);
  const prizeRoundLocked = teamsAssigned && tournamentStarted;
  const prizeSelectDisabled = !isAdmin || prizeRoundLocked || savingPrizeRound;

  const handlePrizeStartChange = async (value: PrizeStartRound) => {
    if (!isAdmin || prizeRoundLocked) return;
    setError(null);
    setSavingPrizeRound(true);
    try {
      await updateGroupPrizeStartRound(db, groupId, uid, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPrizeRound(false);
    }
  };

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

  const handleLeaveGroup = async () => {
    const label = groupDoc?.name || "this group";
    if (
      !window.confirm(
        `Leave "${label}"? Your membership and access to this bracket will be removed. Other members are not affected. If you still have teams assigned, an admin must reassign them in Assign teams first or leaving will fail. You can only return by joining this group again.\n\nThis cannot be undone except by rejoining. Are you sure you want to continue?`
      )
    ) {
      return;
    }
    setLeaving(true);
    setError(null);
    try {
      await leaveGroupAsMember(db, groupId, uid);
      writeStoredActiveGroupId(null);
      navigate("/groups/my", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLeaving(false);
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
      navigate("/groups/my", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveName = async () => {
    if (!nameDraft.trim()) {
      setError("Group name cannot be empty.");
      return;
    }
    setError(null);
    setSavingName(true);
    try {
      await updateGroupName(db, groupId, uid, nameDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingName(false);
    }
  };

  if (role === null) {
    return (
      <div className="group-hub">
        <p className="group-hub-muted">Checking access…</p>
      </div>
    );
  }

  if (role !== "admin" && role !== "member") {
    return (
      <div className="group-hub">
        <p className="group-hub-error">You do not have access to this group.</p>
        <Link to="/groups/my" className="btn-ghost">
          Back to groups
        </Link>
      </div>
    );
  }

  return (
    <div className="group-settings group-settings-v2 group-settings-v2--figma-handoff">
      <header className="group-settings-v2-header">
        <h1 className="group-settings-v2-title">Group Settings</h1>
      </header>

      {error ? (
        <div className="group-hub-error group-settings-v2-banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <section
        className="group-settings-v2-card"
        aria-labelledby="group-name-h"
      >
        <h2 id="group-name-h" className="group-settings-v2-section-heading">
          Group Name
        </h2>
        {isAdmin ? (
          <div className="group-settings-v2-name-block">
            <label
              className="group-settings-v2-field-label-lg"
              htmlFor="group-settings-name"
            >
              Group Name
            </label>
            <div className="group-settings-v2-name-row group-settings-v2-name-row--figma">
              <div className="group-settings-v2-input-shell">
                <input
                  id="group-settings-name"
                  className="group-settings-v2-input-shell-field"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={80}
                  placeholder="Group name"
                  aria-label="Group name"
                />
                <button
                  type="button"
                  className="group-settings-v2-input-shell-btn"
                  aria-label="Focus group name field"
                  onClick={() =>
                    document.getElementById("group-settings-name")?.focus()
                  }
                >
                  <IconPencil />
                </button>
              </div>
              {nameDirty ? (
                <button
                  type="button"
                  className="btn-primary group-settings-v2-save-name"
                  disabled={savingName || !nameDraft.trim()}
                  onClick={() => void handleSaveName()}
                >
                  {savingName ? "Saving…" : "Save name"}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="group-settings-v2-name-readonly">{groupDoc?.name ?? "—"}</p>
        )}
      </section>

      {groupDoc?.visibility === "private" ? (
        <section
          className="group-settings-v2-card"
          aria-labelledby="prizes-h"
        >
          <h2 id="prizes-h" className="group-settings-v2-section-heading">
            Prizes
          </h2>
          <p className="group-settings-v2-desc group-settings-v2-desc--tight">
            View default prize structure and rules{" "}
            <Link
              to="/rules#prize-structure-h"
              className="group-settings-v2-inline-link"
            >
              here
            </Link>
            .
          </p>
          <div className="group-settings-v2-prize-field">
            <label
              className="group-settings-v2-kicker-label"
              htmlFor="prize-start-round"
            >
              Prizes start in
            </label>
            <div className="group-settings-v2-prize-select-wrap">
              <select
                id="prize-start-round"
                className="group-settings-v2-prize-select"
                value={parsePrizeStartRound(groupDoc?.prizeStartRound)}
                disabled={prizeSelectDisabled}
                aria-disabled={prizeSelectDisabled}
                onChange={(e) =>
                  void handlePrizeStartChange(e.target.value as PrizeStartRound)
                }
              >
                {PRIZE_START_ROUND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span
                className="group-settings-v2-prize-select-adorn"
                aria-hidden
              >
                {prizeSelectDisabled ? (
                  <IconLock className="group-settings-v2-prize-select-svg" />
                ) : (
                  <IconChevronDown className="group-settings-v2-prize-select-svg" />
                )}
              </span>
            </div>
            {!isAdmin ? (
              <p className="group-settings-v2-prize-footnote">
                Only admins can change this setting.
              </p>
            ) : prizeRoundLocked ? (
              <p className="group-settings-v2-prize-footnote">
                This can’t be changed after teams are assigned and the
                tournament has started.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {groupDoc?.visibility === "private" ? (
        <section
          className="group-settings-v2-card"
          aria-labelledby="private-invite-h"
        >
          <h2 id="private-invite-h" className="group-settings-v2-section-heading">
            Join code &amp; password
          </h2>
          <p className="group-settings-v2-desc">
            Share these so people can join from the groups home until the pool
            is full. Everyone in the group can copy; only admins can change the
            password.
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
          {isAdmin ? (
            <form
              className="group-settings-form"
              onSubmit={handleSavePassword}
              autoComplete="off"
            >
              <label className="group-hub-label">
                New password
                <PasswordFieldWithToggle
                  name="group-shared-secret"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
          ) : null}
        </section>
      ) : null}

      {isAdmin ? (
        <section
          className="group-settings-v2-card group-settings-v2-card--assign-teams"
          aria-labelledby="assign-teams-card-h"
        >
          <h2
            id="assign-teams-card-h"
            className="group-settings-v2-section-heading"
          >
            Assign teams
          </h2>
          {waitingCount > 0 ? (
            <div
              className="group-settings-v2-alert group-settings-v2-alert--amber"
              role="status"
              aria-live="polite"
            >
              <IconWarning className="group-settings-v2-alert-icon" />
              <p>
                Waiting for {waitingCount} more member
                {waitingCount === 1 ? "" : "s"} before assignment can be made
              </p>
            </div>
          ) : null}
          <div className="group-settings-v2-team-assign-block">
            <p className="group-settings-v2-subheading" id="team-assignment-h">
              Team assignment
            </p>
            <div
              className="group-settings-v2-assign-inline"
              aria-labelledby="team-assignment-h"
            >
              <p className="group-settings-v2-assign-inline-desc">
                Assign teams to group members.
              </p>
              <Link
                className="btn-primary group-settings-v2-assign-btn group-settings-v2-assign-btn--pill"
                to={groupAssignPath(groupId)}
              >
                <IconUserPlus className="group-settings-v2-assign-btn-icon" />
                Assign teams
              </Link>
            </div>
            <p className="group-settings-v2-assign-footnote">
              After you save on the Assign teams page, assignments lock until you
              unlock there.
            </p>
          </div>
        </section>
      ) : null}

      <section
        className="group-settings-v2-card"
        aria-labelledby="members-h"
      >
        <h2 id="members-h" className="group-settings-v2-section-heading">
          Members
        </h2>
        <p className="group-settings-v2-desc group-settings-v2-desc--after-heading">
          {isAdmin
            ? "Remove a player only if they have no teams assigned, or reassign their teams first in Assign teams."
            : "People in this pool. Only admins can remove members."}
        </p>
        {members.length === 0 && inviteSlotCount === 0 ? (
          <p className="group-hub-muted">No members loaded.</p>
        ) : (
          <ul className="group-settings-v2-member-slots" role="list">
            {members.map((m) => {
              const isSelf = m.uid === uid;
              const soleAdmin = m.data.role === "admin" && adminCount <= 1;
              const disableRemove = isSelf || soleAdmin;
              return (
                <li key={m.uid} className="group-settings-v2-member-slot">
                  <div className="group-settings-v2-member-slot-main">
                    <span className="group-settings-v2-member-slot-name">
                      {m.data.displayName}
                      {isSelf ? " (You)" : ""}
                    </span>
                    <span className="group-settings-v2-member-slot-role">
                      {m.data.role === "admin" ? "Admin" : "Member"}
                    </span>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      className={`group-settings-v2-slot-remove${disableRemove || removingId === m.uid ? " group-settings-v2-slot-remove--disabled" : ""}`}
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
                  ) : null}
                </li>
              );
            })}
            {Array.from({ length: inviteSlotCount }, (_, j) => {
              const inviteN = members.length + j + 1;
              return (
                <li
                  key={`invite-slot-${j}`}
                  className="group-settings-v2-member-slot group-settings-v2-member-slot--invite"
                >
                  <span className="group-settings-v2-member-slot-invite-label">
                    Invite Player {inviteN}
                  </span>
                  <span
                    className="group-settings-v2-member-slot-invite-icon"
                    aria-hidden
                  >
                    <IconPlus />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!isAdmin ? (
        <section
          className="group-settings-v2-card group-settings-danger"
          aria-labelledby="leave-group-member-h"
        >
          <h2 id="leave-group-member-h" className="group-settings-v2-section-heading">
            Leave group
          </h2>
          <p className="group-settings-v2-desc">
            Remove yourself from this group. You will lose access to its bracket
            until you join again. If you still have teams assigned, an admin must
            reassign them in Assign teams before you can leave.
          </p>
          <button
            type="button"
            className="group-settings-delete-btn"
            disabled={leaving}
            onClick={() => void handleLeaveGroup()}
          >
            {leaving ? "Leaving…" : "Leave group"}
          </button>
        </section>
      ) : null}

      {isAdmin ? (
        <section
          className="group-settings-v2-card group-settings-danger group-settings-v2-card--delete-inline"
          aria-labelledby="delete-group-h"
        >
          <h2 id="delete-group-h" className="group-settings-v2-section-heading">
            Delete group
          </h2>
          <div className="group-settings-v2-delete-row">
            <p className="group-settings-v2-desc group-settings-v2-desc--flush">
              Permanently delete this group for everyone. This removes member
              links and team ownership for this group.
            </p>
            <button
              type="button"
              className="group-settings-delete-btn group-settings-v2-delete-btn group-settings-v2-delete-btn--pill"
              disabled={deleting}
              onClick={() => void handleDeleteGroup()}
            >
              <IconTrash className="group-settings-v2-delete-icon" />
              {deleting ? "Deleting…" : "Delete group"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
