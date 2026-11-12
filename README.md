# Compass

Compass is a spatial navigator for a Roam graph. One page or block sits in the center, and everything connected to it sits around it. Click a neighbor and it becomes the center. The page you came from lands on the opposite side, so position keeps its meaning as you move.

Run **Compass: Open** from the command palette. It opens on the page in the main window, or today's daily note when the main window shows the daily notes log. **Compass: Focus page** centers the page in the main window. **Compass: Focus block** (palette or block context menu) centers the block under the cursor. **Compass: Mind Map**, **Compass: Facets** and **Compass: Wander** open straight into those modes.

## Three views

The same neighbors can be drawn three ways. Switch in **Views and lenses**, with the canvas context menu, or from the command palette. Your choice is remembered.

| View | Shows | Use it to |
|---|---|---|
| **Compass** | One step in every direction: parents north, children south, friends west, challengers east | Read the context around a page and follow relationships |
| **Mind Map** | The center as the root of a tree, several generations deep, parents in a row above | Work on a hierarchy or an outline |
| **Facets** | The center's neighbors sorted into categories you define | Compare neighbors by status, type, role or a rule |

Clicking a node makes it the new center in every view. Double-click or Shift-click opens it in the right sidebar.

## Directions

| Side | What lands there |
|---|---|
| North, parents | Values of attributes in the Parents list. Pages that link to the center (linked references). The namespace parent. For a block, its page and parent block. |
| South, children | Values of attributes in the Children list, and of any attribute not listed anywhere. `[[Links]]` anywhere in the center's outline, nested bullets included. Namespace children. |
| West, friends | Friends list and Previous list. A page that links both ways. The day before a daily note. |
| East, challengers | Challengers list and Next list. The day after a daily note. |
| Far east, siblings | Other children of the center's parents: pages that share a typed parent, pages mentioned in the same block as the center, sibling blocks, the rest of a namespace. |

Seen from the other end, a relation flips: if `Parent:: [[Up]]` puts Up north of you, you sit south of Up. Friends and challengers stay on their side. Previous and Next swap.

A typed relation beats a plain link. A listed attribute beats an unlisted one. Two different claims about one neighbor, such as a link each way, put it west.

## Relations

Typed relations come from Roam attributes (harcs). Compass reads them; it never writes `:harc`, `:entity/attrs`, or `:attr/proxy`.

```
Owner:: [[Jane]]
  Role:: Lead
Tags::
  [[urgent]]
  [[backend]]
```

- `Owner:: [[Jane]]` puts Jane south, since Owner is not in any list. Add Owner to a list in settings to move it.
- `Role:: Lead` nested under a relation becomes the edge label: `Owner · Role: Lead`.
- Several pages on one attribute are a bare `Name::` with each page in its own child block.
- Text values such as `Status:: Active` show as badges on the center card.
- `BT_attr*` (Better Tasks) and `Aliases::` show up but are never rewritten.

### Paired fields

Write `Name|Partner` in a role list to give each end of a relation its own word. With `Guide|Explains` in the Parents list, `Guide:: [[Handbook]]` is labelled "Guide" from the page and "Explains" from Handbook. Nothing is written to the other page. `Parent|Child` and `Previous|Next` are paired by default.

## Editing relations

Compass only ever edits the one `Name::` block behind an edge. Before writing it re-reads that block and stops if it changed.

- **Move.** Drag a node with a solid accent border to another side, or use its context menu. A block that holds only that value is renamed in place and nested labels stay. A block with several values gets the moved value in a new attribute block right after it. The new attribute is the first name in that side's list.
- **Unlink.** In "Why is this here?" (click an edge, or the node's context menu), Unlink removes that one value after a confirmation that shows exactly what goes. Other blocks that connect the two pages stay.
- **Flip owner.** Moves the declaration to the other page with the inverse field: `Parent:: [[B]]` on A becomes `Child:: [[A]]` on B. The dialog shows the relation now and after saving. The new block is written first, then the old one is removed.
- A block with nested content other than relation labels is never deleted. Compass opens it for you instead.
- Dragging a plain link or a mention never rewrites prose; Compass opens the block that makes the link.

## Mind Map

- Children are whatever Compass calls a child, so both views agree.
- A chevron folds or unfolds a branch. `Alt+Enter` does the same for the selected node.
- **Expand one generation** and **Collapse one generation** are in the canvas context menu and the command palette.
- A page that already appears higher in the map is drawn dashed with ↺ and is not expanded again, so circular links stop.
- The tree grows right, left or to both sides (Mind Map direction). It opens two generations deep by default (Mind Map generations).

## Facets

Facets sorts the center's direct neighbors into labelled areas. It rearranges what is already connected. It does not search the graph and it does not write to it.

Three presets are built in:

| Preset | Sorts by |
|---|---|
| Local roles | The relationship each neighbor has to the center |
| By type | Each page's value for the Node type attribute (`Type::` by default) |
| Status board | Each page's `Status::` value |

Neighbors that match no category go to **Unassigned**. Neighbors that match more than one go to **Conflicting**.

The gear on the canvas opens the preset editor. A preset is JSON: a source (`attribute`, `type`, `role`, `kind` or `rule`), two to seven categories with the values they match, and a layout (`circular`, `concentric`, `horizontal`, `vertical` or `quadrants`). Duplicate a built-in to start. Copy JSON and Import move presets between graphs.

## Views and lenses

The **Views and lenses** panel holds the view switch and the filters. Filters and lenses change what is drawn, never the graph, and they only act on pages already on the map.

- **Quick Filter.** A keyword, the kind toggles (Pages, Blocks, Drawings, Regions), and one toggle per type found on the map. It resets when Compass closes.
- **After filtering.** Keep layout leaves the surviving nodes where they were. Reflow closes the gaps.
- **Lenses.** A saved rule that shows, hides or colors matching nodes. Conditions test the title, kind, type, any attribute, or the relationship (role, side, typed or plain, label). Enable several at once. Copy JSON and Import share them.

## Reading a busy map

- **Group** folds neighbors of the same type into one named group on each side, with a count. Click a group to unfold it. Each newly centered page starts folded.
- **Expanded** shows each neighbor's own children under it, one level further out.
- **Outline** expands the center into its blocks. Edges leave the card at the block that holds the link. Click a block to center it.
- **Show all** under a crowded side lifts its limit.
- Hovering a node highlights its edges and dims the rest. Hold Ctrl or Cmd for a drawing thumbnail.
- **Flip East–West** puts friends on the right and challengers on the left. **One-sided layout** puts both in one list on the left. Meanings do not change.

## Finding your way back

- **Back** and **Forward** step through this session's centers.
- **Footprints** lists every stop since the extension loaded, newest first, repeats included. Choose one to go there. Copy as Markdown puts the trail on the clipboard. Start here clears it down to the current page.
- **Pins** keep pages in a row under the bar. Today is pinned by default; This week and This month are settings. A periodic page that does not exist yet is created only after you confirm. Drag a pin, or use Move left and Move right in its context menu, to reorder.
- The search box (Cmd/Ctrl+F) finds any page. With the box empty it lists pins, today and recently edited pages.

## Keyboard

Selection is the focused node. Arrows move it without changing the center.

| Keys | Action |
|---|---|
| Arrow keys | Move the selection across the map |
| Alt+Arrow | Jump to the area in that direction |
| Alt+0 | Select the center |
| Enter or Space | Center the selected node |
| Shift+Enter | Open it in the sidebar |
| Ctrl/Cmd+Enter | Open it in the main window |
| Type letters | Select a visible node by name; Tab and Shift+Tab cycle matches |
| Backspace, Shift+Backspace | Back, Forward |
| Ctrl/Cmd+Arrow | Add a parent, child, friend or challenger to the center |
| Alt+P | Pin or unpin |
| Alt+B, Alt+H | Open pins, open Footprints |
| Alt+M | The selected node's menu |
| Alt+. | Command palette |
| Alt+? | Keyboard help |
| Esc | Clear the typed phrase, leave Zen, close a panel, then close Compass |

The command palette lists every action available right now. Type to filter, Enter to run.

## Zen, fullscreen and Wander

- **Zen** hides the bar and the pin row. **Fullscreen** covers the right sidebar too. Both leave the map, zoom and selection as they were. The controls sit at the bottom right.
- **Wander** walks from page to page on its own, 3 to 15 seconds per move, so old notes come back into view. Anything you do pauses it. It only visits nodes that are drawn, so filters steer it.

## Export

Right-click empty canvas, or open **More**.

| Export | Result |
|---|---|
| Outline as Markdown | The map as nested bullets with real `[[page]]` and `((block))` links. Paste it into Roam. |
| Breadcrumbs as Markdown | The Footprints trail, newest first |
| Image | A PNG of the whole canvas or the visible part, at 1×, 2× or 3×, with an optional transparent background |

## With Plexus

- With Plexus loaded, drawings and regions show thumbnails and open through Plexus.
- With Plexus Diagram loaded, boards that contain this page sit on the west with a thumbnail. Click one to show its cards. Right-click a card and choose Open on board to open that board and pulse the card. The Boards setting turns this off.

## Settings

- **Relations.** Parents, Children, Friends, Challengers, Previous and Next are comma-separated attribute names, matched without case. In Parents, Children, Previous and Next, `Name|Partner` pairs two fields. Hidden lists attributes to leave out.
- **Types.** Node type attribute names the attribute that gives a page its type (`Type` by default). Grouping, lenses and Facets use it.
- **View.** Canvas view, Mind Map direction and generations.
- **Layout.** Group, Expanded, Flip East–West, One-sided layout, Reflow when filtering, Nodes per side, Sort nodes.
- **Navigation.** Trackpad navigation (scroll pans, pinch zooms), Follow main window, Wander pace.
- **Pins.** Pin Today, Pin This week, Pin This month, the week and month page title patterns, and the first day of the week.
- **Switches** for plain links, siblings, text badges, the sidecar, the outline, drawings, boards, related drawings and cross links.

The **Sidecar** setting keeps the center open in the right sidebar. Compass only closes sidebar windows it opened.

## For scripts and other extensions

`window.RoamCompass` is a frozen object. `apiVersion` is 2. Nothing in it writes to the graph. `roam-compass:ready` and `roam-compass:unload` fire on load and unload.

| Member | Does |
|---|---|
| `focus(uid)`, `open(uid, { sidecar })`, `focusBlock(uid)` | Center a page or block |
| `isOpen()`, `isAvailable()` | State |
| `version` | The extension version |
| `ontology()` | The role lists, pairs, hidden attributes and the type attribute |
| `neighborhood(uid)` | The neighbors of any page or block with role, side, label and evidence |
| `search(text, limit)` | Page titles, ranked |
| `canvas()` | Whether Compass is open, the center, the view, the preset, whether Zen is on, and the trail |
| `setView(view, preset)` | Switch to `compass`, `mindmap` or `facets` |
| `trail()` | The visit trail, newest first |
| `commands()`, `run(id)` | List and run Compass commands |

## Install

Install Compass from its GitHub Pages URL:

`https://svyk.github.io/roam-compass/`

Include `https://` and the trailing slash. Do not append `/extension.js`. Do not paste the github.com repository page. In Roam, add that URL under **Settings → Roam Depot → Developer Extensions**.

## License

[MIT](LICENSE)
