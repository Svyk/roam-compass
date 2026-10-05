import { createLifecycle } from "./lifecycle.js";
import { createHost } from "./host.js";
import { mountOverlay } from "./view/overlay.js";
import { createSettingsPanel, initializeSettings } from "./settings.js";

const VERSION_FLAG = "__ROAM_COMPASS_VERSION";

let activeLifecycle = null;

function versionHost() {
  return globalThis.window ?? globalThis;
}

function stampVersion(version) {
  versionHost()[VERSION_FLAG] = version;
}

function installRoamCompass(win, overlay) {
  const api = Object.freeze({
    apiVersion: 1,
    isAvailable() {
      return true;
    },
    focus(uid) {
      if (typeof overlay?.focusUid === "function") overlay.focusUid(uid);
    },
    open(uid, options) {
      const sidecar = options?.sidecar === true;
      if (typeof overlay?.focusUid === "function") overlay.focusUid(uid, sidecar ? { sidecar: true } : undefined);
      if (typeof overlay?.hideResults === "function") overlay.hideResults();
    },
    focusBlock(uid) {
      if (typeof overlay?.focusUid === "function") overlay.focusUid(uid);
    },
    isOpen() {
      return typeof overlay?.isOpen === "function" ? overlay.isOpen() === true : false;
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
    lifecycle.add(installRoamCompass(versionHost(), overlay));
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
