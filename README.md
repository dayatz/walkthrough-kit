# walkthrough-kit

Shared CSS + JS for walkthrough pages. Pages carry content only and load this kit from jsDelivr,
so a single `.html` file renders anywhere, with no local assets needed.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/dayatz/walkthrough-kit@1/walkthrough.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/dayatz/walkthrough-kit@1/themes/<name>.css"> <!-- optional -->
<script defer src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/dayatz/walkthrough-kit@1/walkthrough.js"></script>
```

The page defines `OVERVIEW` (mermaid string), `MAP` and `STEPS` in a plain `<script>` block and places
`<div id="overview">`, `<div id="map">` and `<div id="stepper">` where they should render.

Themes live in `themes/`: CSS variables (`--brand`, `--deep`, …) plus font/radius/shadow overrides, sourced from the company design system.

Release: commit, then `git tag v1.x.y && git push origin main v1.x.y`. Pages pin `@1`, so breaking changes need `v2`.
jsDelivr caches `@1` for up to 7 days; purge with `curl https://purge.jsdelivr.net/gh/dayatz/walkthrough-kit@1/<file>`.
