/** Classic bracket fork: two feed lines merge to one outlet (Sleeper-style). */
export function BracketFork({ tall }: { tall?: boolean }) {
  return (
    <div
      className={`bracket-fork-wrap${tall ? " bracket-fork-wrap--tall" : ""}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 20 100"
        preserveAspectRatio="none"
        className="bracket-fork-svg"
      >
        <path
          d="M 0 25 L 10 25 L 10 50 L 20 50 M 0 75 L 10 75 L 10 50"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
