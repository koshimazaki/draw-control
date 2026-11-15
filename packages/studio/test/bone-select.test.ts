/**
 * The bone highlight's options: bone names come from the user's GLB or FBX file, so they are set
 * as an option's value and text, never parsed as markup (a quote cannot add attributes or elements).
 */
import { describe, expect, it } from "vitest";
import { fillBoneSelect } from "../src/bone-select";

type FakeOption = { tag: string; value: string; textContent: string };
function fakeSelect() {
  const children: FakeOption[] = [];
  const select = {
    ownerDocument: { createElement: (tag: string) => ({ tag, value: "", textContent: "" }) },
    replaceChildren: (...nodes: FakeOption[]) => { children.splice(0, children.length, ...nodes); },
    set innerHTML(_html: string) { throw new Error("markup was parsed"); },
  };
  return { select: select as unknown as HTMLSelectElement, children };
}

describe("fillBoneSelect", () => {
  it("keeps a crafted bone name as plain text in one option", () => {
    const evil = `Hips"><img src=x onerror="alert(1)"><option value="`;
    const { select, children } = fakeSelect();
    fillBoneSelect(select, ["Spine", evil]);
    expect(children).toEqual([
      { tag: "option", value: "", textContent: "none" },
      { tag: "option", value: "Spine", textContent: "Spine" },
      { tag: "option", value: evil, textContent: evil },
    ]);
  });
  it("replaces the previous options", () => {
    const { select, children } = fakeSelect();
    fillBoneSelect(select, ["A", "B"]);
    fillBoneSelect(select, []);
    expect(children.map(c => c.value)).toEqual([""]);
  });
});
