<!-- Source: deep-research synthesis (5 angles, 57 findings, adversarially
fact-checked — 群青/赤金 chosen over disputed 石青/明黄). This is the design
reference behind assets/palette.json and assets/theme.css. -->

# Retrofuturistic 中国传统色 Report Theme — Design Spec

## Design principles

- **Light, sun-drenched ground — not cyberpunk dark.** Invert the neon-on-black formula: a warm pale paper background carries a few high-saturation traditional accents. 1960s retro-futurism reads "warm and bright," cyberpunk reads "neon on dark" — choose the former [depositphotos.com](https://blog.depositphotos.com/retro-futurism-art-design.html).
- **Reserve red for the single most important element per view.** Chinese red carries the strongest cultural weight (luck/prosperity), so 朱红/朱砂 marks one thing — the H1 accent, key stat, or seal — never spread across a page [en.wikipedia.org](https://en.wikipedia.org/wiki/Color_in_Chinese_culture).
- **One hot warm + one electric cool = the "neon" of a light theme.** Pair vermilion against azure for primary tension; let gold do the retro-luxe rules and dividers [boxingp.github.io](https://boxingp.github.io/traditional-chinese-colors/).
- **Color lives on lines and chrome, not large fills.** Decorative linework in red/gold over a light ivory ground; keep big areas pale (paper, panel, row tints). This is the "printed lithographic poster" flatness, not glossy 3D.
- **Two-weight line discipline.** Hairline 0.5pt for table/lattice gridlines; 1.5–2pt for header/divider motif bands. Nothing in between, so the page reads structured.
- **Geometric-rounded forms over ornate ones.** Combine retro-futurist shapes (rounded stat cards, atomic starbursts, concentric circles) with traditional geometry (moon-gate circles, key-fret bands, lattice grids, the seal square) [depositphotos.com](https://blog.depositphotos.com/retro-futurism-art-design.html).
- **Avoid:** dark/parchment chart backgrounds (they break validated contrast — keep data on white), pure black text (use soft ink 墨/黛), gradient hero overlays, more than 1–2 accents in body copy, and muddy adjacent earth tones in charts.
- **Soften the ink.** Body text and rules use traditional ink-greys (墨 #50616D, 黛 #4A4266), never #000000 — period-correct and easier on the warm paper.

## Palette

Hexes are the de-facto web-standard 中国传统色 set (zhongguose-origin, mirrored at webhek.com / cnblogs); treat as authentic-canonical for screen/DOCX, approximate vs. physical pigment.

| Role | Color (中文) | pinyin | English | Hex |
|---|---|---|---|---|
| page-background (light warm) | 缟 | gǎo | silk off-white | `#F2ECDE` |
| page-background (alt, ivory) | 象牙白 | xiàngyábái | ivory | `#FFFBF0` |
| surface / panel fill | 牙 | yá | ivory-sidebar | `#EEDEB0` |
| ink / primary-text | 墨 | mò | ink (slate) | `#50616D` |
| heading | 黛 | dài | ink blue-black | `#4A4266` |
| accent-seal-red | 朱砂 | zhūshā | cinnabar (seal red) | `#FF461F` |
| accent-banner-red | 朱红 | zhūhóng | vermilion | `#FF4C00` |
| accent-azure-blue | 群青 | qúnqīng | azure/ultramarine | `#4C8DAE` |
| accent-deep-blue | 靛 | diàn | deep indigo | `#065279` |
| accent-jade-green | 碧色 | bìsè | bright jade | `#1BD1A5` |
| gold | 赤金 | chìjīn | red-gold | `#F2BE45` |
| success | 石绿 | shílǜ | malachite green | `#16A951` |
| warning | 藤黄 | ténghuáng | gamboge | `#FFB61E` |
| danger | 朱红 | zhūhóng | vermilion | `#FF4C00` |
| muted-text | 苍色 | cāngsè | grey-cyan | `#75878A` |
| hairline / border | 黛蓝 | dàilán | slate blue | `#425066` |
| row-tint / panel-light | 月白 | yuèbái | moon-white (pale blue) | `#D6ECF0` |
| deep-seal (alt) | 银朱 | yínzhū | silver-cinnabar | `#BF242A` |

Notes: **石青** "azurite blue" is given as `#1685A9` in some mirrors but the cited webhek/cnblogs tables list 石青 = `#7BCFA6` (a jade) — disputed, so I use the CONFIRMED 群青 `#4C8DAE` for the azure role instead. **明黄/雌黄**: `#FFC64B` authoritatively belongs to 雌黄 (orpiment), not 明黄; I use the CONFIRMED 赤金 `#F2BE45` for gold rather than that disputed pair. **天青** (sky-cyan) has no confirmed hex (≈`#88ADAB` approx) and is omitted.

## Chart series palette

Ordered for mutual contrast on the light `#F2ECDE`/white ground, alternating warm/cool so no two adjacent series share a hue family. **Use the first two for any 2-series chart** (the cool-dark/warm high-contrast pair). Cap categorical use at ~4 strong series; 5–8 only when essential, then aggregate/facet — the UK Gov Analysis Function's actual limit is **four** categories, with later colors "only when essential" [analysisfunction.civilservice.gov.uk](https://analysisfunction.civilservice.gov.uk/policy-store/codes-for-accessible-colours/).

1. `#4C8DAE` — 群青 qúnqīng (azure) — *use first*
2. `#FF4C00` — 朱红 zhūhóng (vermilion) — *use second; together these are the highest-contrast pair*
3. `#16A951` — 石绿 shílǜ (malachite green)
4. `#F2BE45` — 赤金 chìjīn (red-gold)
5. `#8C4356` — 绛紫 jiàngzǐ (deep crimson-purple)
6. `#789262` — 竹青 zhúqīng (bamboo green)
7. `#B35C44` — 茶色 chásè (tea brown)
8. `#4A4266` — 黛 dài (ink blue-black)

Pair every muted earth tone (#789262, #B35C44, #4A4266) against a saturated accent or near-white buffer. Reserve `#FF4C00` for a **single** role per artifact (lead series OR highlight/error) — never both.

## Typography

Retro-futurism favors geometric/rounded type [depositphotos.com](https://blog.depositphotos.com/retro-futurism-art-design.html); pair it with a CJK-friendly modern Hei to read "future" while staying legible.

**Headings** — geometric sans Latin + geometric CJK:
- Latin: **Poppins** (or Futura / Avenir), weight **600–700**.
- CJK: **Source Han Sans SC / Noto Sans SC** (思源黑体), weight **Medium–Bold**.
- Sizes: H1 **18pt**, H2 **15pt**, H3 **13pt** (all bold). Apply light letter-tracking (`+40–80`) to H1/section openers only for the deliberate retro feel — never to body.

**Body** — clean humanist for line readability:
- Latin: **Inter** (or a Garamond/serif if you want classical warmth), **11pt**.
- CJK captions/notes: **Source Han Serif / 思源宋体** at 10–11pt to stay culturally on-theme.
- Line height **1.3–1.4×** (≈14.3–15.4pt at 11pt); target **40–60 characters per line** [figma.com](https://www.figma.com/resource-library/typography-in-design/); left-aligned, ragged-right (avoids justification rivers) [mhcautomation.com](https://www.mhcautomation.com/blog/how-to-make-a-document-look-professional-in-8-steps/).

**Evoke without hurting readability:** put the personality in headings (geometric face, tracking, color, gold rule beneath) and keep body in soft ink `#50616D` on warm paper. Emphasize inline with **bold/italic only** — never color or size shifts in running text [mhcautomation.com](https://www.mhcautomation.com/blog/how-to-make-a-document-look-professional-in-8-steps/).

## Components

**Cover page** — warm `#F2ECDE` ground. Title in 群青 `#4C8DAE` geometric sans (24–32pt bold), subtitle 14pt italic in 黛 `#4A4266`, metadata 10–11pt in 苍色 `#75878A`. A thin **gold moon-gate circle** (`#F2BE45`, 1.5pt stroke) frames a hero figure or the title block; a **red seal-square** (朱砂 `#FF461F`, ~28mm, slightly rotated 2–4°, white reversed character inside) sits lower-right. One primary + one neutral + one accent only [rewritebar.com](https://rewritebar.com/articles/creating-a-cover-page).

**Section header (with motif)** — H1 in geometric sans, 群青 `#4C8DAE`, with a **key-fret (回纹) band** rule beneath: 1.5–2pt, ~12–16px module, drawn in 赤金 `#F2BE45` (or 朱砂 `#FF461F` for the lead section). Optional small **chapter-seal glyph** (朱砂 square) to the left of the title. 回 = "return," symbolizing cyclical renewal [en.wikipedia.org](https://en.wikipedia.org/wiki/List_of_Chinese_symbols,_designs,_and_art_motifs).

**Divider** — a single 1.5pt key-fret or **cloud-scroll (祥云)** ornament centered between sections; uniform single-weight stroke (~1–1.5pt) in 赤金 `#F2BE45` on the paper ground. Five-color 五彩祥云 (red/blue/black/yellow/white) is the canonical palette cue if you want a multi-hue flourish [en.wikipedia.org](https://en.wikipedia.org/wiki/Xiangyun_(Auspicious_clouds)).

**Callout box** — rounded-corner card, fill 牙 ivory `#EEDEB0` or pale 月白 `#D6ECF0`, 1pt border in 群青 `#4C8DAE`, with a 3pt left accent bar in 朱砂 `#FF461F` (alert) / 石绿 `#16A951` (success) / 藤黄 `#FFB61E` (warning). Optional 5–8% opacity ice-crack (冰裂纹) texture behind for subtle traditional grain.

**Table styling** — lattice (窗格) discipline: hairline **0.5pt** gridlines in 黛蓝 `#425066`; **header row fill** 牙 `#EEDEB0` (or 赤金 `#F2BE45`) with 黛 `#4A4266` bold text; alternating row banding at ~`#D6ECF0` 月白. No heavy outer border — let the lattice grid define structure.

**印章 / seal accent** — square or round vermilion stamp, 朱砂 `#FF461F` or deep 银朱 `#BF242A`, white reversed character inside, rotated 2–4° for a hand-stamped feel; used as cover mark and page-footer brand glyph. Conveys authority/authenticity [en.wikipedia.org](https://en.wikipedia.org/wiki/List_of_Chinese_symbols,_designs,_and_art_motifs).

**Figure caption** — centered, "Figure N." in 黛 `#4A4266` bold + caption text in 苍色 `#75878A` 10pt, optionally CJK in 思源宋体. A thin 0.75pt 赤金 `#F2BE45` rule may sit above the caption to tie figure to text.

## Chart & diagram theming

matplotlib-level rcParams and rules (data validated on white, warmth in chrome):

- **Figure background:** `#F2ECDE` (`fig.patch.set_facecolor`) so the chart sits on the warm page.
- **Axes/plot background:** `#FFFFFF` (or near-white 月白 `#D6ECF0`) — keep data on white; coloured grounds break accessibility contrast [analysisfunction.civilservice.gov.uk](https://analysisfunction.civilservice.gov.uk/policy-store/codes-for-accessible-colours/).
- **Grid:** single faint horizontal grid, color `#E0E0E0`, `linewidth=0.5`, `alpha=0.4`, `zorder` below data; drop vertical gridlines.
- **Spines:** `ax.spines[['top','right']].set_visible(False)`; left/bottom in 墨 `#50616D`. Ticks `direction='out', length=4`.
- **Font:** title geometric/condensed (Oswald / Barlow Condensed) ~15pt bold; tick/axis labels Inter or Source Han Sans 9–11pt. rcParams baseline `font.size=10, axes.titlesize=15, axes.labelsize=11`.
- **Text/labels = near-black, never a palette hue:** tick labels, axis titles, value labels in `#3D3D3D` (Gov dark grey) for WCAG-AA on white [analysisfunction.civilservice.gov.uk](https://analysisfunction.civilservice.gov.uk/policy-store/codes-for-accessible-colours/). On dark fills (朱红/石绿/竹青) switch label text to white.
- **Bars/wedges:** 100% opaque flat fills, thin **0.75pt** outline in 黛 `#4A4266`, square caps — the crisp lithographic look. Single-series bars in 群青 `#4C8DAE` with the highlighted bar in 朱红 `#FF4C00`; gold `#F2BE45` reserved for target/threshold lines.
- **Categorical series:** use the ordered 8-color list above; define one `category→hex` dict and reuse it across every chart and diagram so a category keeps its color document-wide.

**Flow-diagram color roles** (by semantic function):
- Normal process box: fill 月白 `#D6ECF0`, border 群青 `#4C8DAE` 1–1.5pt.
- Start/terminal node: fill 石绿 `#16A951` (white label text).
- Decision diamond: fill 藤黄/鹅黄 `#FFB61E`/`#FFF143` (highest luminance draws the eye to branch points), label `#3D3D3D`.
- Error/critical node: fill 朱红 `#FF4C00` (white label text).
- Arrows/connectors: 黛 `#4A4266`, 1.5–2pt, solid arrowheads.

## DOCX layout

- **Page:** US Letter 8.5"×11", **1" margins** all sides [mhcautomation.com](https://www.mhcautomation.com/blog/how-to-make-a-document-look-professional-in-8-steps/). (Use A4 + 2.5cm margins if the audience is metric.)
- **Use named Word styles** (Heading 1/2/3) — never hand-bolding — so the TOC auto-generates and the doc stays accessible [pressbooks.bccampus.ca](https://pressbooks.bccampus.ca/technicalwriting/chapter/headings/).
- **Heading sizes:** H1 18pt bold, 群青 `#4C8DAE`, with a 2–3pt 赤金 `#F2BE45` bottom border (key-fret band where rendered as image). H2 15pt bold, 朱红 `#FF4C00`. H3 13pt bold, 黛 `#4A4266`.
- **Body:** 11pt, 墨 `#50616D` (or 黛 `#4A4266`) on 缟 `#F2ECDE`/象牙白 `#FFFBF0`; line spacing 1.3–1.4×; left-aligned; no first-line indent on the first paragraph after a heading.
- **Figures + captions:** images placed **between paragraphs, center-aligned**, ≥300 DPI; numbered "Figure N." caption beneath in 黛 bold + 苍色 `#75878A` 10pt, optional 0.75pt gold rule above [mhcautomation.com](https://www.mhcautomation.com/blog/how-to-make-a-document-look-professional-in-8-steps/).
- **Table header fill:** 牙 `#EEDEB0` (or 赤金 `#F2BE45`) with 黛 bold text; 0.5pt 黛蓝 `#425066` gridlines; alternating row banding 月白 `#D6ECF0`.
- **Cover/section touches:** warm off-white cover with the red seal-square + thin gold moon-gate circle; a key-fret or cloud-scroll divider at major section breaks; whitespace kept generous (chunk with section/page breaks) for the light, airy retrofuturistic feel. Limit to 1–2 accent colors + neutral across the whole document — accents on headings/rules/table headers, not body text [officetemplatesonline.com](https://officetemplatesonline.com/cover-pages-for-ms-word/).
