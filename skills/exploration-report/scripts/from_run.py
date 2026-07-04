"""CLI: turn a real exploration run into a themed .docx (adapter → render).

    python from_run.py society <summary.json> <report.md> <out_dir> [title]
    python from_run.py delapan <findings.json> <out_dir> [title] [topic]

`society`  consumes an 8queens society run (summary JSON + synthesized report md).
`delapan`  consumes delapan findings (delapan_search / delapan_resume JSON, or a
           bare list of finding rows with title/content/category).
"""
from __future__ import annotations

import os
import subprocess
import sys

import adapters

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    mode = sys.argv[1]
    if mode == "society":
        summary, report_md, out_dir = sys.argv[2], sys.argv[3], sys.argv[4]
        title = sys.argv[5] if len(sys.argv) > 5 else None
        mpath = adapters.society_to_manifest(summary, report_md, out_dir, title=title)
    elif mode == "delapan":
        findings, out_dir = sys.argv[2], sys.argv[3]
        title = sys.argv[4] if len(sys.argv) > 4 else "Knowledge Base Report"
        topic = sys.argv[5] if len(sys.argv) > 5 else None
        mpath = adapters.delapan_to_manifest(findings, out_dir, title=title, topic=topic)
    else:
        sys.exit(__doc__)
    subprocess.run([sys.executable, os.path.join(HERE, "render.py"), mpath], check=True)


if __name__ == "__main__":
    main()
