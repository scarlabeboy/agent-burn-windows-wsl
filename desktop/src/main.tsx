import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { readSettings } from "./api";
import { createThemeController, resolveTheme, type ResolvedTheme } from "./theme";
import "./styles.css";

const settings = readSettings();
const systemTheme = (): ResolvedTheme => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const showTheme = (theme: ResolvedTheme) => { document.documentElement.dataset.theme = theme; };
// Set the page theme before the first render. The native window (title bar) follows in the
// background: rendering never waits on it, so a stuck call cannot leave the window blank.
showTheme(resolveTheme(settings.theme, systemTheme()));
const theme = createThemeController(getCurrentWindow(), showTheme, systemTheme);
window.addEventListener("pagehide", () => { void theme.dispose(); }, { once: true });
void theme.apply(settings.theme);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App initialSettings={settings} onThemeChange={(next) => { void theme.apply(next); }} />
  </React.StrictMode>,
);
