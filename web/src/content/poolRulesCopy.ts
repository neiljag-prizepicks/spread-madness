/**
 * Pool rules (Rules tab). Use **double asterisks** for bold segments in strings.
 */
export type PoolRulesSection = {
  /** Optional h2 under the page title */
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Rendered after bullets when both exist (e.g. closing paragraph). */
  paragraphsAfterBullets?: string[];
};

export const POOL_RULES_PAGE_TITLE = "Spread Madness Rules";

export const POOL_RULES_SECTIONS: PoolRulesSection[] = [
  {
    paragraphs: [
      "In the Spread Madness bracket, the winner alone doesn’t advance you; instead this bracket uses **against-the-spread** rules:",
    ],
    bullets: [
      "If the **underdog wins the game on the scoreboard**, the underdog is treated as having **covered**, and **that team’s owner** wins control of the advancing team in the bracket for that game.",
      "If the **favorite wins the game**, they only win pool control if they **cover the spread** (i.e. win by **more** than the spread). If they win but **do not cover** (or it’s a **push** on the number), the **underdog’s owner** wins control of the advancing team, even though the favorite won on the court.",
    ],
    paragraphsAfterBullets: [
      "If **no spread** is set for the game, the **straight-up winner’s** owner wins pool control for that game.",
    ],
  },
  {
    heading: "Same person owns both teams",
    paragraphs: [
      "If **you own both** sides in that game, whoever wins on the scoreboard advances—and **you** keep control of that winner; the spread isn’t used to split two different owners.",
    ],
  },
  {
    heading: "Color Key (after the game is final)",
    paragraphs: [
      "This matches the line above the bracket:",
    ],
    bullets: [
      "**Green** — You won pool control for that game (great for you on that square).",
      "**Red** — You had a team in that game, but **someone else** won pool control; their initials are shown.",
      "**Purple** — The game is final and **you weren’t** on either side in that matchup; initials are the pool winner for that game.",
      "**Yellow** — The game is actively in progress and each team is controlled by their current owner.",
    ],
  },
];
