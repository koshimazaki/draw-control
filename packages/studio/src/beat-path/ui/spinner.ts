/**
 * A text loader beside a running job's words, at the words' own size: the `sand` spinner from
 * cli-spinners (Sindre Sorhus, MIT), grains falling and piling up, as Genobi shows it. Frames
 * come from the package, nothing copied. It runs only while shown; with reduced motion it holds
 * its first frame. Decorative: the words beside it say what is happening.
 */
import spinners from "cli-spinners";

export function textSpinner(name: keyof typeof spinners = "sand") {
  const { frames, interval } = spinners[name];
  const el = document.createElement("span");
  el.className = "text-spinner"; el.setAttribute("aria-hidden", "true"); el.hidden = true; el.textContent = frames[0];
  let timer = 0;
  const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    el,
    start() {
      el.hidden = false;
      if (timer || still()) return;
      const t0 = performance.now();
      timer = window.setInterval(() => { el.textContent = frames[Math.floor((performance.now() - t0) / interval) % frames.length]; }, interval);
    },
    stop() { el.hidden = true; clearInterval(timer); timer = 0; el.textContent = frames[0]; },
  };
}
