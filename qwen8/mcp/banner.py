"""qwen8 wordmark — the banner that leads the resume/tap surface.

Keeping it here (not inside `select_preamble`) keeps the public preamble XML clean
— the banner is a conversation-surface concern only.
"""

from __future__ import annotations

QWEN8_BANNER = """\
        ╱──
──────◌
        ╲──
   q w e n 8
   knowledge, tapped"""
