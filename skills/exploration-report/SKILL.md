---
name: exploration-report
description: >-
  Turn exploration/research output (findings plus a synthesized report) into a
  polished, themed .docx — cover page, a methodology flow diagram, and data
  visualizations — in a vibrant-light retrofuturistic 中国传统色 (traditional
  Chinese) theme. Use when the user wants a designed report, whitepaper, or docx
  out of research/exploration results (e.g. delapan_explore, the 8queens society,
  or a deep-research run), especially when they ask for flow diagrams, charts, or
  a Chinese / retrofuturistic aesthetic.
---

# exploration-report

Render a synthesized research/exploration report into a designed `.docx`:
**cover → flow diagram → sectioned report with inline charts**, all themed in a
warm-paper retrofuturistic palette built from authentic 中国传统色 (see
[`references/design-spec.md`](references/design-spec.md)). GFM tables and citation
hyperlinks in the source markdown are preserved.

## When to use

The user has the *output* of an exploration/research step — a synthesized report
(markdown) and some quantitative findings — and wants it as a polished, illustrated,
themed Word document. Typical inputs: a `delapan_explore` / 8queens-society report,
a deep-research synthesis, or any research write-up with tables and numbers.

## Pipeline (one command)

```bash
python scripts/render.py path/to/report.json
```

`render.py` does it all: auto-builds a themed cover, renders every figure
(`make_figures.py` + `theme.py`), assembles the docx (`build_report.mjs`, preserving
tables + links), and structurally validates the result.

## Setup (once)

- **Python** running `render.py`/`make_figures.py` needs `matplotlib` + `numpy`
  (`python -m venv .venv && .venv/bin/pip install matplotlib`). A CJK system font
  (PingFang/Heiti/Arial Unicode/Noto Sans SC) is auto-detected for seals & 中文.
- **Node deps** are vendored in `scripts/` — run `npm install` in `scripts/` once
  (installs `marked`, `html-to-docx`, `image-size`). `node` must be on PATH.

## The manifest — `report.json`

```jsonc
{
  "title": "Open-Weight LLMs in 2026",
  "subtitle": "Who leads on benchmarks, licensing, and adoption",
  "meta": ["Deep-research report", "83 findings · adversarially fact-checked"],
  "date": "June 2026",
  "seal": "探",                       // 1–2 CJK chars for the cover 印章 seal
  "report_md": "report.md",          // the synthesized report (markdown; relative to the manifest)
  "out": "report.docx",
  "figures": [ /* see below */ ]
}
```

`title/subtitle/meta/seal/date` drive the auto-generated cover. Set `"cover": false`
to skip it. Paths are resolved relative to the manifest file.

### Figures

Each figure has an `id`, a `type`, a `caption` (rendered beneath it), and an
`after_heading` placement: a substring of the `<h2>` to insert it *after*, `"TOP"`
(before the first section), or omit to append at the end.

| type | required fields | notes |
|---|---|---|
| `flow` | `stages:[{text,role}]` **or** `nodes:[{id,x,y,w,h,text,role,shape}]`+`edges` | linear `stages` auto-layout; optional `feedback:{from,to,label}` arc. roles: `process`/`accent`/`decision`/`terminal`/`error` |
| `hbar` | `labels:[]`, `values:[]` | `xlabel`, `highlight:<idx>` (vermilion), `colors:[]` (per-bar), `fmt` (e.g. `"{:g}T"`) |
| `bar` | `x:[]`, `y:[]` | `ylabel`, `highlight:<idx>` |
| `grouped_bar` | `groups:[]`, `series:[{name,values}]` | `ylabel`, `legend_loc` |
| `line` | `x:[]`, `series:[{name,values}]` | `ylabel` |

Use a **`flow`** for the methodology/"how this was made" diagram, and chart types
for the report's quantitative findings. Keep categorical series ≤4 where possible;
the theme's ordered series palette starts azure → vermilion (highest-contrast pair).

## Theming

[`assets/palette.json`](assets/palette.json) is the **single source of truth** —
roles → authentic 中国传统色 + hex, the ordered chart-series palette, and flow-node
role colors. `theme.py` reads it for figures; `build_report.mjs` reads it to *inline*
per-tag styles into the docx (html-to-docx ignores `<style>` blocks, so styles must
be inlined). [`assets/theme.css`](assets/theme.css) is a human-readable mirror of the
same rules. All of it derives from the fact-checked
[`references/design-spec.md`](references/design-spec.md). **Edit `palette.json` to
retune the whole document.** Principle: **vibrant but LIGHT** — warm paper ground,
data on white, one saturated accent per view, soft ink text (never pure black).

## Output

A validated `.docx` (cover + flow + sectioned report + inline charts, themed
headings/tables, page numbers). `render.py` prints a `VALIDATION:` line with image,
table, and hyperlink counts.

## Consuming a real run (adapters)

[`scripts/from_run.py`](scripts/from_run.py) maps a live run's own output straight
into the manifest (deterministic — no LLM; it shapes the run's findings + synthesized
text and adds a methodology flow + a findings chart):

```bash
# 8queens society run (the captured summary JSON + the synthesized report markdown)
python scripts/from_run.py society <summary.json> <report.md> <out_dir> ["Title"]

# delapan findings (a delapan_search / delapan_resume JSON, or a bare list of
# finding rows with title/content/category — grouped into sections by category)
python scripts/from_run.py delapan <findings.json> <out_dir> ["Title"] ["topic"]
```

`society` adds a society flow diagram + a *findings-per-gap* bar colored by coverage
(green rich · gold sparse · red gap). `delapan` adds the explore-pipeline flow + a
*findings-by-category* bar. Both then run `render.py` to produce the themed docx.
See [`examples/runs/society/`](examples/runs/society/) and
[`examples/runs/delapan/`](examples/runs/delapan/) for real outputs.

## Worked example

[`examples/report.json`](examples/report.json) + [`examples/open-weight-llms.md`](examples/open-weight-llms.md)
→ run `python scripts/render.py examples/report.json` to produce
`examples/Open-Weight-LLMs-2026-themed.docx` (cover, methodology flow, 5 charts,
3 tables, ~140 live citation links).
