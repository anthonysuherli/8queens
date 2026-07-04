// Assemble a themed .docx from a build manifest: cover image + markdown report +
// inline figures, themed from assets/palette.json. Preserves GFM tables + hyperlinks.
//
//   node build_report.mjs build-manifest.json
//
// html-to-docx honors INLINE styles (not <style> selectors), so the theme is
// applied by inlining per-tag styles derived from the palette.

import { readFileSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';
import HTMLtoDOCX from 'html-to-docx';
import { imageSize } from 'image-size';

const PAL = JSON.parse(readFileSync(new URL('../assets/palette.json', import.meta.url), 'utf8'));
const R = Object.fromEntries(Object.entries(PAL.roles).map(([k, v]) => [k, v.hex]));

const m = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const COVER_W = 600, FIG_W = 580;

// per-tag inline styles (the parts html-to-docx actually renders)
const STYLE = {
  h1: `color:${R.azure};font-size:18pt;font-weight:700;border-bottom:3px solid ${R.gold};`,
  h2: `color:${R.banner_red};font-size:15pt;font-weight:700;border-bottom:1.5px solid ${R.gold};`,
  h3: `color:${R.heading};font-size:12.5pt;font-weight:700;`,
  p:  `color:${R.ink};`,
  li: `color:${R.ink};`,
  th: `background-color:${R.surface};color:${R.heading};font-weight:700;border:0.5px solid ${R.hairline};padding:4pt 6pt;`,
  td: `color:${R.ink};border:0.5px solid ${R.hairline};padding:4pt 6pt;`,
  blockquote: `border-left:3px solid ${R.seal_red};background-color:${R.page_bg};color:${R.ink};padding:6pt 10pt;`,
  hr: `border:none;border-top:1.5px solid ${R.gold};`,
};

function inlineStyles(html) {
  for (const [tag, style] of Object.entries(STYLE)) {
    html = html.replace(new RegExp(`<${tag}(\\s[^>]*)?>`, 'g'), (full, attrs = '') => {
      if (/\bstyle=/.test(attrs)) return full;      // leave already-styled tags (figures) alone
      return `<${tag}${attrs || ''} style="${style}">`;
    });
  }
  return html;
}

function imgHtml(file, width, caption) {
  const buf = readFileSync(file);
  const { width: iw, height: ih } = imageSize(buf);
  const w = Math.min(width, iw);
  const h = Math.round(w * ih / iw);
  const b64 = buf.toString('base64');
  let html = `<p align="center" style="margin:14px 0 4px;">` +
    `<img src="data:image/png;base64,${b64}" width="${w}" height="${h}" alt="figure"/></p>`;
  if (caption) {
    html += `<p align="center" style="margin:0 0 16px;color:${R.muted};font-size:9pt;font-style:italic;">${caption}</p>`;
  }
  return html;
}

marked.setOptions({ gfm: true, breaks: false });
let html = inlineStyles(marked.parse(readFileSync(m.report_md, 'utf8')));

for (const f of (m.figures || [])) {
  const block = imgHtml(f.file, f.width || FIG_W, f.caption);
  const where = f.after_heading || '';
  if (where === 'TOP') {
    const mm = html.match(/<h[23][^>]*>/);
    html = mm ? html.replace(mm[0], block + mm[0]) : block + html;
  } else if (where) {
    const re = new RegExp(`<h[23][^>]*>[^<]*${where.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*</h[23]>`, 'i');
    const mm = html.match(re);
    if (mm) html = html.replace(mm[0], mm[0] + block);
    else { console.error('after_heading not found:', where); html += block; }
  } else {
    html += block;
  }
}

const cover = m.cover
  ? imgHtml(m.cover, COVER_W, '') + `<div style="page-break-after: always;"></div>`
  : '';

const full = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
  `<body>${cover}${html}</body></html>`;

const opts = {
  orientation: 'portrait',
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  title: m.title || 'Report',
  pageNumber: true,
  footer: true,
  font: 'Calibri',
};
const buf = await HTMLtoDOCX(full, null, opts);
writeFileSync(m.out, Buffer.from(buf));
console.log('wrote', m.out, Buffer.from(buf).length, 'bytes |',
  'figures:', (m.figures || []).length, '| cover:', !!m.cover,
  '| tables:', (html.match(/<table/g) || []).length, '| links:', (html.match(/<a /g) || []).length);
