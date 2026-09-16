import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/app.css";

type BoundaryState = { error: string | null };

/** A render crash must not take the whole window (and its in-memory drafts) down silently. */
class ErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(err: unknown): BoundaryState {
    return { error: err instanceof Error ? err.message : "Unknown render error." };
  }

  componentDidCatch(err: unknown): void {
    // No note contents are logged — only the failure itself.
    console.error(`[renderer] uncaught render error: ${err instanceof Error ? err.message : String(err)}`);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="empty" role="alert">
            <h1>Something went wrong</h1>
            <p>The interface hit an error and stopped to protect your files. Your notes on disk are untouched; unsaved edits in this window may be lost.</p>
            <p className="hint">{this.state.error}</p>
            <div className="actions">
              <button className="btn primary" onClick={() => window.location.reload()}>Reload window</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const el = document.getElementById("root");
if (!el) throw new Error("Missing #root element.");
createRoot(el).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
