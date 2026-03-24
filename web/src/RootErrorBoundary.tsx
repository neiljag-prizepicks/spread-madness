import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render/lifecycle errors so a failed tree does not leave #root empty
 * (black screen on dark body background).
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[spread-madness] Uncaught render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.stack ?? String(this.state.error);
      return (
        <div className="app-error app-error--root">
          <div>
            <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
            <p>
              The app crashed while rendering. Details below; the browser
              console may have more.
            </p>
            <pre
              style={{
                textAlign: "left",
                maxWidth: "min(900px, 100%)",
                overflow: "auto",
                padding: "1rem",
                background: "var(--pp-bg-secondary, #1a1a1a)",
                border: "1px solid var(--pp-border, #333)",
                borderRadius: 8,
                fontSize: "0.8rem",
              }}
            >
              {msg}
            </pre>
            <p>
              <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
