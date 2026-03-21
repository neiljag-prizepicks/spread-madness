import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { requireDb } from "../lib/firebase";
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
  subscribeUserGroups,
  type GroupDoc,
} from "../lib/firestore/groupsApi";

import { writeStoredActiveGroupId } from "../lib/activeGroupStorage";

type Props = {
  uid: string;
  displayName: string;
  onEnterGroup: (groupId: string) => void;
};

function randomJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) out.push(chars[buf[i]! % chars.length]);
  return out.join("");
}

export function GroupHubPage({ uid, displayName, onEnterGroup }: Props) {
  const db = useMemo(() => requireDb(), []);
  const [myGroups, setMyGroups] = useState<
    { id: string; name: string; memberCap: number; role: string }[]
  >([]);
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

  const handleJoinPublic = async (groupId: string) => {
    setError(null);
    try {
      await joinPublicGroup(db, groupId, uid, displayName);
      writeStoredActiveGroupId(groupId);
      onEnterGroup(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

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

  if (loading && myGroups.length === 0) {
    return (
      <div className="group-hub">
        <p className="group-hub-muted">Loading your groups…</p>
      </div>
    );
  }

  return (
    <div className="group-hub">
      <header className="group-hub-header">
        <h1 className="group-hub-title">Your pools</h1>
        <p className="group-hub-lede">
          Create a pool or join one. Ownership is separate per pool. Pool size
          sets how many logical bracket slots each person holds (64 ÷ members;
          First Four games count as one slot each).
        </p>
      </header>

      {error ? (
        <div className="group-hub-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="group-hub-section" aria-labelledby="my-groups-h">
        <h2 id="my-groups-h" className="group-hub-section-title">
          My pools
        </h2>
        {myGroups.length === 0 ? (
          <p className="group-hub-muted">You are not in any pool yet.</p>
        ) : (
          <ul className="group-hub-list">
            {myGroups.map((g) => (
              <li key={g.id} className="group-hub-card">
                <div>
                  <div className="group-hub-card-name">{g.name}</div>
                  <div className="group-hub-card-meta">
                    {g.memberCap} members · {teamsPerMemberLabel(g.memberCap)} teams each ·{" "}
                    {g.role === "admin" ? "Admin" : "Member"}
                  </div>
                </div>
                <div className="group-hub-card-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      writeStoredActiveGroupId(g.id);
                      onEnterGroup(g.id);
                    }}
                  >
                    Enter
                  </button>
                  {g.role === "admin" ? (
                    <Link
                      className="btn-ghost"
                      to={`/groups/${encodeURIComponent(g.id)}/assign`}
                    >
                      Assign teams
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="group-hub-section" aria-labelledby="create-h">
        <h2 id="create-h" className="group-hub-section-title">
          Create a pool
        </h2>
        <form className="group-hub-form" onSubmit={handleCreate}>
          <label className="group-hub-label">
            Pool name
            <input
              className="group-hub-input"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
              maxLength={80}
              placeholder="e.g. Office bracket"
            />
          </label>
          <label className="group-hub-label">
            Pool size (members)
            <select
              className="group-hub-input"
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
          </label>
          <fieldset className="group-hub-fieldset">
            <legend className="group-hub-legend">Visibility</legend>
            <label className="group-hub-inline">
              <input
                type="radio"
                name="vis"
                checked={createVis === "public"}
                onChange={() => setCreateVis("public")}
              />{" "}
              Public — listed in the marketplace
            </label>
            <label className="group-hub-inline">
              <input
                type="radio"
                name="vis"
                checked={createVis === "private"}
                onChange={() => setCreateVis("private")}
              />{" "}
              Private — join code + password
            </label>
          </fieldset>
          {createVis === "private" ? (
            <>
              <label className="group-hub-label">
                Join code
                <div className="group-hub-row">
                  <input
                    className="group-hub-input"
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
                    className="btn-ghost"
                    onClick={() => setCreateCode(randomJoinCode())}
                  >
                    Regenerate
                  </button>
                </div>
              </label>
              <label className="group-hub-label">
                Password
                <input
                  className="group-hub-input"
                  type="password"
                  value={createPass}
                  onChange={(e) => setCreatePass(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </label>
            </>
          ) : null}
          <button type="submit" className="btn-primary">
            Create pool
          </button>
        </form>
      </section>

      <section className="group-hub-section" aria-labelledby="market-h">
        <div className="group-hub-section-head">
          <h2 id="market-h" className="group-hub-section-title">
            Public pools
          </h2>
          <button type="button" className="btn-ghost btn-sm" onClick={refreshPublic}>
            Refresh
          </button>
        </div>
        {publicGroups.filter((g) => g.data.memberCount < g.data.maxMembers)
          .length === 0 ? (
          <p className="group-hub-muted">No open public pools right now.</p>
        ) : (
          <ul className="group-hub-list">
            {publicGroups
              .filter((g) => g.data.memberCount < g.data.maxMembers)
              .map((g) => (
                <li key={g.id} className="group-hub-card">
                  <div>
                    <div className="group-hub-card-name">{g.data.name}</div>
                    <div className="group-hub-card-meta">
                      {g.data.memberCount}/{g.data.maxMembers} joined ·{" "}
                      {teamsPerMemberLabel(g.data.memberCap)} teams each
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleJoinPublic(g.id)}
                  >
                    Join
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="group-hub-section" aria-labelledby="priv-join-h">
        <h2 id="priv-join-h" className="group-hub-section-title">
          Join a private pool
        </h2>
        <form className="group-hub-form" onSubmit={handleJoinPrivate}>
          <label className="group-hub-label">
            Join code
            <input
              className="group-hub-input"
              value={privCode}
              onChange={(e) => setPrivCode(e.target.value.toUpperCase())}
              autoComplete="off"
            />
          </label>
          <label className="group-hub-label">
            Password
            <input
              className="group-hub-input"
              type="password"
              value={privPass}
              onChange={(e) => setPrivPass(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button type="submit" className="btn-primary">
            Join private pool
          </button>
        </form>
      </section>
    </div>
  );
}
