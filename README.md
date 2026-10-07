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

## alloc3d: isometric 3D allocation scene

A stepper-driven Three.js scene for "how does courier allocation pick a partner": shortlist pad, one or two filter gates,
a lookup cabinet with one drawer per job (firstmile / lastmile / domestic), bypass lane, partner docks, audit log.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/dayatz/walkthrough-kit@1/walkthrough.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/dayatz/walkthrough-kit@1/themes/<name>.css"> <!-- optional -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/dayatz/walkthrough-kit@1/alloc3d/alloc3d.css">
<script type="module" src="https://cdn.jsdelivr.net/gh/dayatz/walkthrough-kit@1/alloc3d/alloc3d.js"></script>
```

Markup: `<div class="a3d"><aside><header>…</header><div class="eli5">…</div><div id="a3d-ui"></div><footer>…</footer></aside><div id="a3d-stage"></div></div>`.
Data, in a plain `<script>`: `window.ALLOC3D = { chain, mapLabel, sql?, scenarios }`.

- `chain`: allocator names in run order (shown on the "who runs?" board).
- `scenarios[key]`: `btn [title, sub]`, `tn`, `route`, `postal`, `payment`, `shortlist [title, sub]`, `pool`, `ran` (names from `chain`),
  `gates` (1–2 × `[name, class]`), `docks` (2 × `[name, sub]`: pass-through survivor, judged survivor), `map { job: [partnerName|null, note] }`,
  `log` (html), optional `zero` (lookup error empties the order), `retries` + `retryEnd`, and `steps`.
- `pool` items: `{ name, id, foreign? , leg, partner, dflt?, label?: false, group?: { name, pool, job, drop } }`. `foreign` = not this
  filter's courier (takes the bypass). Layout is automatic: ≤ 4 judged couriers in a row, more in a 3-deep grid.
- `steps`: `{ ph, t, b, q?: [gate1 label, gate2 label] }`, `ph` one of
  `arrive pool chain lookup mine job pick compare gate2 end`. Deep link: `#s=<scenario>&step=<n>`.
