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
