/**
 * Pool rules (Rules tab). Use **double asterisks** for bold segments in strings.
 */
/** Legend label colors — match `.birdseye-legend-*` in App.css */
export type PoolRulesLegendClass =
  | "pool-rules-legend-live"
  | "pool-rules-legend-hit"
  | "pool-rules-legend-miss"
  | "pool-rules-legend-neutral";

export type PoolRulesColorKeyBullet = {
  legendClass: PoolRulesLegendClass;
  label: string;
  /** Text after the label; may use **bold** like other rules copy */
  rest: string;
};

export type PoolRulesSection = {
  /** Optional h2 under the page title */
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Color key lines: colored label + rest (same hues as bracket overview). */
  colorKeyBullets?: PoolRulesColorKeyBullet[];
  /** Rendered after bullets when both exist (e.g. closing paragraph). */
  paragraphsAfterBullets?: string[];
};

export const POOL_RULES_PAGE_TITLE = "Spread Madness Rules";

/** Shown under the page title, above the first section. Use ** for bold (e.g. **TL;DR:**). */
export const POOL_RULES_TLDR =
  "**TL;DR:** Beat the spread to advance. If your team loses the game but beats the spread, you take control of your opponent's team.";

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
    heading: "Color Key",
    paragraphs: [
      "The bracket will change colors depending on the state of the game(s).",
    ],
    colorKeyBullets: [
      {
        legendClass: "pool-rules-legend-hit",
        label: "Green",
        rest: " — You won pool control for that game (LFG)! Your initials are shown.",
      },
      {
        legendClass: "pool-rules-legend-miss",
        label: "Red",
        rest: " — You had a team in that game, but **someone else** won pool control; their initials are shown.",
      },
      {
        legendClass: "pool-rules-legend-neutral",
        label: "Purple",
        rest: " — The game is final and **you weren’t** on either side in that matchup; initials are the pool winner for that game.",
      },
      {
        legendClass: "pool-rules-legend-live",
        label: "Yellow",
        rest: " — The game is actively in progress and each team is controlled by their current owner.",
      },
    ],
  },
];
