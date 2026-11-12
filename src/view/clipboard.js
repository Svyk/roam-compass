function copyWithTextarea(value) {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.createElement !== "function" || typeof doc.execCommand !== "function") {
    return false;
  }
  let area = null;
  try {
    area = doc.createElement("textarea");
    area.value = value;
    area.setAttribute?.("readonly", "");
    if (area.style) {
      area.style.position = "fixed";
      area.style.top = "-9999px";
      area.style.left = "-9999px";
      area.style.opacity = "0";
    }
    doc.body.append(area);
    area.focus?.();
    area.select?.();
    return doc.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    try { area?.remove?.(); } catch { /* already gone */ }
  }
}

const CLIPBOARD_TIMEOUT_MS = 1500;

function withTimeLimit(promise, timeoutMs = CLIPBOARD_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    timer?.unref?.();
    Promise.resolve(promise).then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

export async function copyText(text) {
  const value = String(text ?? "");
  const clipboard = globalThis.navigator?.clipboard;
  if (typeof clipboard?.writeText === "function") {
    try {
      if (await withTimeLimit(clipboard.writeText(value))) {
        return true;
      }
    } catch {
      // Fall back to execCommand below.
    }
  }
  return copyWithTextarea(value);
}

export async function copyBlob(blob) {
  if (!blob) return false;
  const clipboard = globalThis.navigator?.clipboard;
  const Item = globalThis.ClipboardItem;
  if (typeof clipboard?.write !== "function" || typeof Item !== "function") return false;
  try {
    return await withTimeLimit(clipboard.write([new Item({ [blob.type]: blob })]));
  } catch {
    return false;
  }
}

export function saveBlob(blob, filename) {
  if (!blob) return false;
  const doc = globalThis.document;
  const urlApi = globalThis.URL;
  if (!doc?.body || typeof doc.createElement !== "function" || typeof urlApi?.createObjectURL !== "function") {
    return false;
  }
  let url = null;
  let link = null;
  try {
    url = urlApi.createObjectURL(blob);
    link = doc.createElement("a");
    link.href = url;
    link.download = String(filename ?? "download");
    if (link.style) link.style.display = "none";
    doc.body.append(link);
    link.click();
    return true;
  } catch {
    return false;
  } finally {
    try { link?.remove?.(); } catch { /* already gone */ }
    if (url != null) {
      try { urlApi.revokeObjectURL?.(url); } catch { /* already gone */ }
    }
  }
}
