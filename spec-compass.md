# Compass

Roam Depot extension. Display name **Compass**. Package name `roam-compass`. Log prefix `[compass]`. Runtime flag `window.__ROAM_COMPASS_VERSION`. CSS root `.compass-root`.

This is a clean-room rewrite of the *behavior* of a spatial neighborhood navigator (one center, stable directions, typed relations). It is not a source port.

## License boundary

`~/kplex-reference` is Zsolt Viczián's K-Plex, **GNU AGPL-3.0**. Do not open it. Do not copy its source, tests, styles, strings, or docs into this repo. Do not add a runtime or build dependency from it. This repo stays **MIT**, built only from `~/roam-extension-template` plus code written for Roam's data model.

Read, before editing:

- this file
- `~/.grok/skills/roam-plugin-dev/SKILL.md` (lifecycle, rules 1, 2, 4, 5, 6, 7, 10, 11, 20)
- `~/roam-docs/public/developer-documentation/attributes-data-model-new.md`
- `~/openkb-roam-plugin/raw/api-types/roam-alpha-api.d.ts` for any `roamAlphaAPI` call

The public help graph (`roam-help`) page **Attributes** is community videos, not the data model. **Developer Documentation** on that graph points at the developer-documentation graph. The file above is the local mirror of **Attributes Data Model (new)** and is the authority for harcs.

## What Compass is

One page or block sits in the center. Related entities keep a direction as you move:

| Zone | Direction | What lands there |
|---|---|---|
| parents | north | explicit Parent-list attributes, and the inverse of Child-list attributes |
| children | south | explicit Child-list attributes, and the inverse of Parent-list attributes |
| friends | west | Friend and Previous lists, plus their inverses |
| challengers | east | Challenger and Next lists, plus their inverses |
| related | southeast | any other page-valued attribute not listed and not denied |
| siblings | a row under children | other page values on the same harc that made an inverse parent |
| badges | on the center card | scalar text values (`:harc/v-string`), not nodes |

Untyped `[[page]]` links are dashed and read-only. Outbound links join the south. Inbound mentions join the north. They never duplicate a uid already placed by a harc.

Roam is the store. There is no second database, no IndexedDB vault index, and no `:harc/*` write. A harc changes only when the `Name::` block it is derived from changes.

## Cuts

Do not build these:

- deleting pages or blocks except the attribute-source edits in **Writes**
- ExcaliBrain or Obsidian import
- translation catalogs
- thumbnails or your own `<img>` (encrypted graphs)
- React, or any npm runtime dependency
- a whole-graph index
- rewriting prose that merely mentions a page

## Attribute model Compass relies on

Harcs are derived. One `Name::` block is one harc.

- `:harc/e` is the entity. A parent block that is exactly one `[[page]]` and nothing else proxies `:harc/e` to that page.
- `:harc/a` is the attribute page (`Name` in `Name::`).
- `:harc/v` is many values.
- Refs-only tail (`Owner:: [[Jane]]`) or a bare `Name::` plus child blocks that are only `[[pages]]`: each referenced page is a value.
- Inline text (`Status:: Active`) is one owned text entity, `:harc/v-string`, uid `v-` + harc uid. Not a block.
- A non-blank tail claims the value. Children under that block are not values.
- A nested attribute (`Role:: Lead` under `Owner:: [[Jane]]`) is a harc whose `:harc/e` is the parent harc. That is an edge label, not a node.
- `roam/meta` and other pass-throughs (`:attr/proxy true`) do not become harcs. Nested attributes already attach to the real entity. Do not transact `:attr/proxy`.
- `BT_attr*` is Better Tasks. `Aliases::` is the aliases plugin. Compass does not reshape either.

There is no write API for harcs.

## Defaults

Direction lists are comma-separated attribute **page titles**, case-sensitive, trimmed.

| Setting id | Default |
|---|---|
| `compass-parents` | `Parent` |
| `compass-children` | `Child` |
| `compass-friends` | `Friend, Previous` |
| `compass-challengers` | `Challenger, Next` |
| `compass-hidden` | `Hidden` |
| `compass-untyped` | on |
| `compass-siblings` | on |
| `compass-badges` | on |
| `compass-outline` | off |
| `compass-sidecar` | on |
| `compass-max-zone` | `24` |
| `compass-pins` | `[]` |
| `compass-lenses` | `[]` |

Built-in deny, unless that exact title is listed in a direction field: any attribute title starting with `BT_attr`, and `Aliases`. Hidden-list titles are dropped entirely (no node, no badge, no edge).

Explicit direction assignment beats the deny list.

## Pure model

All of this is plain functions over fixtures. No `roamAlphaAPI`, no DOM. `src/host.js` is the only module that calls Roam.

### Fixture shape

```js
{
  center: { uid, title, string }, // title set for a page, string set for a block
  harcs: [{
    uid, // harc uid
    entityUids: [],
    attribute: { uid, title },
    values: [{ uid, title, string, vString }], // one of title | string | vString
    sourceUid, // :harc/a-source block
    sourceString, // that block's :block/string
    valueSourceUids: [],
    labels: [{ attribute: "Role", text: "Lead" }], // annotation harcs
  }],
  outbound: [{ uid, title }],
  inbound: [{ uid, title }],
  outline: [{ uid, string, order }], // direct :block/children when expand is on
  namespaceParent: { uid, title } | null,
  settings: { parents, children, friends, challengers, hidden, maxPerZone, showUntyped, showSiblings, showBadges, showOutline },
}
```

### Classify

`classify(fixture) -> { nodes, edges, badges, overflow }`

Nodes: `{ uid, title, zone, kind }` where zone is `parents | children | friends | challengers | related | siblings | outline` and kind is `typed | inverse | link | mention | namespace | outline`.

Edges: `{ from, to, zone, kind, attribute, sourceUid, labels, writable }`. `writable` is true only for `kind: "typed"` edges whose source block is on the center (we have the source string). Inverse, link, mention, and namespace edges are `writable: false`.

Rules, in order:

1. Page-valued harcs whose `entityUids` include the center. Place each page value. Zone from the attribute title: children, parents, friends, challengers, else `related`. Skip denied and hidden. Skip the center uid. `kind: "typed"`. `writable: true`.
2. Scalar harcs on the center (every value is `vString` only). Badges `{ attribute, text }`, capped at 6. Not nodes.
3. Annotation labels stay on the edge from rule 1. Do not make nodes for them.
4. Inverse. A harc whose **values** include the center:
   - attribute in the children list: the entity page is `parents` / `inverse`
   - attribute in the parents list: the entity page is `children` / `inverse`
   - friends list: `friends` / `inverse`
   - challengers list: `challengers` / `inverse`
   - anything else: ignore (an inverse "Status" is noise)
   - other **page** values on a children-list inverse harc are `siblings` / `inverse`, when `showSiblings`
5. Dedupe nodes by uid. First placement wins. Extra edges still attach.
6. If `showUntyped`: outbound pages not already placed go `children` / `link`. Inbound pages not already placed go `parents` / `mention`.
7. `namespaceParent`, if its uid is not placed, is `parents` / `namespace`.
8. If `showOutline`, `outline` entries are `outline` / `outline` nodes. They are not capped by the relation cap. Cap outline at 40.
9. After placement, each relation zone keeps at most `maxPerZone` nodes. Extra count is `overflow[zone]`. Siblings use the same cap. Badges are not zone nodes.

Block-valued harc values (a `:block/string` value that is not a page) are not nodes.

### Layout

`layout(nodes, { showOutline }) -> [{ uid, zone, x, y, w, h }]`

Constants: node `160×36`, gap `12` horizontal and `10` vertical, center at `(0, 0)`.

- parents: one row, bottom at `y = -70`, horizontally centered
- friends: one column, right edge at `x = -200`, vertically centered on 0
- center is not in `nodes`; the view draws it at `(0, 0)` size `200×64`
- challengers: one column, left edge at `x = 200`
- children: one row, top at `y = 80`
- related: one row under children, `28` px below that row
- siblings: one row under related (or under children if related is empty), smaller `w = 120`, `h = 28`
- outline: one column under the center, `x = 0`, starting `y = 80`, only when `showOutline`. When outline is on, the children row moves to `y = 80 + outline.length * 46`.

Same input, same coordinates. Sort each zone by title, then uid, before placing, so order is stable.

`applyLens(classified, lens, mode)`:

- `lens` is `{ keyword, attributes: { include: [], exclude: [] }, kinds: { include: [] } }`. Empty include lists mean "no restriction".
- keyword matches title, case-insensitive
- `mode: "reflow"` runs `layout` on the survivors
- `mode: "keep"` returns the previous layout positions and a `hidden: true` flag on rejected nodes

### Writes

`planWrite(fixture, action) -> { ops }`

Actions:

- `{ type: "link", zone, title }` adds `title` as a page value on the center, using the **first** attribute title configured for that zone (`children` list for south, and so on). `related` uses the attribute the user typed in the action (`action.attribute`). Refuses `parents`/`children`/`friends`/`challengers` when that list is empty.
- `{ type: "unlink", sourceUid, valueUid }`
- `{ type: "relink", sourceUid, valueUid, toZone }` unlink then link
- `{ type: "annotate", sourceUid, attribute, text }` nest `Attribute:: text` under that source block
- `{ type: "open", sourceUid }` for read-only edges

Ops use only:

- `{ op: "create", parentUid, order: "last", string }`
- `{ op: "update", uid, string }`
- `{ op: "delete", uid }`
- `{ op: "open", uid }`
- `{ op: "create-page", title }` when `link` is given `{ create: true }` and the title has no uid yet. The page create happens before the attribute op. The host resolves the new page; the planner emits `create-page` then a `create` whose string is `Attr:: [[title]]`.

Link rules. Look at existing harcs on the center with that attribute title:

1. None. One `create` on the center uid: `Attr:: [[Title]]` (refs-only tail, single space, no comma).
2. A source whose string is exactly `Attr:: [[Title]]` or whose child values already include that page. No ops.
3. A bare `Attr::` (nothing after `::` except optional class-tag noise; treat a trailing-only string equal to `Attr::` as bare) that already has page-value children. `create` a child `[[Title]]` on that source uid.
4. A refs-only tail with one or more `[[pages]]` and no other text, and the new title is not among them. `update` the source to `Attr::`. `create` one child `[[Old]]` per previous ref, then `create` `[[Title]]`. Never write `Attr:: [[A]], [[B]]`.
5. A non-blank non-refs tail (`Status:: Active`, or `Child:: see [[A]]`). Do not edit that block. `create` a sibling on the center: `Attr:: [[Title]]`.

Unlink:

- Value is a child block of the source (`valueSource` is that child, or the planner is told `valueBlockUid`). `delete` that child. If it was the only value child and the source string is bare `Attr::`, `delete` the source too.
- Value is the only ref in a refs-only tail. `delete` the source.
- Value is one of several refs in a refs-only tail. Split like rule 4, omitting the removed title. If one ref remains, `update` to `Attr:: [[Remaining]]` and do not create children.

Annotate: `create` under `sourceUid` with string `Attribute:: text` (scalar tail). Refuse if `attribute` is empty or contains `::`.

`open` is the only op for `kind` other than `typed`.

The planner never emits a string that contains `BT_attr` unless that title is the configured attribute. It never emits `:harc`.

## Host

`src/host.js` loads a neighborhood and runs the planner's ops.

Pull the center with `roamAlphaAPI.data.pull`. Verify the pattern against a fixture in tests by feeding the **normalized** fixture, not by calling pull. The pull pattern must request, for the center: `:block/uid`, `:node/title`, `:block/string`, `:block/children` (uid, string, order), `:block/refs` (uid, title), `:harc/_e` and `:harc/_v` with attribute title, value uid/title/string/`harc/v-string`, `:harc/a-source` uid and string, `:harc/v-source` uid, and on each outgoing harc `:harc/_e` for annotation harcs (attribute title + value string/title).

Inbound mentions, capped, datalog:

```
[:find ?uid ?title
 :in $ ?center
 :where
  [?b :block/refs ?center]
  [?b :block/page ?page]
  [(not= ?page ?center)]
  [?page :block/uid ?uid]
  [?page :node/title ?title]]
```

Slice to `maxPerZone` in JavaScript. If this query throws, show the typed neighborhood and an empty inbound list. Do not fail the overlay.

Namespace: if the center title contains `/`, look up the prefix with `data.pull("[:block/uid :node/title]", [":node/title", prefix])`. Missing page: `namespaceParent: null`.

Map the pull into the fixture. Then `classify` and `layout`.

Watch: one `pullWatch` retarget. On center change, remove the previous watch and add one on the new uid. The callback only schedules a repull, coalesced with `lifecycle.timeout` of 80ms, cleared on the next event. It does not apply a delta. That is how our own writes avoid a second local mutation (roam-plugin-dev rule 2).

Writes: a promise chain on the host. Hold `navigator.locks.request("compass:" + graphName + ":" + centerUid, { ifAvailable: true }, ...)` for the whole chain. If the lock is not acquired, skip and leave the model as it is. If `navigator.locks` is missing, run the chain anyway. Before applying ops, repull the source block strings you are about to edit. If a source string differs from `sourceString` in the fixture the plan used, rebuild the fixture and `planWrite` once more. Then run ops serially:

- create → `data.block.create({ location: { "parent-uid", order: "last" }, block: { string } })`
- update → `data.block.update({ block: { uid, string } })`
- delete → `data.block.delete({ block: { uid } })`
- create-page → `data.page.create({ page: { title } })`
- open → `ui.mainWindow.openBlock({ block: { uid } })`

After the chain, repull. Do not write `:harc/*`, `:entity/attrs`, or `:attr/proxy`.

`graph.name` namespaces the lock. Read it from `roamAlphaAPI.graph.name`.

## View

No React. One overlay, registered with `lifecycle.node`, parent `document.body`.

- Root `.compass-root`, `hidden` when closed. Esc and a Close button set `hidden`.
- Stage pans (pointer drag on the background) and zooms (wheel, factor clamped 0.4–2.5).
- Nodes are `<button class="compass-node" data-uid>`. Edges are one `<canvas class="compass-edges">` behind the nodes, redrawn when positions change. Arrow from center toward the node. Typed edges solid. Inverse edges solid but thinner. Link, mention, namespace dashed.
- Edge label is the attribute title, plus annotation `Role: Lead` when present.
- Click a node: it becomes the center. Shift-click or a second button opens it: page → `ui.mainWindow.openPage({ page: { uid } })`, block → `openBlock`.
- Double-click opens the same way.
- Overflow count on a zone, when `overflow[zone] > 0`, is a text badge `shown/total`.
- Badges sit on the center card.
- Search input: `data.q` for page titles containing the string, slice 20, click a result to center it. Up/Down/Enter/Escape move in that list.
- Back and Forward keep an in-memory uid stack. Pins are `{ uid, title }[]` in `compass-pins`.
- Lens controls: keyword, attribute include/exclude (comma fields), kind include, Keep layout / Reflow. Save and delete named lenses in `compass-lenses`.
- Outline toggle flips `compass-outline` for the session and the setting.
- Sidecar: when `compass-sidecar` is on and the center changes, `rightSidebar.removeWindow` the previous Compass window if we opened one, then `addWindow({ window: { type: "outline", "block-uid": centerUid } })`. Do not close the sidebar and do not remove windows we did not open. Pages are blocks; the page uid is the `block-uid`.
- Drag a **writable** node onto a zone gutter (north/south/west/east). Drop calls `planWrite` `relink` into that zone. Read-only nodes do not drag. A drop on empty space cancels.
- Click an edge: a popover under `.compass-root` lists the attribute, each label, and a button that runs the `open` op for `sourceUid`. A text field adds an annotation via `annotate`.

Colors come from `getComputedStyle(document.body)` once when the overlay opens (`color`, `backgroundColor`). Do not write global CSS. Every selector starts with `.compass-root`. No `:is()`, no `:where()`, no descendant `::selection`.

Commands, all through `lifecycle.command`:

- `Compass: Open` toggles the overlay. Center is the open page uid from `ui.mainWindow.getOpenPageOrBlockUid`, or stays on the previous center.
- `Compass: Focus page` opens the overlay on that uid.
- `Compass: Focus block` uses `ui.getFocusedBlock()` and, if present, centers that block.
- Block context menu `Compass: Focus block` does the same for `info["block-uid"]`.

Settings panel tab title `Compass`, rows for every id in **Defaults**. Switches and inputs only. `onChange` writes the setting and, if the overlay is open, repulls. Initialize missing keys to the defaults in `initializeSettings`. `settings.get` returns null when unset.

Unload removes the overlay, the watch, listeners, and the sidecar window we opened. `onunload` and the `onload` cleanup share one lifecycle (`src/extension.js` already does this; keep that).

## Files

| File | Owns |
|---|---|
| `src/extension.js` | onload / onunload, version flag |
| `src/lifecycle.js` | unchanged API; log prefix `[compass]` only |
| `src/settings.js` | ids, defaults, panel |
| `src/model/classify.js` | `classify` |
| `src/model/layout.js` | `layout`, `applyLens` |
| `src/model/writes.js` | `planWrite` |
| `src/host.js` | pull, watch, locks, ops |
| `src/view/overlay.js` | DOM, canvas, commands wiring |
| `src/extension.css` | every selector under `.compass-root` |
| `test/classify.test.js` | cases below |
| `test/layout.test.js` | |
| `test/writes.test.js` | |
| `test/extension.test.js` | update expectations to Compass |

Keep the template build (`build.mjs`, `npm run check`). Do not add dependencies. Do not add a source map. Node tests import the pure modules with `node:test`. They do not import `host.js`.

## Tests that must exist

Classify:

- `Child:: [[A]]` on the center places A south, typed, writable
- center is a value of B's `Child::` harc: B is north, inverse, not writable; another value C on that harc is a sibling
- B's `Parent:: [[center]]` places B south
- `Status:: Active` is a badge, not a node
- `Role:: Lead` nested on the Owner harc is `edges[].labels`, and Jane is a node
- an outbound link to a page that is already a child does not add a second node
- `Hidden:: [[A]]` with Hidden in the hidden list omits A
- `BT_attrProject:: [[P]]` is omitted
- `BT_attrProject` listed under friends places P west
- `Working on:: [[P]]` goes to related
- zone cap 1 with two children reports `overflow.children === 1`

Layout:

- every parent y is less than 0; every child y is greater than 0
- every friend x is less than 0; every challenger x is greater than 0
- two calls, deep-equal positions

Writes:

- no existing attribute creates one refs-only block
- a second page splits a refs-only tail into a bare parent plus child ref blocks, and the update string is exactly `Child::`
- unlinking the only refs-only value deletes that block
- a scalar `Child:: notes` is left unchanged and a new sibling `Child:: [[A]]` is created
- unlink of a link-kind edge returns a single `open` op
- annotate emits `Role:: Lead` as a child of the source

`npm run check` is the gate. It builds, scans secrets, syntax-checks `extension.js`, runs tests, and verifies `deploy/` matches the root artifacts.

## README

Replace the template README with a short Compass page: what the four directions mean, that relations are `Name:: [[Page]]` blocks, that multi-value relations are a bare `Name::` plus child `[[pages]]`, and that install is the GitHub Pages URL once a repo exists. Do not document Obsidian. Do not copy K-Plex's README.
