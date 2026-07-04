"""Retrofuturistic 中国传统色 matplotlib theme + motif helpers.

    palette.json ──► rcParams + role colors + flow/seal/key-fret motifs

Vibrant-yet-LIGHT: a warm silk-paper figure ground (缟 #F2ECDE) with data kept on
white for contrast, saturated traditional accents (vermilion / azure / jade / gold)
on chrome and linework. Import and call `apply()` once, then use the helpers.
"""
from __future__ import annotations

import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Circle, Rectangle, Polygon
from matplotlib.path import Path
from matplotlib.patches import PathPatch

_HERE = os.path.dirname(os.path.abspath(__file__))
PALETTE = json.load(open(os.path.join(_HERE, "..", "assets", "palette.json"), encoding="utf-8"))
ROLE = {k: v["hex"] for k, v in PALETTE["roles"].items()}
SERIES = PALETTE["series"]
FLOW = PALETTE["flow"]
CH = PALETTE["chart"]


_AVAIL = {f.name for f in matplotlib.font_manager.fontManager.ttflist}


def _first(cands, default):
    for c in cands:
        if c in _AVAIL:
            return c
    return default


def _font():
    """Prefer a geometric/CJK-friendly Latin face if installed; fall back gracefully."""
    return _first(["Poppins", "Futura", "Avenir Next", "Helvetica Neue", "Arial",
                   "Noto Sans SC", "Source Han Sans SC", "PingFang SC"], "DejaVu Sans")


# A font that actually carries CJK glyphs — used directly for seals / 中文 labels,
# since per-glyph fallback is unreliable across matplotlib builds.
CJK = _first(["Arial Unicode MS", "PingFang SC", "Heiti SC", "Songti SC",
              "Noto Sans SC", "Source Han Sans SC", "STSong"], "DejaVu Sans")
FAM = [_font(), CJK, "DejaVu Sans"]


def apply():
    """Set global rcParams for the theme. Idempotent."""
    f = _font()
    # per-glyph fallback so CJK (seals, 中文 labels) always renders on any host
    cjk = ["Arial Unicode MS", "Heiti SC", "Songti SC", "Noto Sans SC", "PingFang SC", "STSong"]
    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": [f] + cjk + ["DejaVu Sans"],
        "font.size": 10,
        "axes.titlesize": 14,
        "axes.titleweight": "bold",
        "axes.titlecolor": ROLE["azure"],
        "axes.labelsize": 11,
        "axes.labelcolor": CH["label"],
        "axes.edgecolor": CH["spine"],
        "axes.linewidth": 1.0,
        "xtick.color": CH["label"],
        "ytick.color": CH["label"],
        "text.color": CH["label"],
        "figure.dpi": 200,
        "savefig.dpi": 200,
    })
    return f


def style_axes(ax, grid="y"):
    """Apply the standard chart chrome: warm fig ground, white plot, faint grid."""
    ax.figure.patch.set_facecolor(CH["fig_bg"])
    ax.set_facecolor(CH["axes_bg"])
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(CH["spine"])
    ax.tick_params(direction="out", length=4, colors=CH["label"])
    if grid in ("y", "both"):
        ax.grid(axis="y", color=CH["grid"], linewidth=0.5, alpha=0.6)
    if grid in ("x", "both"):
        ax.grid(axis="x", color=CH["grid"], linewidth=0.5, alpha=0.6)
    ax.set_axisbelow(True)


def save(fig, path, dpi=200):
    fig.savefig(path, bbox_inches="tight", facecolor=CH["fig_bg"], dpi=dpi)
    plt.close(fig)


# ── decorative motifs ────────────────────────────────────────────────────────

def seal(ax, cx, cy, size, text, *, color=None, rot=3.0):
    """印章 — a rotated vermilion seal square with reversed (white) characters."""
    color = color or ROLE["seal_red"]
    r = Rectangle((cx - size / 2, cy - size / 2), size, size, facecolor=color,
                  edgecolor="none", zorder=5,
                  transform=_rot(ax, cx, cy, rot))
    ax.add_patch(r)
    inset = size * 0.10
    ax.add_patch(Rectangle((cx - size / 2 + inset, cy - size / 2 + inset),
                           size - 2 * inset, size - 2 * inset, facecolor="none",
                           edgecolor="white", linewidth=size * 6,
                           transform=_rot(ax, cx, cy, rot), zorder=6))
    ax.text(cx, cy, text, ha="center", va="center", color="white",
            fontsize=size * 90, weight="bold", zorder=7, family=CJK,
            transform=_rot(ax, cx, cy, rot))


def _rot(ax, cx, cy, deg):
    import matplotlib.transforms as mt
    return mt.Affine2D().rotate_deg_around(cx, cy, deg) + ax.transData


def moongate(ax, cx, cy, r, *, color=None, lw=1.8):
    """月亮门 — a thin gold moon-gate circle used to frame a hero/title block."""
    color = color or ROLE["gold"]
    ax.add_patch(Circle((cx, cy), r, facecolor="none", edgecolor=color, linewidth=lw, zorder=2))


def keyfret_band(ax, x0, x1, y, *, module=0.04, color=None, lw=2.0):
    """回纹 — a Greek-key / meander band drawn as a repeating square-spiral unit."""
    color = color or ROLE["gold"]
    m = module
    x = x0
    while x + m * 4 <= x1:
        # one meander unit (square spiral hook), in axes coords
        pts = [
            (x, y), (x, y + m * 2), (x + m * 3, y + m * 2), (x + m * 3, y),
            (x + m, y), (x + m, y + m), (x + m * 2, y + m), (x + m * 2, y + m * 0.4),
        ]
        ax.add_patch(PathPatch(Path(pts), facecolor="none", edgecolor=color,
                               linewidth=lw, transform=ax.transAxes, zorder=3,
                               joinstyle="miter", capstyle="butt"))
        x += m * 4
    # baseline rule ties the units together
    ax.plot([x0, x1], [y, y], color=color, linewidth=lw, transform=ax.transAxes, zorder=2)


def cloud_divider(ax, cx, y, *, w=0.18, color=None, lw=1.6):
    """祥云 — a simple symmetric auspicious-cloud scroll, centered, for dividers."""
    color = color or ROLE["gold"]
    import numpy as np
    t = np.linspace(0, 2 * np.pi, 200)
    for s in (-1, 1):
        x = cx + s * (w * 0.5) * 0.5 + s * (w * 0.18) * np.cos(t)
        yy = y + (w * 0.10) * np.sin(t) + (w * 0.05) * np.sin(3 * t)
        ax.plot(x, yy, color=color, linewidth=lw, transform=ax.transAxes, zorder=3)
    ax.plot([cx - w / 2, cx + w / 2], [y, y], color=color, linewidth=lw * 0.6,
            transform=ax.transAxes, zorder=2, alpha=0.6)


# ── flow diagram ─────────────────────────────────────────────────────────────

def flow_box(ax, x, y, w, h, text, role="process", *, fs=9):
    spec = FLOW.get(role, FLOW["process"])
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.5,rounding_size=2.2",
                                linewidth=1.4, facecolor=spec["fill"], edgecolor=spec["border"],
                                zorder=3))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", color=spec["text"],
            fontsize=fs, weight="bold", zorder=4)


def flow_diamond(ax, cx, cy, w, h, text, role="decision", *, fs=8.5):
    spec = FLOW.get(role, FLOW["decision"])
    pts = [(cx, cy + h / 2), (cx + w / 2, cy), (cx, cy - h / 2), (cx - w / 2, cy)]
    ax.add_patch(Polygon(pts, closed=True, facecolor=spec["fill"], edgecolor=spec["border"],
                         linewidth=1.4, zorder=3))
    ax.text(cx, cy, text, ha="center", va="center", color=spec["text"], fontsize=fs,
            weight="bold", zorder=4)


def flow_arrow(ax, x1, y1, x2, y2, *, color=None, style="-|>", rad=0.0, label=None, lcolor=None):
    color = color or FLOW["arrow"]
    cs = f"arc3,rad={rad}" if rad else None
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=14,
                 lw=1.6, color=color, connectionstyle=cs, zorder=2))
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 - 1.2, label, ha="center", color=lcolor or color,
                fontsize=8, style="italic", zorder=4)
