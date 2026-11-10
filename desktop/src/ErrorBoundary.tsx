import { listen } from "@tauri-apps/api/event";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { quitApp } from "./api";
import { flush } from "./archive";
import { t } from "./i18n";

/**
 * A view that throws while rendering would otherwise leave the window blank for good (the same
 * cached report is loaded at each launch): say so, with the detail a tester can report.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    // The app's own listener went with it: "Quit" still saves and closes at once.
    void listen("quit-requested", () => void flush().finally(() => void quitApp())).catch(() => undefined);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const text = t().app;
    return (
      <div className="crash">
        <strong>{text.crashTitle}</strong>
        <p>{text.crashBody}</p>
        <pre>{error.stack ?? String(error)}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          {text.reload}
        </button>
      </div>
    );
  }
}
