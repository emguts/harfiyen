import "@fontsource-variable/inter";
// First: the theme is in place before anything renders.
import "./lib/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { moveCacheToDisk } from "./worker/modelStore";
import "./index.css";

// The desktop app's models moved from the browser cache to its own folder.
void moveCacheToDisk().catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
