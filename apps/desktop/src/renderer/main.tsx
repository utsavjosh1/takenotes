import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Button, EmptyState } from "@takenotes/ui/dom";
import "@takenotes/ui/tokens.css";
import "@takenotes/ui/dom.css";
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
          <EmptyState className="welcome-state" headingLevel={1} title="Something went wrong"
            description="The interface hit an error and stopped to protect your files. Your notes on disk are untouched; unsaved edits in this window may be lost."
            actions={<Button variant="primary" onClick={() => window.location.reload()}>Reload window</Button>}>
            <p className="inline-error" role="alert">{this.state.error}</p>
          </EmptyState>
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
