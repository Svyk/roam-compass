const errors = [];
const consoleErrors = [];

function formatError(value) {
  if (value instanceof Error) {
    if (value.stack) {
      return value.message && !value.stack.includes(value.message)
        ? `${value.name || "Error"}: ${value.message}\n${value.stack}`
        : value.stack;
    }
    return value.message || String(value);
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  const formatted = args.map(formatError).join(" ");
  consoleErrors.push(formatted);
  errors.push(formatted);
  originalConsoleError(...args);
};

window.addEventListener("error", (event) => {
  const detail = event?.error ? formatError(event.error) : (event?.message || "window.error");
  errors.push(String(detail));
});

window.addEventListener("unhandledrejection", (event) => {
  errors.push(`Unhandled rejection: ${formatError(event?.reason)}`);
});

if (new URLSearchParams(window.location.search).has("scenario")) {
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
}

import { createLifecycle } from "../../src/lifecycle.js";
import { SETTING_IDS, createSettingsPanel, initializeSettings } from "../../src/settings.js";
import { mountOverlay } from "../../src/view/overlay.js";
import { createFakeHost, createGraph } from "./fixture.js";
import { SCENARIOS, SCENARIO_ERRORS, createScenarioHelper } from "./scenarios.js";

function createFakeExtensionAPI() {
  const values = new Map();
  const commands = new Map();
  let panel = null;
  return {
    values,
    commands,
    get panel() {
      return panel;
    },
    settings: {
      canSet: true,
      get(id) {
        return values.has(id) ? values.get(id) : null;
      },
      async set(id, value) {
        values.set(id, value);
      },
      panel: {
        async create(config) {
          panel = config;
        },
      },
    },
    ui: {
      commandPalette: {
        async addCommand(config) {
          if (config?.label) commands.set(config.label, config);
        },
        async removeCommand(config) {
          if (config?.label) commands.delete(config.label);
        },
      },
    },
  };
}

function writeResult(payload) {
  const pre = document.getElementById("harness-result");
  if (pre) pre.textContent = JSON.stringify(payload);
}

async function boot() {
  for (const duplicateError of SCENARIO_ERRORS) {
    errors.push(duplicateError);
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("theme") === "dark") {
    document.documentElement.style.backgroundColor = "#182026";
    document.documentElement.style.colorScheme = "dark";
    document.body.style.backgroundColor = "#182026";
    document.body.style.color = "#f5f8fa";
  }

  const extensionAPI = createFakeExtensionAPI();
  await initializeSettings(extensionAPI);

  const rawOverrides = params.get("settings");
  if (rawOverrides) {
    try {
      const parsed = JSON.parse(rawOverrides);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push("Invalid settings parameter: expected a JSON object");
      } else {
        for (const [key, value] of Object.entries(parsed)) {
          const id = Object.prototype.hasOwnProperty.call(SETTING_IDS, key) ? SETTING_IDS[key] : key;
          await extensionAPI.settings.set(id, value);
        }
      }
    } catch (error) {
      errors.push(`Invalid settings JSON: ${formatError(error)}`);
    }
  }

  const lifecycle = createLifecycle();
  const graph = createGraph();
  const host = createFakeHost(graph, { lifecycle });
  const overlay = mountOverlay({ extensionAPI, lifecycle, host });
  await lifecycle.settingsPanel(extensionAPI, createSettingsPanel({
    extensionAPI,
    onChange: () => overlay.repullIfOpen(),
  }));
  await overlay.installCommands();

  const harness = { overlay, host, extensionAPI, graph, lifecycle };
  window.harness = harness;

  const scenarioName = params.get("scenario");
  if (!scenarioName) {
    overlay.focusUid(graph.defaultCenterUid);
    overlay.hideResults();
    return;
  }

  const assertions = [];
  const run = SCENARIOS[scenarioName];
  if (typeof run !== "function") {
    errors.push(`Unknown scenario: ${scenarioName}`);
  } else {
    const helper = createScenarioHelper(harness, assertions);
    try {
      await run(helper);
    } catch (error) {
      errors.push(formatError(error));
    }
  }

  const ok = errors.length === 0 && assertions.every((item) => item.ok);
  writeResult({
    scenario: scenarioName,
    ok,
    assertions,
    errors: [...errors],
    consoleErrors: [...consoleErrors],
    done: true,
  });
}

void boot();
