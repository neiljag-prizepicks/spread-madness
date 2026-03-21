export const GROUP_MEMBER_CAPS = [4, 8, 16, 32, 64] as const;
export type GroupMemberCap = (typeof GROUP_MEMBER_CAPS)[number];

export function teamsPerMember(memberCap: number): number {
  if (memberCap <= 0 || 64 % memberCap !== 0) {
    throw new Error(`Invalid member cap: ${memberCap}`);
  }
  return 64 / memberCap;
}

export function isValidMemberCap(n: number): n is GroupMemberCap {
  return (GROUP_MEMBER_CAPS as readonly number[]).includes(n);
}
