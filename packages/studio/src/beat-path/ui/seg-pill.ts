/**
 * The sliding selection pill of every segmented control (`.seg`): one element per control,
 * placed under the selected button (`.on`) and moved, not redrawn, when the selection changes
 * (180 ms eased, CSS; none under prefers-reduced-motion). It follows class changes on the
 * buttons and size changes of the control, so no caller has to know about it.
 */
export function initPills(root: ParentNode = document) {
  for (const seg of root.querySelectorAll<HTMLElement>(".seg")) {
    if (seg.querySelector(":scope > .seg-pill")) continue;
    const pill = document.createElement("span");
    pill.className = "seg-pill";
    pill.setAttribute("aria-hidden", "true");
    seg.prepend(pill);
    const place = () => {
      const on = seg.querySelector<HTMLElement>(":scope > button.on");
      seg.classList.toggle("has-pill", !!on && on.offsetWidth > 0);
      if (!on || !on.offsetWidth) return;
      seg.style.setProperty("--pill-x", `${on.offsetLeft}px`);
      seg.style.setProperty("--pill-w", `${on.offsetWidth}px`);
    };
    place();
    // The first placement does not slide; later ones do.
    requestAnimationFrame(() => seg.classList.add("pill-ready"));
    new MutationObserver(place).observe(seg, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true, characterData: true });
    new ResizeObserver(place).observe(seg);
  }
}
