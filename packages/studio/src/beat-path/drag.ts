/**
 * One pointer drag: capture the pointer, follow its moves, and end exactly once — on pointerup,
 * pointercancel or a lost capture (a window switch, a touch taken by the browser). Without the
 * last two a cancelled drag left its move listener attached, and the next hover kept dragging.
 */
export function captureDrag(el: HTMLElement, e: PointerEvent, move: (ev: PointerEvent) => void, end?: (ev: PointerEvent) => void) {
  try { el.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
  let done = false;
  const finish = (ev: PointerEvent) => {
    if (done) return;
    done = true;
    el.removeEventListener("pointermove", move);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) el.removeEventListener(type, finish);
    end?.(ev);
  };
  el.addEventListener("pointermove", move);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) el.addEventListener(type, finish);
}

/**
 * Whether a key event belongs to a field the visitor is typing in (any text-like input, a textarea,
 * a select or editable content, including the API key's password field). Page shortcuts stay out.
 */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  if (el.closest("textarea, select, [contenteditable=''], [contenteditable=true]")) return true;
  const input = el.closest("input") as HTMLInputElement | null;
  return !!input && !["range", "checkbox", "radio", "button", "submit", "color", "file"].includes(input.type);
}
