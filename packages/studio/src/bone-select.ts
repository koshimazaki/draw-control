/** The bone highlight's options (app-view.ts). Its own module so a test can load it without the page. */

/** Built as nodes: a bone name comes from the user's GLB or FBX file, so it is text, never markup. */
export function fillBoneSelect(select: HTMLSelectElement, names: readonly string[]) {
  const option = (value: string, label: string) => Object.assign(select.ownerDocument.createElement("option"), { value, textContent: label });
  select.replaceChildren(option("", "none"), ...names.map(n => option(n, n)));
}
