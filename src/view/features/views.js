import { isValidView, normalizeView, viewEntries } from "../../model/views.js";
import { SETTING_IDS } from "../../settings.js";

function readPreset(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "roles";
}

export function createViews(ctx) {
  let view = normalizeView(ctx?.state?.settings?.view);
  let preset = readPreset(ctx?.state?.settings?.facetsPreset);
  let saving = 0;

  function current() {
    return { view, preset };
  }

  function onSettings(settings) {
    if (!settings || saving > 0) return;
    view = normalizeView(settings.view);
    preset = readPreset(settings.facetsPreset);
  }

  async function set(nextView, nextPreset) {
    if (!isValidView(nextView)) return;
    const hasPreset = typeof nextPreset === "string" && nextPreset.trim() !== "";
    const targetPreset = hasPreset ? nextPreset.trim() : null;
    view = nextView;
    if (hasPreset) preset = targetPreset;
    saving += 1;
    try {
      await ctx?.saveSetting?.(SETTING_IDS.view, nextView);
      if (hasPreset) await ctx?.saveSetting?.(SETTING_IDS.facetsPreset, targetPreset);
      ctx?.render?.();
      ctx?.fit?.(true);
    } catch (error) {
      console.error("[compass] views", error);
    } finally {
      saving -= 1;
    }
  }

  function commands() {
    return viewEntries(view, (next) => set(next)).map(({ id, title, run }) => ({
      id,
      title,
      hint: "",
      run,
    }));
  }

  function stageMenu() {
    return viewEntries(view, (next) => set(next)).map(({ menuTitle, run }) => ({
      title: menuTitle,
      run,
    }));
  }

  return { name: "views", current, set, onSettings, commands, stageMenu };
}
