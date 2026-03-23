import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  POOL_RULES_SECTIONS,
  POOL_RULES_TLDR,
  PRIZE_RULES_SECTIONS,
  type PoolRulesColorKeyBullet,
  type PoolRulesSection,
} from "../content/poolRulesCopy";

function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    }
    parts.push(<strong key={k++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={k++}>{text.slice(last)}</span>);
  }
  return <>{parts}</>;
}

function PoolRulesSectionBlocks({ sections }: { sections: PoolRulesSection[] }) {
  return (
    <div className="pool-rules-sections">
      {sections.map((sec, si) => (
        <section
          key={sec.heading ?? `intro-${si}`}
          className="pool-rules-section"
        >
          {sec.heading ? (
            <h3 className="pool-rules-section-title">{sec.heading}</h3>
          ) : null}
          {sec.paragraphs?.map((p, i) => (
            <p key={i} className="pool-rules-p">
              <RichText text={p} />
            </p>
          ))}
          {sec.colorKeyBullets && sec.colorKeyBullets.length > 0 ? (
            <ul className="pool-rules-ul">
              {sec.colorKeyBullets.map((b: PoolRulesColorKeyBullet, i) => (
                <li key={i} className="pool-rules-li">
                  <strong className={b.legendClass}>{b.label}</strong>
                  <RichText text={b.rest} />
                </li>
              ))}
            </ul>
          ) : null}
          {sec.bullets && sec.bullets.length > 0 ? (
            <ul className="pool-rules-ul">
              {sec.bullets.map((b, i) => (
                <li key={i} className="pool-rules-li">
                  <RichText text={b} />
                </li>
              ))}
            </ul>
          ) : null}
          {sec.paragraphsAfterBullets?.map((p, i) => (
            <p key={`after-${i}`} className="pool-rules-p">
              <RichText text={p} />
            </p>
          ))}
          {sec.tip ? (
            <p className="pool-rules-p pool-rules-tip">
              <RichText text={sec.tip} />
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export function PoolRulesPage() {
  const location = useLocation();

  /** Scroll to #game-rules-h / #prize-structure-h (same pattern as /groups). */
  useEffect(() => {
    const id = location.hash.replace(/^#/, "");
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [location.hash]);

  return (
    <div className="pool-rules-page">
      <section
        id="game-rules-h"
        className="pool-rules-anchor-section"
        aria-labelledby="game-rules-heading"
      >
        <h2 id="game-rules-heading" className="pool-rules-page-heading">
          Game Rules
        </h2>
        <p className="pool-rules-p pool-rules-tldr">
          <RichText text={POOL_RULES_TLDR} />
        </p>
        <hr className="pool-rules-divider" aria-hidden />
        <PoolRulesSectionBlocks sections={POOL_RULES_SECTIONS} />
      </section>

      <hr className="pool-rules-divider pool-rules-divider--major" aria-hidden />

      <section
        id="prize-structure-h"
        className="pool-rules-anchor-section"
        aria-labelledby="prize-structure-heading"
      >
        <h2 id="prize-structure-heading" className="pool-rules-page-heading">
          Prize Structure
        </h2>
        <PoolRulesSectionBlocks sections={PRIZE_RULES_SECTIONS} />
      </section>
    </div>
  );
}
