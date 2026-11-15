/**
 * Entry of the Draw Control page (path.html). Theme: the Runware look by default (themes/runware.css,
 * values and sources in docs/design.md; this is a demo for Runware), which also loads its open fonts
 * (Figtree, JetBrains Mono) from Google Fonts; `?theme=neutral` gives the studio's neutral palette.
 */
import "./ui/components.css";
import "./themes/neutral.css";
import "./themes/runware.css";
import "./beat-path.css";
import "./shot-editor.css";
import { startBeatPath } from "./page";
import { APP_NAME } from "./name";

document.title = APP_NAME;

const theme = new URLSearchParams(location.search).get("theme") === "neutral" ? "neutral" : "runware";
if (theme === "runware") {
  document.documentElement.dataset.theme = "runware";
  const fonts = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" });
  document.head.appendChild(fonts);
}
const page = startBeatPath(document.getElementById("app")!);
if (theme === "runware") {
  void document.fonts.ready.then(() => page.retheme());
}
