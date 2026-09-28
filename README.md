# Compass

Compass is a spatial neighborhood navigator for a Roam graph. One page or block sits in the center, and everything connected to it sits in a fixed direction. Click a neighbor and it becomes the center. The page you came from lands on the opposite side, so position keeps its meaning as you move.

Run **Compass: Open** from the command palette. It opens on the page in the main window, or today's daily note when the main window shows the daily notes log. **Compass: Focus block** (palette or block context menu) centers the block under the cursor.

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

## Moving a relation

Drag a node with a solid accent border to another side. Compass rewrites the one `Name::` block behind that edge:

- If the block holds only that value, the attribute is renamed in place and nested labels stay.
- If it holds several values, the moved value goes to a new attribute block right after it.

The new attribute is the first name in that side's list. Dragging a plain link or a mention never rewrites prose; Compass opens the block that makes the link. The right-click menu has the same moves. Before writing, Compass re-reads the block and stops if it changed.

## Navigating

- Click a node to center it. Double-click or Shift-click opens it in the right sidebar.
- Right-click a node for Focus, Open in sidebar, Open in main window, Pin, and "Why is this here?". Click an edge to see which blocks make it, with a button to open each one.
- **Outline** expands the center into its blocks. Edges leave the card at the block that holds the link. Fold and unfold with `+` and `−`. Click a block to center it.
- **Back** and **Forward** (Alt+Left, Alt+Right), **Pin**, and the search box (Cmd/Ctrl+F) find and revisit pages.
- **Show all** under a crowded side lifts its limit.
- Drag the background to pan, scroll to zoom, **Fit** to see everything. Esc closes.
- The **Sidecar** setting keeps the center open in the right sidebar. Compass only closes sidebar windows it opened.

## Settings

The Parents, Children, Friends, Challengers, Previous, and Next settings are comma-separated attribute names, matched without case. Hidden lists attributes to leave out. Switches turn off plain links, siblings, text badges, the sidecar, and the outline.

## Install

Install Compass from its GitHub Pages URL:

`https://svyk.github.io/roam-compass/`

Include `https://` and the trailing slash. Do not append `/extension.js`. Do not paste the github.com repository page. In Roam, add that URL under **Settings → Roam Depot → Developer Extensions**.

## License

[MIT](LICENSE)
