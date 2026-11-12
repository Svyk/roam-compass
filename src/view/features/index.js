import { createTrail } from "./trail.js";
import { createPins } from "./pins.js";
import { createViews } from "./views.js";
import { createMindMap } from "./mindmap.js";
import { createFacets } from "./facets.js";
import { createLenses } from "./lenses.js";
import { createLayoutOptions } from "./layout-options.js";
import { createKeys } from "./keys.js";
import { createPalette } from "./palette.js";
import { createWander } from "./wander.js";
import { createZen } from "./zen.js";
import { createExport } from "./export.js";
import { createEdit } from "./edit.js";
import { createBoards } from "./boards.js";
import { createDrawings } from "./drawings.js";
import { createMore } from "./more.js";

export const FEATURES = Object.freeze([
  createTrail,
  createPins,
  createViews,
  createMindMap,
  createFacets,
  createLenses,
  createLayoutOptions,
  createKeys,
  createPalette,
  createWander,
  createZen,
  createExport,
  createEdit,
  createBoards,
  createDrawings,
  createMore,
]);
