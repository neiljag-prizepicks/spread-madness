import type { ReactNode } from "react";
import {
  POOL_RULES_SECTIONS,
  POOL_RULES_TLDR,
  type PoolRulesColorKeyBullet,
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

export function PoolRulesPage() {
  return (
    <div className="pool-rules-page">
      <p className="pool-rules-p pool-rules-tldr">
        <RichText text={POOL_RULES_TLDR} />
      </p>
      <hr className="pool-rules-divider" aria-hidden />
      <div className="pool-rules-sections">
        {POOL_RULES_SECTIONS.map((sec, si) => (
          <section
            key={sec.heading ?? `intro-${si}`}
            className="pool-rules-section"
          >
            {sec.heading ? (
              <h2 className="pool-rules-section-title">{sec.heading}</h2>
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
          </section>
        ))}
      </div>
    </div>
  );
}
