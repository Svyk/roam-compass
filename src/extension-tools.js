export const EXTENSION_TOOLS_KEY = "roam-compass";

function defaultRoamApi() {
  return typeof globalThis.window !== "undefined" ? globalThis.window.roamAlphaAPI : globalThis.roamAlphaAPI;
}

export function createCompassExtensionTools({ api, roam = defaultRoamApi(), version = "1.1.0" } = {}) {
  const getRoam = () => roam || defaultRoamApi();

  return {
    name: "Compass",
    version,
    description: "Inspect structured directional graph neighborhoods (parents, children, friends, challengers, facets) around a page or block.",
    group: "Navigation",
    tools: [
      {
        name: "compass_get_neighborhood",
        readOnly: true,
        description: "Return Compass's structured directional neighborhood around a page or block uid (or page_title).",
        parameters: {
          type: "object",
          properties: {
            uid: { type: "string", description: "Page or block uid." },
            page_title: { type: "string", description: "Exact page title (used to look up uid when uid is omitted)." },
          },
          additionalProperties: false,
        },
        execute({ uid, page_title } = {}) {
          let targetUid = typeof uid === "string" ? uid.trim() : "";
          if (!targetUid && typeof page_title === "string" && page_title.trim()) {
            const title = page_title.trim();
            try {
              const found = getRoam()?.data?.q?.(
                "[:find ?uid . :in $ ?title :where [?p :node/title ?title] [?p :block/uid ?uid]]",
                title,
              );
              if (typeof found === "string" && found) targetUid = found;
            } catch {
              // Fall through to not-found error.
            }
            if (!targetUid) {
              return { ok: false, error: `Page "${title}" not found.` };
            }
          }
          if (!targetUid) {
            return { ok: false, error: "Either uid or page_title is required." };
          }
          const neighborhood = api?.neighborhood?.(targetUid) ?? null;
          if (!neighborhood || neighborhood.missing) {
            return { ok: false, uid: targetUid, error: `Block or page "${targetUid}" not found.` };
          }
          return { ok: true, uid: targetUid, neighborhood };
        },
      },
    ],
  };
}

export function installCompassExtensionTools(win, registration) {
  if (!win) return () => {};
  const registry = (win.RoamExtensionTools = win.RoamExtensionTools || {});
  registry[EXTENSION_TOOLS_KEY] = registration;
  return () => {
    if (win.RoamExtensionTools?.[EXTENSION_TOOLS_KEY] === registration) {
      delete win.RoamExtensionTools[EXTENSION_TOOLS_KEY];
    }
  };
}
