# Compass

Compass is a spatial neighborhood navigator for a Roam graph. One page or block sits in the center. Related pages keep a direction as you move.

## Directions

- **North — parents.** Attributes in the parent list, and the inverse of attributes in the child list. The default parent attribute is `Parent`.
- **South — children.** Attributes in the child list, and the inverse of attributes in the parent list. The default child attribute is `Child`.
- **West — friends.** Friend and Previous lists, plus their inverses. The default is `Friend, Previous`.
- **East — challengers.** Challenger and Next lists, plus their inverses. The default is `Challenger, Next`.

## Relations

A relation is a `Name:: [[Page]]` block.

Several pages on one attribute are not a comma-separated tail. Write a bare `Name::` and put each page in its own child block:

```
Name::
  [[Alpha]]
  [[Beta]]
```

## Install

Once this repository exists, install Compass from its GitHub Pages URL:

`https://svyk.github.io/roam-compass`

Include `https://`. Do not append `/extension.js`. In Roam, add that URL under **Settings → Roam Depot → Developer Extensions**.

## License

[MIT](LICENSE)
