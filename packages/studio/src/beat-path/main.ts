/**
 * Entry of the Beat Path page (path.html). Theme: neutral by default; `?theme=runware`
 * switches to the Runware look (themes/runware.css, values and sources in docs/design.md),
 * which also loads its open fonts (Figtree, JetBrains Mono) from Google Fonts.
 */
import "./ui/components.css";
import "./themes/neutral.css";
import "./themes/runware.css";
import "./beat-path.css";
import { startBeatPath } from "./page";

const theme = new URLSearchParams(location.search).get("theme");
if (theme === "runware") {
  document.documentElement.dataset.theme = "runware";
  const fonts = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" });
  document.head.appendChild(fonts);
}
const page = startBeatPath(document.getElementById("app")!);
if (theme === "runware") {
  document.getElementById("credit")!.textContent = "Built on Runware · unofficial demo";
  void document.fonts.ready.then(() => page.retheme());
}
