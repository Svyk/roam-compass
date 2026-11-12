import { createLifecycle } from "./lifecycle.js";
import { createHost } from "./host.js";
import {
  shapeCanvas,
  shapeCommands,
  shapeNeighborhood,
  shapeOntology,
  shapeSearch,
  shapeTrail,
} from "./model/api.js";
import { buildNeighborhood } from "./model/neighborhood.js";
import { rankTitles } from "./model/search.js";
import { isValidView } from "./model/views.js";
import { mountOverlay } from "./view/overlay.js";
import {
  SETTING_IDS,
  createSettingsPanel,
  initializeSettings,
  readCompassSettings,
  writeSetting,
} from "./settings.js";

const VERSION_FLAG = "__ROAM_COMPASS_VERSION";

let activeLifecycle = null;

function versionHost() {
  return globalThis.window ?? globalThis;
}

function stampVersion(version) {
  versionHost()[VERSION_FLAG] = version;
}

export function installRoamCompass(win, { overlay, host, extensionAPI, version = "development" } = {}) {
  const currentSettings = () => {
    if (extensionAPI?.settings?.get) return readCompassSettings(extensionAPI);
    if (overlay?.ctx?.state?.settings) return overlay.ctx.state.settings;
    return readCompassSettings({ settings: { get: () => null } });
  };

  const api = Object.freeze({
    apiVersion: 2,
    version: typeof version === "string" && version ? version : "development",
    isAvailable() {
      return true;
    },
    focus(uid) {
      try {
        if (typeof overlay?.focusUid === "function") overlay.focusUid(uid);
      } catch (error) {
        console.error("[compass]", error);
      }
    },
    open(uid, options) {
      try {
        const sidecar = options?.sidecar === true;
        if (typeof overlay?.focusUid === "function") overlay.focusUid(uid, sidecar ? { sidecar: true } : undefined);
        if (typeof overlay?.hideResults === "function") overlay.hideResults();
      } catch (error) {
        console.error("[compass]", error);
      }
    },
    focusBlock(uid) {
      try {
        if (typeof overlay?.focusUid === "function") overlay.focusUid(uid);
      } catch (error) {
        console.error("[compass]", error);
      }
    },
    isOpen() {
      try {
        return typeof overlay?.isOpen === "function" ? overlay.isOpen() === true : false;
      } catch (error) {
        console.error("[compass]", error);
        return false;
      }
    },
    ontology() {
      try {
        return shapeOntology(currentSettings());
      } catch (error) {
        console.error("[compass]", error);
        return null;
      }
    },
    neighborhood(uid) {
      try {
        const cleanUid = typeof uid === "string" ? uid.trim() : "";
        if (!cleanUid || typeof host?.snapshot !== "function") {
          return shapeNeighborhood(null, {
            center: { uid: cleanUid, kind: "page", title: cleanUid },
            missing: true,
          });
        }
        const settings = currentSettings();
        const snap = host.snapshot(cleanUid, settings.model);
        const hood = buildNeighborhood(snap, settings.model);
        return shapeNeighborhood(hood, snap);
      } catch (error) {
        console.error("[compass]", error);
        return null;
      }
    },
    search(text, limit = 20) {
      try {
        const titles = typeof host?.titles === "function" ? host.titles() : [];
        return shapeSearch(rankTitles(titles, text, limit));
      } catch (error) {
        console.error("[compass]", error);
        return [];
      }
    },
    canvas() {
      try {
        const settings = currentSettings();
        const views = overlay?.features?.get?.("views")?.current?.();
        return shapeCanvas({
          open: typeof overlay?.isOpen === "function" ? overlay.isOpen() === true : false,
          center: overlay?.ctx?.state?.hood?.center ?? null,
          view: views?.view ?? settings.view,
          preset: views?.preset ?? settings.facetsPreset,
          zen: overlay?.features?.get?.("zen")?.isZen?.() === true,
          trail: overlay?.features?.get?.("trail")?.entries?.() ?? [],
        });
      } catch (error) {
        console.error("[compass]", error);
        return null;
      }
    },
    async setView(view, preset) {
      try {
        const viewsFeature = overlay?.features?.get?.("views");
        if (typeof viewsFeature?.set === "function") {
          await viewsFeature.set(view, preset);
        } else if (isValidView(view) && extensionAPI?.settings) {
          await writeSetting(extensionAPI, SETTING_IDS.view, view);
          if (typeof preset === "string" && preset.trim()) {
            await writeSetting(extensionAPI, SETTING_IDS.facetsPreset, preset.trim());
          }
        }
        return api.canvas();
      } catch (error) {
        console.error("[compass]", error);
        return null;
      }
    },
    trail() {
      try {
        return shapeTrail(overlay?.features?.get?.("trail")?.entries?.() ?? []);
      } catch (error) {
        console.error("[compass]", error);
        return [];
      }
    },
    commands() {
      try {
        return shapeCommands(overlay?.ctx?.commands?.() ?? []);
      } catch (error) {
        console.error("[compass]", error);
        return [];
      }
    },
    async run(id) {
      try {
        if (typeof id !== "string" || !id) return false;
        const list = overlay?.ctx?.commands?.() ?? [];
        const seen = new Set();
        for (const item of list) {
          if (!item || typeof item !== "object" || typeof item.run !== "function") continue;
          const itemId = typeof item.id === "string" ? item.id.trim() : "";
          if (!itemId || seen.has(itemId)) continue;
          seen.add(itemId);
          if (itemId === id) {
            await item.run();
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error("[compass]", error);
        return false;
      }
    },
  });
  win.RoamCompass = api;
  const emit = (type) => {
    try {
      const EventType = win.CustomEvent;
      if (typeof EventType === "function" && typeof win.dispatchEvent === "function") {
        win.dispatchEvent(new EventType(type));
      }
    } catch (error) {
      console.warn("[compass] event failed", error);
    }
  };
  emit("roam-compass:ready");
  return () => {
    if (win.RoamCompass === api) {
      try {
        delete win.RoamCompass;
      } catch {
        win.RoamCompass = undefined;
      }
    }
    emit("roam-compass:unload");
  };
}

function clearVersion() {
  const host = versionHost();
  try {
    delete host[VERSION_FLAG];
  } catch {
    host[VERSION_FLAG] = undefined;
  }
}

export async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();

  const lifecycle = createLifecycle();
  activeLifecycle = lifecycle;
  const version = extension?.version || "development";
  try {
    stampVersion(version);
    const host = createHost({ lifecycle });
    const overlay = mountOverlay({ extensionAPI, lifecycle, host });
    lifecycle.add(installRoamCompass(versionHost(), { overlay, host, extensionAPI, version }));
    await initializeSettings(extensionAPI);
    await lifecycle.settingsPanel(extensionAPI, createSettingsPanel({
      extensionAPI,
      onChange: () => overlay.repullIfOpen(),
    }));
    await overlay.installCommands();
    console.info(`[compass] Loaded v${version}`);
  } catch (error) {
    if (activeLifecycle === lifecycle) {
      activeLifecycle = null;
      clearVersion();
    }
    await lifecycle.dispose().catch((cleanupError) => console.error("[compass]", cleanupError));
    throw error;
  }

  // Roam invokes this cleanup immediately before onunload.
  return async () => {
    if (activeLifecycle === lifecycle) {
      activeLifecycle = null;
      clearVersion();
    }
    await lifecycle.dispose();
  };
}

export async function onunload() {
  const lifecycle = activeLifecycle;
  activeLifecycle = null;
  clearVersion();
  if (lifecycle) await lifecycle.dispose();
  console.info("[compass] Unloaded");
}

export default { onload, onunload };
