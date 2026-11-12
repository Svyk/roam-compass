export const VIEWS = Object.freeze(["compass", "mindmap", "facets"]);

export const VIEW_OPTIONS = Object.freeze([
  Object.freeze({ view: "compass", id: "view-compass", title: "View: Compass" }),
  Object.freeze({ view: "mindmap", id: "view-mindmap", title: "View: Mind Map" }),
  Object.freeze({ view: "facets", id: "view-facets", title: "View: Facets" }),
]);

export function isValidView(value) {
  return typeof value === "string" && VIEWS.includes(value);
}

export function normalizeView(value) {
  return isValidView(value) ? value : "compass";
}

export function viewEntries(currentView, onSelect) {
  const active = normalizeView(currentView);
  return VIEW_OPTIONS.map((item) => ({
    view: item.view,
    id: item.id,
    title: item.title,
    menuTitle: item.view === active ? `✓ ${item.title}` : item.title,
    active: item.view === active,
    run: typeof onSelect === "function" ? () => onSelect(item.view) : undefined,
  }));
}
