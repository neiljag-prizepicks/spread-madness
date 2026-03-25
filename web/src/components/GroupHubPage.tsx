import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type { BracketGame, GameResult, Team, User } from "../types";
import { requireDb } from "../lib/firebase";
import { buildGroupHubTeamBadges } from "../lib/groupHubTeamBadges";
import {
  GROUP_MEMBER_CAPS,
  isValidMemberCap,
  teamsPerMemberLabel,
  type GroupMemberCap,
} from "../lib/groupConstants";
import {
  createGroup,
  fetchPublicGroups,
  joinPrivateGroup,
  joinPublicGroup,
  leavePublicGroup,
  subscribeGroupOwnership,
  subscribeUserGroups,
  type GroupDoc,
  type GroupVisibility,
} from "../lib/firestore/groupsApi";
import type { OwnershipRow } from "../lib/ownershipMap";

import { PasswordFieldWithToggle } from "./PasswordFieldWithToggle";
import { writeStoredActiveGroupId } from "../lib/activeGroupStorage";
import { groupSettingsPath } from "../lib/groupPaths";
import type { GroupHubTeamBadgeStatus } from "../lib/groupHubTeamBadges";
import {
  parsePrizeStartRound,
  prizeStartRoundLabel,
} from "../lib/prizeStartRound";

type Props = {
  uid: string;
  displayName: string;
  onEnterGroup: (groupId: string) => void;
  games: BracketGame[];
  teams: Team[];
  results: Map<string, GameResult>;
  usersById: Map<string, User>;
};

function randomJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) out.push(chars[buf[i]! % chars.length]);
  return out.join("");
}

function teamAvatarClass(status: GroupHubTeamBadgeStatus): string {
  return `group-hub-team-avatar group-hub-team-avatar--${status}`;
}

function publicGroupSummaryLine(doc: GroupDoc): string {
  const parts: string[] = [];
  parts.push(teamsPerMemberLabel(doc.memberCap));
  const pr = parsePrizeStartRound(doc.prizeStartRound);
  parts.push(`Prizes in ${prizeStartRoundLabel(pr)}`);
  if (doc.autoAssignWhenFull) parts.push("Auto-assign teams");
  return parts.join(" • ");
}

type MyGroupRow = {
  id: string;
  name: string;
  memberCap: number;
  role: string;
  visibility: GroupVisibility;
};

export function GroupHubPage({
  uid,
  displayName,
  onEnterGroup,
  games,
  teams,
  results,
  usersById,
}: Props) {
  const { hubTab } = useParams<{ hubTab: string }>();
  const navigate = useNavigate();
  const db = useMemo(() => requireDb(), []);
  const teamsById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams]
  );
  const [myGroups, setMyGroups] = useState<MyGroupRow[]>([]);
  const [ownershipByGroup, setOwnershipByGroup] = useState<
    Record<string, OwnershipRow[]>
  >({});
  const [publicGroups, setPublicGroups] = useState<
    { id: string; data: GroupDoc }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createCap, setCreateCap] = useState<GroupMemberCap>(2);
  const [createVis, setCreateVis] = useState<"public" | "private">("public");
  const [createCode, setCreateCode] = useState(() => randomJoinCode());
  const [createPass, setCreatePass] = useState("");

  const [privCode, setPrivCode] = useState("");
  const [privPass, setPrivPass] = useState("");

  /** Public Join / Joined button async guard */
  const [publicActionGroupId, setPublicActionGroupId] = useState<string | null>(
    null
  );

  /** Live member counts from each group document (user link docs don't include these). */
  const [groupMemberFill, setGroupMemberFill] = useState<
    Record<string, { memberCount: number; maxMembers: number }>
  >({});

  const myGroupIdsKey = useMemo(
    () => myGroups.map((g) => g.id).sort().join("|"),
    [myGroups]
  );

  useEffect(() => {
    if (!myGroupIdsKey) {
      setOwnershipByGroup({});
      return;
    }
    const ids = myGroupIdsKey.split("|").filter(Boolean);
    setOwnershipByGroup({});
    const unsubs = ids.map((groupId) =>
      subscribeGroupOwnership(db, groupId, (rows) => {
        setOwnershipByGroup((prev) => ({ ...prev, [groupId]: rows }));
      })
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [db, myGroupIdsKey]);

  const badgeByGroupId = useMemo(() => {
    const m = new Map<
      string,
      ReturnType<typeof buildGroupHubTeamBadges>
    >();
    const now = Date.now();
    for (const g of myGroups) {
      const rows = ownershipByGroup[g.id] ?? [];
      m.set(
        g.id,
        buildGroupHubTeamBadges(
          uid,
          rows,
          games,
          results,
          teamsById,
          usersById,
          now
        )
      );
    }
    return m;
  }, [myGroups, ownershipByGroup, games, results, teamsById, usersById, uid]);

  /** Public marketplace: only groups with room (full groups live under My groups). */
  const openPublicGroups = useMemo(
    () =>
      publicGroups.filter((g) => g.data.memberCount < g.data.maxMembers),
    [publicGroups]
  );

  useEffect(() => {
    const firestore = db;
    if (!myGroupIdsKey) {
      setGroupMemberFill({});
      return;
    }
    const ids = myGroupIdsKey.split("|");
    setGroupMemberFill({});
    const unsubs = ids.map((groupId) =>
      onSnapshot(doc(firestore, "groups", groupId), (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() as GroupDoc;
        setGroupMemberFill((prev) => ({
          ...prev,
          [groupId]: {
            memberCount: d.memberCount,
            maxMembers: d.maxMembers,
          },
        }));
      })
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [db, myGroupIdsKey]);

  useEffect(() => {
    const unsub = subscribeUserGroups(
      db,
      uid,
      (rows) => {
        setMyGroups(
          rows.map((r) => ({
            id: r.id,
            name: r.data.name,
            memberCap: r.data.memberCap,
            role: r.data.role,
            visibility: r.data.visibility,
          }))
        );
        setLoading(false);
      },
      (e) => {
        setError(String(e.message));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [db, uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPublicGroups(db);
        if (!cancelled) setPublicGroups(list);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const refreshPublic = async () => {
    try {
      setPublicGroups(await fetchPublicGroups(db));
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const id = await createGroup(db, uid, displayName, {
        name: createName,
        memberCap: createCap,
        visibility: createVis,
        joinCode: createVis === "private" ? createCode : "",
        joinPassword: createVis === "private" ? createPass : "",
      });
      writeStoredActiveGroupId(id);
      onEnterGroup(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePublicGroupAction = async (groupId: string) => {
    const membership = myGroups.find((m) => m.id === groupId);
    setError(null);
    if (membership) {
      if (membership.role === "admin") {
        setError(
          "You're the admin of this group. Open it from My groups to manage or delete the group."
        );
        return;
      }
      setPublicActionGroupId(groupId);
      try {
        await leavePublicGroup(db, groupId, uid);
        setPublicGroups(await fetchPublicGroups(db));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPublicActionGroupId(null);
      }
      return;
    }

    setPublicActionGroupId(groupId);
    try {
      await joinPublicGroup(db, groupId, uid, displayName);
      writeStoredActiveGroupId(groupId);
      onEnterGroup(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublicActionGroupId(null);
    }
  };

  const firstName = useMemo(() => {
    const t = displayName.trim();
    if (!t) return "";
    return t.split(/\s+/)[0] ?? "";
  }, [displayName]);

  const handleJoinPrivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const id = await joinPrivateGroup(
        db,
        privCode,
        privPass,
        uid,
        displayName
      );
      writeStoredActiveGroupId(id);
      onEnterGroup(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (hubTab !== "my" && hubTab !== "create" && hubTab !== "join") {
    return <Navigate to="/groups/my" replace />;
  }

  if (loading && myGroups.length === 0) {
    return (
      <div className="group-hub group-hub--figma">
        <p className="group-hub-muted">Loading your groups…</p>
      </div>
    );
  }

  return (
    <div className="group-hub group-hub--figma">
      <h1 className="sr-only">
        {hubTab === "my"
          ? "My Groups"
          : hubTab === "create"
            ? "Create Group"
            : "Join Group"}
      </h1>

      {error ? (
        <div className="group-hub-error" role="alert">
          {error}
        </div>
      ) : null}

      {hubTab === "my" ? (
        <>
          {myGroups.length === 0 ? (
            <div className="group-hub-empty-hero group-hub-empty-hero--figma-sheet">
              <div className="group-hub-empty-hero-visual" aria-hidden>
                <img
                  src="/groups-empty-state-figma.png"
                  alt=""
                  width={150}
                  height={150}
                  className="group-hub-empty-hero-img"
                  decoding="async"
                />
              </div>
              <div className="group-hub-empty-hero-sheet-inner">
                <h2 className="group-hub-empty-hero-title">A new way to play...</h2>
                <div className="group-hub-empty-hero-copy">
                  <p className="group-hub-empty-hero-body">
                    Welcome{firstName ? `, ${firstName}` : ""}! You are not part of
                    any groups yet. Join or create a group to spread the madness!
                  </p>
                  <p className="group-hub-empty-hero-rules">
                    New here? Need a rules refresher? Checkout the{" "}
                    <Link
                      to="/rules#game-rules-h"
                      className="group-hub-rules-link group-hub-rules-link--on-dark"
                    >
                      rules
                    </Link>{" "}
                    page.
                  </p>
                </div>
                <div className="group-hub-empty-hero-cta-row">
                  <button
                    type="button"
                    className="btn-primary group-hub-empty-hero-cta"
                    onClick={() => navigate("/groups/join", { replace: true })}
                  >
                    Join a group
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ul className="group-hub-list group-hub-list--lineup">
              {myGroups.map((g) => {
                const pack = badgeByGroupId.get(g.id);
                const badges = pack?.badges ?? [];
                const overflow = pack?.overflow ?? 0;
                const teamNamesLine = pack?.teamNamesLine ?? "";
                const controlCount = pack?.teamsInControlCount ?? 0;
                return (
                  <li key={g.id} className="group-hub-lineup-card group-hub-lineup-card--tap-enter">
                    <button
                      type="button"
                      className="group-hub-lineup-card-hit"
                      aria-label={`Open group ${g.name}`}
                      onClick={() => {
                        writeStoredActiveGroupId(g.id);
                        onEnterGroup(g.id);
                      }}
                    />
                    <div className="group-hub-lineup-card-surface">
                    <div className="group-hub-lineup-top">
                      <div className="group-hub-lineup-head">
                        <div className="group-hub-card-name">{g.name}</div>
                        <div className="group-hub-card-meta group-hub-lineup-members">
                          {(() => {
                            const fill = groupMemberFill[g.id];
                            if (!fill) return "—";
                            return `${fill.memberCount}/${fill.maxMembers} members`;
                          })()}
                        </div>
                      </div>
                      <div className="group-hub-lineup-actions">
                        <Link
                          className="group-hub-trophy-link group-hub-lineup-settings-round"
                          to={groupSettingsPath(g.id)}
                          aria-label={`Group settings for ${g.name}`}
                          title="Group settings"
                        >
                          <svg
                            className="group-hub-trophy-icon group-hub-settings-gear-icon"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path
                              fill="currentColor"
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M11.0779 2.25C10.1613 2.25 9.37909 2.91265 9.22841 3.81675L9.04974 4.88873C9.02959 5.00964 8.93542 5.1498 8.75311 5.23747C8.40905 5.40292 8.07967 5.5938 7.7674 5.8076C7.60091 5.92159 7.43259 5.9332 7.31769 5.89015L6.29851 5.50833C5.44019 5.18678 4.4752 5.53289 4.01692 6.32666L3.09493 7.92358C2.63665 8.71736 2.8194 9.72611 3.52704 10.3087L4.36756 11.0006C4.46219 11.0785 4.53629 11.2298 4.52119 11.4307C4.50706 11.6188 4.49988 11.8086 4.49988 12C4.49988 12.1915 4.50707 12.3814 4.52121 12.5695C4.53632 12.7704 4.46221 12.9217 4.36758 12.9996L3.52704 13.6916C2.8194 14.2741 2.63665 15.2829 3.09493 16.0767L4.01692 17.6736C4.4752 18.4674 5.44019 18.8135 6.29851 18.4919L7.31791 18.11C7.43281 18.067 7.60113 18.0786 7.76761 18.1925C8.07982 18.4063 8.40913 18.5971 8.75311 18.7625C8.93542 18.8502 9.02959 18.9904 9.04974 19.1113L9.22841 20.1832C9.37909 21.0874 10.1613 21.75 11.0779 21.75H12.9219C13.8384 21.75 14.6207 21.0874 14.7713 20.1832L14.95 19.1113C14.9702 18.9904 15.0643 18.8502 15.2466 18.7625C15.5907 18.5971 15.9201 18.4062 16.2324 18.1924C16.3988 18.0784 16.5672 18.0668 16.6821 18.1098L17.7012 18.4917C18.5596 18.8132 19.5246 18.4671 19.9828 17.6733L20.9048 16.0764C21.3631 15.2826 21.1804 14.2739 20.4727 13.6913L19.6322 12.9994C19.5376 12.9215 19.4635 12.7702 19.4786 12.5693C19.4927 12.3812 19.4999 12.1914 19.4999 12C19.4999 11.8085 19.4927 11.6186 19.4785 11.4305C19.4634 11.2296 19.5375 11.0783 19.6322 11.0004L20.4727 10.3084C21.1804 9.72587 21.3631 8.71711 20.9048 7.92334L19.9828 6.32642C19.5246 5.53264 18.5596 5.18654 17.7012 5.50809L16.6818 5.89C16.5669 5.93304 16.3986 5.92144 16.2321 5.80746C15.9199 5.59371 15.5906 5.40289 15.2466 5.23747C15.0643 5.1498 14.9702 5.00964 14.95 4.88873L14.7713 3.81675C14.6207 2.91265 13.8384 2.25 12.9219 2.25H11.0779ZM12 15.75C14.0711 15.75 15.75 14.0711 15.75 12C15.75 9.92893 14.0711 8.25 12 8.25C9.92893 8.25 8.25 9.92893 8.25 12C8.25 14.0711 9.92893 15.75 12 15.75Z"
                            />
                          </svg>
                        </Link>
                      </div>
                    </div>
                    <div className="group-hub-lineup-divider" aria-hidden />
                    <div className="group-hub-lineup-bottom">
                      {badges.length > 0 || overflow > 0 ? (
                        <div className="group-hub-lineup-bottom-stack">
                          <div className="group-hub-lineup-avatars-row">
                            <div className="group-hub-lineup-players-names">
                              <div
                                className="group-hub-team-avatar-stack"
                                aria-label="Your teams in this pool"
                              >
                                {badges.map((b, i) => (
                                  <span
                                    key={b.teamId}
                                    className={teamAvatarClass(b.status)}
                                    style={{
                                      zIndex:
                                        badges.length +
                                        (overflow > 0 ? 1 : 0) -
                                        i,
                                    }}
                                    title={b.teamId}
                                  >
                                    <span className="group-hub-team-avatar-inner">
                                      {b.abbrev}
                                    </span>
                                  </span>
                                ))}
                                {overflow > 0 ? (
                                  <span
                                    className="group-hub-team-avatar group-hub-team-avatar--more"
                                    style={{ zIndex: 0 }}
                                  >
                                    <span className="group-hub-team-avatar-inner">
                                      +{overflow}
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                              {teamNamesLine ? (
                                <p
                                  className="group-hub-lineup-team-names"
                                  title={teamNamesLine}
                                >
                                  {teamNamesLine}
                                </p>
                              ) : null}
                            </div>
                            {controlCount > 0 ? (
                              <div
                                className="group-hub-lineup-control-block"
                                aria-label={`${controlCount} teams`}
                              >
                                <p className="group-hub-lineup-control-line1">
                                  <span className="group-hub-lineup-control-num">
                                    {controlCount}
                                  </span>{" "}
                                  <span className="group-hub-lineup-control-label">
                                    Teams
                                  </span>
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : games.length === 0 ? (
                        <p className="group-hub-lineup-caption group-hub-muted">
                          Bracket data loading…
                        </p>
                      ) : (
                        <p className="group-hub-lineup-caption group-hub-muted">
                          No assigned teams yet — open the group to pick
                          teams.
                        </p>
                      )}
                    </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}

      {hubTab === "create" ? (
        <form
          className="group-hub-form group-hub-form--panel group-hub-form--create"
          onSubmit={handleCreate}
          autoComplete="off"
        >
          <label className="group-hub-label">
            Group name
            <input
              className="group-hub-input"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
              maxLength={80}
              placeholder="Placeholder"
            />
          </label>
          <label className="group-hub-label">
            Group size
            <div className="group-hub-select-wrap">
              <select
                className="group-hub-input group-hub-select-native"
                value={createCap}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (isValidMemberCap(v)) setCreateCap(v);
                }}
              >
                {GROUP_MEMBER_CAPS.map((c) => (
                  <option key={c} value={c}>
                    {c} people · {teamsPerMemberLabel(c)} teams each
                  </option>
                ))}
              </select>
            </div>
          </label>
          <div className="group-hub-toggle-block">
            <div className="group-hub-toggle-copy">
              <span className="group-hub-toggle-title" id="group-hub-vis-label">
                {createVis === "public" ? "Public group" : "Private group"}
              </span>
              <p className="group-hub-toggle-desc" id="group-hub-vis-desc">
                {createVis === "public"
                  ? "Your group will be listed in the marketplace"
                  : "Invite members with a code + password"}
              </p>
            </div>
            <button
              type="button"
              className={`group-hub-switch${createVis === "public" ? " group-hub-switch--on" : ""}`}
              role="switch"
              aria-checked={createVis === "public"}
              aria-labelledby="group-hub-vis-label"
              aria-describedby="group-hub-vis-desc"
              onClick={() =>
                setCreateVis((v) => (v === "public" ? "private" : "public"))
              }
            >
              <span className="group-hub-switch-thumb" aria-hidden />
            </button>
          </div>
          {createVis === "private" ? (
            <>
              <label className="group-hub-label">
                Join code
                <div className="group-hub-adorned-field">
                  <input
                    className="group-hub-input group-hub-input--adorned"
                    value={createCode}
                    onChange={(e) =>
                      setCreateCode(e.target.value.toUpperCase())
                    }
                    required
                    minLength={4}
                    maxLength={12}
                    pattern="[A-Z0-9]+"
                    title="Letters and numbers only"
                  />
                  <button
                    type="button"
                    className="group-hub-adorned-btn"
                    onClick={() => setCreateCode(randomJoinCode())}
                    aria-label="Generate new join code"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      aria-hidden
                    >
                      <path
                        fill="currentColor"
                        d="M17.65 6.35A7.958 7.958 0 0012 4c-1.48 0-2.89.39-4.11 1.07l1.65 1.65A5.97 5.97 0 0112 6c3.31 0 6 2.69 6 6h-3l4 4 4-4h-3a7.99 7.99 0 00-6.35-8.65zM6.35 17.65A7.958 7.958 0 0012 20c1.48 0 2.89-.39 4.11-1.07l-1.65-1.65A5.97 5.97 0 0112 18c-3.31 0-6-2.69-6-6h3L5 8l-4 4h3a7.99 7.99 0 006.35 8.65z"
                      />
                    </svg>
                  </button>
                </div>
              </label>
              <label className="group-hub-label">
                Group password
                <PasswordFieldWithToggle
                  name="group-shared-secret"
                  value={createPass}
                  onChange={(e) => setCreatePass(e.target.value)}
                  required
                  placeholder="password"
                />
              </label>
            </>
          ) : null}
          <button type="submit" className="btn-primary group-hub-submit-wide">
            Create group
          </button>
        </form>
      ) : null}

      {hubTab === "join" ? (
        <>
          <p className="group-hub-muted group-hub-join-lede">
            Browse open public pools or enter a private code below.
          </p>

          <div className="group-hub-join-subsection">
            <div className="group-hub-section-head">
              <h2 className="group-hub-subsection-title">Public groups</h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={refreshPublic}
              >
                Refresh
              </button>
            </div>
            {openPublicGroups.length === 0 ? (
              <p className="group-hub-muted">
                No open public groups right now.
              </p>
            ) : (
              <ul className="group-hub-list group-hub-list--join-public">
                {openPublicGroups.map((g) => {
                  const membership = myGroups.find((m) => m.id === g.id);
                  const joined = !!membership;
                  const busy = publicActionGroupId === g.id;
                  return (
                    <li
                      key={g.id}
                      className="group-hub-lineup-card group-hub-lineup-card--public"
                    >
                      <div className="group-hub-lineup-top group-hub-lineup-top--public">
                        <div className="group-hub-lineup-head">
                          <div className="group-hub-card-name">{g.data.name}</div>
                          <div className="group-hub-lineup-members">
                            {g.data.memberCount}/{g.data.maxMembers} members
                          </div>
                        </div>
                        <div className="group-hub-lineup-actions">
                          <button
                            type="button"
                            className={`group-hub-join-plus${
                              joined ? " group-hub-join-plus--joined" : ""
                            }`}
                            disabled={busy}
                            onClick={() => void handlePublicGroupAction(g.id)}
                            aria-label={
                              joined
                                ? membership!.role === "admin"
                                  ? `Joined as admin: ${g.data.name}`
                                  : `Joined ${g.data.name} — tap to leave`
                                : `Join ${g.data.name}`
                            }
                          >
                            {joined ? (
                              <svg
                                className="group-hub-join-plus-icon"
                                viewBox="0 0 24 24"
                                aria-hidden
                              >
                                <path
                                  fill="currentColor"
                                  d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                                />
                              </svg>
                            ) : (
                              <>
                                <svg
                                  className="group-hub-join-plus-icon"
                                  viewBox="0 0 24 24"
                                  aria-hidden
                                >
                                  <path
                                    fill="currentColor"
                                    d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                                  />
                                </svg>
                                <span>Join</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="group-hub-lineup-divider" aria-hidden />
                      <div className="group-hub-lineup-bottom group-hub-lineup-bottom--join-public">
                        <p className="group-hub-join-public-summary">
                          {publicGroupSummaryLine(g.data)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="group-hub-join-subsection group-hub-join-subsection--private">
            <h2 className="group-hub-subsection-title group-hub-subsection-title--private-join">
              Private groups
            </h2>
            <form
              className="group-hub-form group-hub-form--panel group-hub-form--join-private"
              onSubmit={handleJoinPrivate}
              autoComplete="off"
            >
              <label className="group-hub-label">
                Join code
                <div className="group-hub-adorned-field">
                  <input
                    className="group-hub-input group-hub-input--adorned"
                    value={privCode}
                    onChange={(e) => setPrivCode(e.target.value.toUpperCase())}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="group-hub-adorned-btn"
                    onClick={() => setPrivCode("")}
                    aria-label="Reset join code"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      aria-hidden
                    >
                      <path
                        fill="currentColor"
                        d="M17.65 6.35A7.958 7.958 0 0012 4c-1.48 0-2.89.39-4.11 1.07l1.65 1.65A5.97 5.97 0 0112 6c3.31 0 6 2.69 6 6h-3l4 4 4-4h-3a7.99 7.99 0 00-6.35-8.65zM6.35 17.65A7.958 7.958 0 0012 20c1.48 0 2.89-.39 4.11-1.07l-1.65-1.65A5.97 5.97 0 0112 18c-3.31 0-6-2.69-6-6h3L5 8l-4 4h3a7.99 7.99 0 006.35 8.65z"
                      />
                    </svg>
                  </button>
                </div>
              </label>
              <label className="group-hub-label">
                Group password
                <PasswordFieldWithToggle
                  name="group-shared-secret-join"
                  value={privPass}
                  onChange={(e) => setPrivPass(e.target.value)}
                  placeholder="password"
                />
              </label>
              <button type="submit" className="btn-primary group-hub-submit-wide">
                Join private group
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
