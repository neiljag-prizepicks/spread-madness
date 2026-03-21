/**
 * Bracket equity uses 64 logical “slots” (First Four game = 1 slot, 2 physical team_ids).
 * The roster file has 68 team_ids (both sides of each play-in).
 */
export const LOGICAL_BRACKET_SLOTS = 64;

/** team_id rows in `teams_*.json` — update if the tournament file changes. */
export const PHYSICAL_TEAM_ID_COUNT = 68;

/** Supported group sizes (each divides 64 evenly). */
export const GROUP_MEMBER_CAPS = [2, 4, 8, 16, 32, 64] as const;

/** Legacy Firestore values — still accepted when reading groups. */
export const LEGACY_MEMBER_CAPS = [17, 34, 68] as const;

export type GroupMemberCap =
  | (typeof GROUP_MEMBER_CAPS)[number]
  | (typeof LEGACY_MEMBER_CAPS)[number];

export function isValidMemberCap(n: number): n is GroupMemberCap {
  return (
    (GROUP_MEMBER_CAPS as readonly number[]).includes(n) ||
    (LEGACY_MEMBER_CAPS as readonly number[]).includes(n)
  );
}

/** Logical bracket slots per person (64 ÷ group size). Physical team_id rows can be higher for FF holders. */
export function teamsPerMember(memberCap: number): number {
  if (memberCap <= 0 || LOGICAL_BRACKET_SLOTS % memberCap !== 0) {
    throw new Error(
      `Invalid member cap: ${memberCap} (must divide ${LOGICAL_BRACKET_SLOTS} evenly)`
    );
  }
  return LOGICAL_BRACKET_SLOTS / memberCap;
}

export function teamsPerMemberLabel(memberCap: number): string {
  if (memberCap <= 0 || LOGICAL_BRACKET_SLOTS % memberCap !== 0) {
    return "—";
  }
  return String(LOGICAL_BRACKET_SLOTS / memberCap);
}

/** Group can run fair assignment on the 64-slot model. */
export function canSplitTournamentEvenly(memberCap: number): boolean {
  return memberCap > 0 && LOGICAL_BRACKET_SLOTS % memberCap === 0;
}
