"""Orchestrator: a report manifest ──► themed illustrated .docx.

    report.json ─► [cover spec + figures] ─► make_figures.py ─► PNGs
                                          └─► build_report.mjs ─► report.docx ─► validate

Usage:
    python render.py report.json            # python must have matplotlib + numpy
                                            # node deps installed in scripts/ (npm install)

report.json (see SKILL.md / examples/):
{
  "title": "...", "subtitle": "...", "meta": ["line", ...], "seal": "探",
  "author": "...", "date": "...", "cover": true,
  "report_md": "report.md", "out": "report.docx",
  "figures": [ {"id":"flow","type":"flow", ...}, {"id":"f1","type":"hbar", ...} ]
}
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
CSS = os.path.join(SKILL, "assets", "theme.css")


def validate(path):
    z = zipfile.ZipFile(path)
    import xml.dom.minidom as M
    for n in z.namelist():
        if n.endswith((".xml", ".rels")):
            M.parseString(z.read(n))
    doc = z.read("word/document.xml").decode("utf-8", "ignore")
    media = [n for n in z.namelist() if n.startswith("word/media/")]
    return {
        "ok": z.testzip() is None,
        "images": len(media),
        "drawings": doc.count("<w:drawing"),
        "tables": doc.count("<w:tbl>"),
        "hyperlinks": doc.count("<w:hyperlink"),
    }


def main():
    man = json.load(open(sys.argv[1], encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(sys.argv[1]))

    def rel(p):
        return p if os.path.isabs(p) else os.path.join(base, p)

    out = rel(man["out"])
    work = man.get("work") or os.path.join(os.path.dirname(out) or ".", "_report_figs")
    os.makedirs(work, exist_ok=True)

    # 1. assemble figures.json (auto cover + user figures)
    figs = []
    if man.get("cover", True):
        meta = list(man.get("meta", []))
        if man.get("date") and man["date"] not in meta:
            meta.append(man["date"])
        figs.append({"id": "cover", "type": "cover", "title": man["title"],
                     "subtitle": man.get("subtitle", ""), "meta": meta,
                     "seal": man.get("seal", "探")})
    figs.extend(man.get("figures", []))
    figs_json = os.path.join(work, "figures.json")
    json.dump({"figures": figs}, open(figs_json, "w"), ensure_ascii=False, indent=1)

    # 2. render figures
    subprocess.run([sys.executable, os.path.join(HERE, "make_figures.py"), figs_json, work],
                   check=True)
    manifest = json.load(open(os.path.join(work, "_manifest.json"), encoding="utf-8"))
    by_id = {f["id"]: f for f in manifest}

    # 3. build-manifest for the docx assembler
    cover = by_id.pop("cover", {}).get("file") if man.get("cover", True) else None
    build = {
        "title": man["title"], "subtitle": man.get("subtitle", ""),
        "author": man.get("author", ""), "date": man.get("date", ""),
        "report_md": rel(man["report_md"]), "cover": cover,
        "css": CSS, "out": out,
        "figures": [f for f in manifest if f["id"] != "cover"],
    }
    build_json = os.path.join(work, "build-manifest.json")
    json.dump(build, open(build_json, "w"), ensure_ascii=False, indent=1)

    # 4. assemble docx (node deps live in scripts/)
    subprocess.run(["node", os.path.join(HERE, "build_report.mjs"), build_json],
                   check=True, cwd=HERE)

    # 5. validate
    v = validate(out)
    print("VALIDATION:", json.dumps(v))
    if not v["ok"]:
        sys.exit("docx failed zip integrity")
    print("DONE ->", out)


if __name__ == "__main__":
    main()
