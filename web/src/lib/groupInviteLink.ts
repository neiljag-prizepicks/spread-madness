/** Query keys for group invite URLs (stable contract). */
export const INVITE_PARAM_GROUP_ID = "groupId";
export const INVITE_PARAM_CODE = "code";
export const INVITE_PARAM_PASSWORD = "password";

export type ParsedGroupInviteParams = {
  groupId: string;
  code: string;
  password: string | null;
};

export function parseGroupInviteSearchString(search: string): ParsedGroupInviteParams | null {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const sp = new URLSearchParams(q);
  const groupId = sp.get(INVITE_PARAM_GROUP_ID)?.trim();
  if (!groupId) return null;
  const code = sp.get(INVITE_PARAM_CODE) ?? "";
  const password = sp.get(INVITE_PARAM_PASSWORD);
  return {
    groupId,
    code,
    password: password === null || password === "" ? null : password,
  };
}

export function buildGroupInviteUrl(opts: {
  origin?: string;
  groupId: string;
  code: string;
  password?: string;
}): string {
  const origin =
    opts.origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const sp = new URLSearchParams();
  sp.set(INVITE_PARAM_GROUP_ID, opts.groupId);
  sp.set(INVITE_PARAM_CODE, opts.code);
  if (opts.password != null && opts.password !== "") {
    sp.set(INVITE_PARAM_PASSWORD, opts.password);
  }
  return `${origin}/groups/join?${sp.toString()}`;
}

export function buildPrivateInviteClipboardLines(
  joinUrl: string,
  joinCode: string,
  password: string
): string {
  return `Come join me in the MADNESS! ${joinUrl}\nJoin Code: ${joinCode}\nPassword: ${password}`;
}

export function buildPublicInviteClipboardLines(joinUrl: string): string {
  return `Come join me in the MADNESS! ${joinUrl}`;
}
