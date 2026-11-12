async function waitForPreviewImage(h, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const img = h.q(".compass-export-image-preview");
    const expectedW = Number(img?.dataset?.width) || 0;
    const expectedH = Number(img?.dataset?.height) || 0;
    if (
      img
      && !img.hidden
      && img.dataset.rendering !== "true"
      && img.dataset.decoded === "true"
      && img.complete
      && img.naturalWidth > 0
      && img.naturalHeight > 0
      && (!expectedW || img.naturalWidth === expectedW)
      && (!expectedH || img.naturalHeight === expectedH)
    ) {
      return img;
    }
    await h.wait(30);
  }
  return h.q(".compass-export-image-preview");
}

function countDistinctSamples(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx2d = canvas.getContext("2d");
  ctx2d.drawImage(img, 0, 0);
  const seen = new Set();
  const cols = 24;
  const rows = 16;
  for (let r = 1; r < rows; r += 1) {
    for (let c = 1; c < cols; c += 1) {
      const x = Math.floor((img.naturalWidth * c) / cols);
      const y = Math.floor((img.naturalHeight * r) / rows);
      const d = ctx2d.getImageData(x, y, 1, 1).data;
      seen.add(`${d[0]},${d[1]},${d[2]},${d[3]}`);
    }
  }
  const corner = ctx2d.getImageData(2, 2, 1, 1).data;
  return { distinct: seen.size, cornerAlpha: corner[3] };
}

export const SCENARIOS = {
  "export-outline": async (h) => {
    await h.open("p-alpha");
    const exp = h.features("export");
    h.assert(Boolean(exp?.openOutline), "export.openOutline is available");
    exp.openOutline();
    await h.wait(60);

    const dialog = h.q('.compass-export-dialog-outline[role="dialog"]');
    h.assert(Boolean(dialog), "outline dialog is open");

    const preview = h.q(".compass-export-preview");
    h.assert(Boolean(preview), "markdown preview exists");
    const lines = (preview?.textContent ?? "").split("\n");
    h.equal(lines[0], "- [[Project Alpha]]", "first line is - [[Project Alpha]]");

    const childrenIndex = lines.indexOf("    - Children");
    h.assert(childrenIndex > 0, "contains 4-space Children bullet");

    const childLines = [];
    for (let i = childrenIndex + 1; i < lines.length; i += 1) {
      if (!lines[i].startsWith("        - ")) break;
      childLines.push(lines[i]);
    }

    for (const task of ["Task One", "Task Two", "Task Three"]) {
      h.assert(
        childLines.some((line) => line.startsWith(`        - [[${task}]]`)),
        `${task} appears under Children at 8 spaces`,
      );
    }

    const janeWithLabel = childLines.find((line) => line.includes("[[Jane]]")) ?? "";
    h.assert(
      janeWithLabel.includes("Owner") && janeWithLabel.includes("Role: Lead"),
      `Owner line carries its label (got "${janeWithLabel}")`,
    );

    const noLabelsBtn = h.q('.compass-export-dialog-outline button[data-labels="none"]');
    h.assert(Boolean(noLabelsBtn), "No labels button exists");
    h.click(noLabelsBtn);
    await h.wait(40);

    const updatedLines = (preview?.textContent ?? "").split("\n");
    const janeNoLabel = updatedLines.find((line) => line.includes("[[Jane]]")) ?? "";
    h.equal(janeNoLabel, "        - [[Jane]]", "Owner label is gone under No labels");
    h.assert(
      updatedLines.every((line) => !line.includes(" — ")),
      "no relationship labels remain when No labels is chosen",
    );
  },

  "export-image": async (h) => {
    await h.open("p-alpha");
    const exp = h.features("export");
    h.assert(Boolean(exp?.openImage), "export.openImage is available");
    exp.openImage();

    const img = await waitForPreviewImage(h);
    h.assert(Boolean(img), "image preview element exists");
    const initialW = img?.naturalWidth ?? 0;
    const initialH = img?.naturalHeight ?? 0;
    h.assert(initialW > 0 && initialH > 0, `preview has non-zero natural size (${initialW}x${initialH})`);
    const initialSample = countDistinctSamples(img);
    h.assert(initialSample.distinct >= 3, "initial preview paints map content");
    h.equal(initialSample.cornerAlpha, 255, "opaque preview fills background");

    const bounds = h.harness.overlay.ctx.state.geometry.bounds;
    const boundsRatio = (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY);
    const imageRatio = initialW / initialH;
    const relDiff = Math.abs(imageRatio - boundsRatio) / boundsRatio;
    h.assert(
      relDiff <= 0.1,
      `image aspect ratio (${imageRatio.toFixed(3)}) is within 10% of bounds ratio (${boundsRatio.toFixed(3)})`,
    );

    const viewportBtn = h.q('.compass-export-dialog-image button[data-scope="viewport"]');
    const scale1Btn = h.q('.compass-export-dialog-image button[data-scale="1"]');
    h.assert(Boolean(viewportBtn) && Boolean(scale1Btn), "viewport and 1x buttons exist");
    h.click(viewportBtn);
    await h.wait(40);
    h.click(scale1Btn);
    await h.wait(60);
    await waitForPreviewImage(h);

    const nextW = img?.naturalWidth ?? 0;
    const nextH = img?.naturalHeight ?? 0;
    h.assert(nextW > 0 && nextH > 0, `updated preview has non-zero size (${nextW}x${nextH})`);
    h.assert(
      nextW !== initialW || nextH !== initialH,
      `switching to Current viewport and 1x changed image size (${initialW}x${initialH} -> ${nextW}x${nextH})`,
    );

    const transparentBtn = h.q(".compass-export-transparent");
    h.assert(Boolean(transparentBtn), "Transparent background toggle exists");
    h.click(transparentBtn);
    await h.wait(80);
    await waitForPreviewImage(h);
    h.equal(transparentBtn.getAttribute("aria-pressed"), "true", "Transparent background is active");
    h.assert((img?.naturalWidth ?? 0) > 0, "transparent preview rendered without error");
    const transparentSample = countDistinctSamples(img);
    h.equal(transparentSample.cornerAlpha, 0, "transparent preview has alpha=0 background");
  },

  "export-breadcrumbs": async (h) => {
    await h.open("p-alpha");
    await h.open("p-task-1");
    await h.open("p-beta");

    const exp = h.features("export");
    h.assert(Boolean(exp?.copyBreadcrumbs), "export.copyBreadcrumbs is available");
    await exp.copyBreadcrumbs();
    await h.wait(50);

    const status = h.status();
    h.assert(
      status.includes("3 visits") || /could not copy/i.test(status),
      `status mentions 3 visits or clipboard fallback (got "${status}")`,
    );

    const trail = h.features("trail");
    if (typeof trail?.markdown === "function") {
      const md = trail.markdown();
      h.assert(
        md.includes("[[Project Beta]]") && md.includes("[[Task One]]") && md.includes("[[Project Alpha]]"),
        "trail markdown lists all three visited pages",
      );
    }
  },

  "export-menu": async (h) => {
    await h.open("p-alpha");
    const stageRect = h.rect(".compass-stage");
    h.contextmenu(".compass-stage", {
      clientX: stageRect.left + 80,
      clientY: stageRect.top + 80,
    });
    await h.wait(50);

    const items = h.qa(".compass-menu:not([hidden]) .compass-menu-item").map((el) => el.textContent.trim());
    h.assert(items.includes("Export outline as Markdown…"), "stage menu has Export outline as Markdown…");
    h.assert(items.includes("Export image…"), "stage menu has Export image…");
    h.assert(items.includes("Copy breadcrumbs as Markdown"), "stage menu has Copy breadcrumbs as Markdown");
  },
};
