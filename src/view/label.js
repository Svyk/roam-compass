// Renders plain text or structured label parts ({ text, button? }) into an element.
export function fillLabel(element, text, parts) {
  if (!element) return element;
  if (!Array.isArray(parts) || !parts.length) {
    element.textContent = text ?? "";
    return element;
  }
  const doc = element.ownerDocument ?? globalThis.document;
  if (!doc?.createElement || !doc?.createTextNode || typeof element.replaceChildren !== "function") {
    element.textContent = text ?? "";
    return element;
  }
  element.replaceChildren();
  for (const part of parts) {
    if (!part?.text) continue;
    if (part.button) {
      const chip = doc.createElement("span");
      chip.className = "compass-btn-chip";
      chip.textContent = part.text;
      element.append(chip);
    } else {
      element.append(doc.createTextNode(part.text));
    }
  }
  return element;
}
