# Changelog

All notable changes to this project follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2026-10-05

### Added

- Compass can open on a page or a block, and say whether it is open. From a page, Show on board opens the one board that holds it, or asks which board when there are two.

## [0.8.0] - 2026-10-05

### Added

- With Plexus Diagram loaded, a page shows the boards it sits on, each with a thumbnail. Click a board to list its cards. A labelled connection keeps its label. Open on board opens that board and pulses the card. With Plexus Diagram unloaded, those nodes stay off. The Boards setting turns this off.

## [0.7.0] - 2026-10-01

### Added

- An empty page is drawn dashed. Its hover text is Empty page. Start writing opens that page.
- Outline URLs group by host, four hosts and four URLs each.
- The zone plus picks a page or a drawing name. The four sides write Parent, Child, Friend, and Challenger. An existing drawing is reused. Otherwise Plexus creates the drawing. The editor stays closed.
- Send to drawing commits the neighborhood onto the open drawing. With links stays off until toggled.
- Pages, Blocks, Drawings, and Regions start on, with a keyword field. Turning one off fades those nodes. The nodes stay on the graph.
- Cross links stay off until toggled. The edges are faint and stop at 40.

## [0.6.0] - 2026-10-01

### Added

- An empty search lists pins, today, and up to eight pages and drawings by edit time. The list is cached until the overlay closes. There are no shortcut rows.
- Hovering a node highlights its edges and dims the rest. Opacity only, so the layout stays put. A drawing thumbnail appears only while Ctrl or Cmd is held.
- A side sorts by connections (the default), name, last edited, or created. A Name:: value is the neighbour's label. The tooltip keeps the page title. Compass does not write Name::.

## [0.5.0] - 2026-09-30

### Added

- `window.RoamCompass` is frozen `{ focus, isAvailable }`. `isAvailable` is a function. Load fires `roam-compass:ready` and unload fires `roam-compass:unload`.
- Settings Follow main window (off) and Related drawings (on). A drawing centre lists frames then regions. Hover asks for a 480px cache thumbnail and does not render. Dashed edges use the link stroke. Show linked window is a bar button. The three palette commands register on Cmd/Ctrl+P and leave when that palette closes, so idle typing does not pay for them. A keyup does not schedule work until those commands are registered. Related drawings rank shared block refs and element links, and skip the excalidraw syntax page.
- Typing with Compass 0.5.0 and Plexus 0.14.0 loaded measured +0.142 ms/key (five interleaved rounds, 42 keys, 5 s settle, editor closed).

## [0.4.0] - 2026-09-29

### Changed

- Double-click, "Open in sidebar" and "Open in main window" on a drawing or Plexus region node, outline row or centre open through `RoamPlexus.open(uid, {sidebar})` when Plexus reports `apiVersion` 2 or later and exposes `open`. A region opens zoomed with spotlight. The overlay closes before any region open and before a main-window drawing open; a drawing opened in the sidebar leaves the overlay up. The sidecar and the other sidebar windows are not touched. Without Plexus, or when `open` throws synchronously, the plain block opens as before; a rejected promise is only logged.

## [0.3.0] - 2026-09-29

### Changed

- Plexus region nodes, outline rows and the centre title use the entry `label` from `RoamPlexus.regionsOf` (Plexus apiVersion 3) when it is present. The owner drawing comes from the region's `d=` token, and `regionsOf` is called at most once per drawing per neighbourhood build. Without Plexus, or with a Plexus that returns no `label`, the title is the region caption or "Region" as before.

## [0.2.1] - 2026-09-28

### Fixed

- Plexus region and drawing nodes show a readable title (the region caption or "Region"; "Drawing: <first text element>") instead of raw component text.

## [0.2.0] - 2026-09-28

### Added

- Drawings setting (`compass-drawings`, default on). When the Plexus extension is present (`window.RoamPlexus.apiVersion >= 1`), drawing blocks show a cached thumbnail on their node, and search ends with a `New drawing: <query>` row that calls `RoamPlexus.create` and focuses the new drawing's page.
- Drawing thumbnails render once through Plexus on a cache miss, sit inline at 24px, and stay across reloads.
- Compass repulls (one per frame) when Plexus reports a change, and reacts to `roam-plexus:ready` and `roam-plexus:unload`. Without Plexus nothing changes.

### Changed

- Named the extension Compass (`roam-compass`). Log prefix is `[compass]`. Settings tab is Compass. The palette command is `Compass: Open`.
- Replaced the neighborhood model and the overlay. Every typed attribute now places a node: listed attributes go to their side, unlisted ones read as children. Plain links come from the whole outline, nested bullets included; linked references sit north; a two-way link sits west.
- Daily notes show their links, linked references, and the day before and after. Compass: Open falls back to today's note on the daily notes log.
- `BT_attr*` relations are visible and read-only.
- Siblings come from typed parents, co-mentions in the same block, sibling blocks, and namespaces.
- Dragging a typed node to another side renames or splits its one `Name::` block. Dragging a plain link opens its block instead.
- Outline mode expands the center into foldable blocks, and edges leave the card at the block that holds them.
- Nodes glide to their new place on refocus. Edge details list each source block. Search ranks exact, prefix, word, and loose matches.
- Settings ids are now `compass-north`, `compass-south`, `compass-west`, `compass-east`, `compass-previous`, `compass-next`, `compass-hidden`, `compass-links`, `compass-siblings`, `compass-badges`, `compass-sidecar`, `compass-outline`, `compass-max-zone`, and `compass-pins`.

### Removed

- Lenses, the edge annotate form, and the `related` zone.

## [0.1.0] - 2026-08-03

### Added

- Modular source and deterministic browser-ESM build with exactly pinned esbuild.
- Root Depot artifacts and matching GitHub Pages output.
- Idempotent lifecycle helpers for commands, watches, DOM, events, observers, and timers.
- Verified Roam settings panel example.
- Node test suite, CI, and GitHub Pages deployment workflow.
- Node.js 20-compatible build paths and browser-platform dependency enforcement.
- Build-time rejection of unresolved packages, Node built-ins, and remote imports.
- Generated-artifact drift enforcement and an automated secret scanner.
- Immutable GitHub Actions revisions and exact Developer Extension installation guidance.
