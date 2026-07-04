"""Generate themed figures (cover, flow diagram, charts) from a figures.json spec.

    figures.json ──► theme.py ──► <out_dir>/<id>.png  (+ prints a manifest line)

Usage:
    python make_figures.py figures.json out_dir/

figures.json:
{
  "figures": [
    {"id":"cover","type":"cover","title":"...","subtitle":"...","meta":[".."],"seal":"探"},
    {"id":"flow","type":"flow","title":"...","stages":[{"text":"Topic","role":"accent"},...],
       "feedback":{"from":3,"to":2,"label":"reopen if gap"}},
    {"id":"f1","type":"hbar","title":"..","labels":[..],"values":[..],"xlabel":".."},
    {"id":"f2","type":"grouped_bar","title":"..","groups":[..],"series":[{"name":"..","values":[..]}],"ylabel":".."},
    {"id":"f3","type":"bar","title":"..","x":[..],"y":[..],"ylabel":"..","highlight":0},
    {"id":"f4","type":"line","title":"..","x":[..],"series":[{"name":"..","values":[..]}],"ylabel":".."}
  ]
}
Every figure may add "caption" (used by build_report.mjs) and "after_heading" (placement).
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import theme as T

T.apply()
import matplotlib.pyplot as plt

ROLE, SERIES, CH = T.ROLE, T.SERIES, T.CH


def _vlabel(ax, bars, vals, fmt="{:g}", off=0.01, horizontal=False):
    span = (max(vals) - min(min(vals), 0)) or 1
    for b, v in zip(bars, vals):
        if horizontal:
            ax.text(b.get_width() + span * off, b.get_y() + b.get_height() / 2,
                    fmt.format(v), va="center", ha="left", fontsize=8.5,
                    color=CH["label"], weight="bold")
        else:
            ax.text(b.get_x() + b.get_width() / 2, b.get_height() + span * off,
                    fmt.format(v), ha="center", va="bottom", fontsize=8.5,
                    color=CH["label"], weight="bold")


def fig_cover(spec):
    fig = plt.figure(figsize=(6.5, 9.0))
    ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off")
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    fig.patch.set_facecolor(ROLE["page_bg"])
    ax.add_patch(plt.Rectangle((0, 0), 1, 1, facecolor=ROLE["page_bg"], zorder=0))
    T.keyfret_band(ax, 0.08, 0.92, 0.90, module=0.035, color=ROLE["gold"], lw=2.0)
    T.keyfret_band(ax, 0.08, 0.92, 0.085, module=0.035, color=ROLE["gold"], lw=2.0)
    T.moongate(ax, 0.5, 0.60, 0.30, color=ROLE["gold"], lw=2.2)
    ax.text(0.5, 0.66, spec["title"], ha="center", va="center", color=ROLE["azure"],
            fontsize=23, weight="bold", wrap=True, family=T.FAM)
    if spec.get("subtitle"):
        ax.text(0.5, 0.55, spec["subtitle"], ha="center", va="center", color=ROLE["heading"],
                fontsize=12.5, style="italic", wrap=True, family=T.FAM)
    y = 0.30
    for line in spec.get("meta", []):
        ax.text(0.5, y, line, ha="center", va="center", color=ROLE["muted"], fontsize=10.5,
                family=T.FAM)
        y -= 0.035
    T.seal(ax, 0.80, 0.16, 0.085, spec.get("seal", "探"))
    return fig


def fig_flow(spec):
    fig, ax = plt.subplots(figsize=(7.4, 3.4))
    ax.set_xlim(0, 100); ax.set_ylim(0, 46); ax.axis("off")
    fig.patch.set_facecolor(CH["fig_bg"])
    nodes = spec.get("nodes")
    if nodes:
        nd = {n["id"]: n for n in nodes}
        for n in nodes:
            if n.get("shape") == "diamond":
                T.flow_diamond(ax, n["x"] + n["w"] / 2, n["y"] + n["h"] / 2, n["w"], n["h"],
                               n["text"], n.get("role", "decision"))
            else:
                T.flow_box(ax, n["x"], n["y"], n["w"], n["h"], n["text"], n.get("role", "process"))
        for e in spec.get("edges", []):
            a, b = nd[e["from"]], nd[e["to"]]
            T.flow_arrow(ax, a["x"] + a["w"], a["y"] + a["h"] / 2, b["x"], b["y"] + b["h"] / 2,
                         rad=e.get("rad", 0), label=e.get("label"))
    else:
        stages = spec["stages"]
        n = len(stages); gap = 4
        w = (100 - gap * (n - 1) - 4) / n
        h = 13; y = 18
        xs = []
        for i, s in enumerate(stages):
            x = 2 + i * (w + gap); xs.append(x)
            T.flow_box(ax, x, y, w, h, s["text"], s.get("role", "process"), fs=8.5)
        for i in range(n - 1):
            T.flow_arrow(ax, xs[i] + w, y + h / 2, xs[i + 1], y + h / 2)
        fb = spec.get("feedback")
        if fb:
            fa, fb2 = fb["from"], fb["to"]
            x1 = xs[fa] + w / 2; x2 = xs[fb2] + w / 2
            T.flow_arrow(ax, x1, y, x2, y, color=ROLE["banner_red"], rad=-0.5,
                         label=fb.get("label"), lcolor=ROLE["banner_red"])
    if spec.get("title"):
        ax.set_title(spec["title"], color=ROLE["azure"], fontsize=12.5, pad=10, weight="bold")
    return fig


def _barfig(title, suptitle=None):
    fig, ax = plt.subplots(figsize=(7.4, 3.4))
    T.style_axes(ax)
    if title:
        ax.set_title(title, color=ROLE["azure"])
    return fig, ax


def fig_hbar(spec):
    fig, ax = _barfig(spec.get("title"))
    labels, vals = spec["labels"], spec["values"]
    y = list(range(len(labels)))[::-1]
    colors = spec.get("colors") or [SERIES[0]] * len(labels)
    if spec.get("highlight") is not None:
        colors = [SERIES[0]] * len(labels); colors[spec["highlight"]] = ROLE["banner_red"]
    bars = ax.barh(y, vals, color=colors, height=0.64, edgecolor=CH["outline"], linewidth=0.75)
    ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=9.5)
    _vlabel(ax, bars, vals, fmt=spec.get("fmt", "{:g}"), horizontal=True)
    ax.set_xlim(0, max(vals) * 1.18)
    if spec.get("xlabel"): ax.set_xlabel(spec["xlabel"], fontsize=9)
    ax.grid(axis="x", color=CH["grid"], linewidth=0.5, alpha=0.6); ax.grid(axis="y", visible=False)
    return fig


def fig_bar(spec):
    fig, ax = _barfig(spec.get("title"))
    x, y = spec["x"], spec["y"]
    colors = [SERIES[0]] * len(x)
    if spec.get("highlight") is not None: colors[spec["highlight"]] = ROLE["banner_red"]
    bars = ax.bar(range(len(x)), y, color=colors, width=0.62, edgecolor=CH["outline"], linewidth=0.75)
    ax.set_xticks(range(len(x))); ax.set_xticklabels(x, fontsize=9)
    _vlabel(ax, bars, y, fmt=spec.get("fmt", "{:g}"))
    ax.set_ylim(0, max(y) * 1.16)
    if spec.get("ylabel"): ax.set_ylabel(spec["ylabel"], fontsize=9)
    return fig


def fig_grouped(spec):
    fig, ax = _barfig(spec.get("title"))
    groups, series = spec["groups"], spec["series"]
    x = np.arange(len(groups)); n = len(series); w = 0.8 / n
    allv = []
    for i, s in enumerate(series):
        off = (i - (n - 1) / 2) * w
        bars = ax.bar(x + off, s["values"], w, label=s["name"], color=SERIES[i % len(SERIES)],
                      edgecolor=CH["outline"], linewidth=0.6)
        allv += s["values"]
        for xi, v in zip(x + off, s["values"]):
            ax.text(xi, v + max(allv) * 0.012, f"{v:g}", ha="center", fontsize=7.5, color=CH["label"])
    ax.set_xticks(x); ax.set_xticklabels(groups, fontsize=9)
    ax.set_ylim(0, max(allv) * 1.16)
    if spec.get("ylabel"): ax.set_ylabel(spec["ylabel"], fontsize=9)
    ax.legend(fontsize=8, frameon=False, loc=spec.get("legend_loc", "upper right"))
    return fig


def fig_line(spec):
    fig, ax = _barfig(spec.get("title"))
    x = spec["x"]
    for i, s in enumerate(spec["series"]):
        ax.plot(x, s["values"], marker="o", color=SERIES[i % len(SERIES)], linewidth=2,
                markersize=5, label=s["name"])
    if spec.get("ylabel"): ax.set_ylabel(spec["ylabel"], fontsize=9)
    ax.legend(fontsize=8, frameon=False)
    return fig


BUILDERS = {"cover": fig_cover, "flow": fig_flow, "hbar": fig_hbar, "bar": fig_bar,
            "grouped_bar": fig_grouped, "line": fig_line}


def main():
    spec_path, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    spec = json.load(open(spec_path, encoding="utf-8"))
    manifest = []
    for f in spec["figures"]:
        b = BUILDERS.get(f["type"])
        if not b:
            print("SKIP unknown type:", f.get("type"), file=sys.stderr); continue
        fig = b(f)
        path = os.path.join(out_dir, f["id"] + ".png")
        T.save(fig, path)
        manifest.append({"id": f["id"], "type": f["type"], "file": path,
                         "caption": f.get("caption", ""), "after_heading": f.get("after_heading", "")})
        print("wrote", path)
    json.dump(manifest, open(os.path.join(out_dir, "_manifest.json"), "w"), indent=1)
    print("MANIFEST", len(manifest), "figures")


if __name__ == "__main__":
    main()
