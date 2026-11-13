import { describe, expect, it } from "vitest";
import { captureDrag, isTyping } from "../src/beat-path/drag";

/** A stand-in element: an EventTarget with pointer capture, enough for captureDrag. */
function fakeElement() {
  const el = new EventTarget() as EventTarget & { setPointerCapture(id: number): void; captured: number[] };
  el.captured = [];
  el.setPointerCapture = id => { el.captured.push(id); };
  return el as unknown as HTMLElement & { captured: number[] };
}
const ev = (type: string) => Object.assign(new Event(type), { pointerId: 1 }) as unknown as PointerEvent;

describe("captureDrag", () => {
  it("ends once on pointerup and stops following moves", () => {
    const el = fakeElement();
    let moves = 0, ends = 0;
    captureDrag(el, ev("pointerdown"), () => { moves++; }, () => { ends++; });
    el.dispatchEvent(ev("pointermove"));
    el.dispatchEvent(ev("pointerup"));
    el.dispatchEvent(ev("lostpointercapture"));
    el.dispatchEvent(ev("pointermove"));
    expect(el.captured).toEqual([1]);
    expect(moves).toBe(1);
    expect(ends).toBe(1);
  });
  it("ends on pointercancel or a lost capture (a cancelled drag kept dragging before)", () => {
    for (const type of ["pointercancel", "lostpointercapture"]) {
      const el = fakeElement();
      let moves = 0, ends = 0;
      captureDrag(el, ev("pointerdown"), () => { moves++; }, () => { ends++; });
      el.dispatchEvent(ev(type));
      el.dispatchEvent(ev("pointermove"));
      expect([moves, ends]).toEqual([0, 1]);
    }
  });
});

describe("isTyping", () => {
  const input = (type: string) => ({ closest: (sel: string) => (sel === "input" ? { type } : null) }) as unknown as HTMLElement;
  it("counts the API key's password field, number and text fields as typing", () => {
    for (const type of ["password", "text", "number", "search", "email"]) expect(isTyping(input(type))).toBe(true);
  });
  it("leaves sliders, checkboxes and colour pickers to the page shortcuts", () => {
    for (const type of ["range", "checkbox", "color"]) expect(isTyping(input(type))).toBe(false);
  });
  it("counts textareas and selects; plain elements are not typing", () => {
    expect(isTyping({ closest: (sel: string) => (sel.startsWith("textarea") ? {} : null) } as unknown as HTMLElement)).toBe(true);
    expect(isTyping({ closest: () => null } as unknown as HTMLElement)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
