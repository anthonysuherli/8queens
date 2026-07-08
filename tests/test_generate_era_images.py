"""Pure-parser tests for scripts.generate_era_images (no keys, no network)."""

from __future__ import annotations

from scripts.generate_era_images import extract_negative, extract_prompts

_MD = """# Title

Global negative prompt (all eras): `bridge across the river,
modern watermark`

---

## Era 0a — Qin estuary, ~210 BC

**Prompt.** Open estuarine water, no land underfoot.

**Provenance.**
| Detail | Source |

## Era 1 — Qing walled town, late 1843

**Prompt.** Ultra-realistic photograph, fixed camera low over the water,
looking north, late 1843: junks and sampans.

**Provenance.**
| Detail | Source |

## Era 2 — Treaty-port hongs, c. 1882

**Prompt.** Same fixed camera, circa 1882: compradoric hongs.

**Negative.** tall buildings,
Beaux-Arts palaces

**Provenance.**
| Detail | Source |
"""


def test_extract_prompts_finds_all_eras_in_order():
    eras = extract_prompts(_MD)
    assert [e["era"] for e in eras] == ["0a", "1", "2"]
    assert eras[1]["title"].startswith("Era 1 — Qing walled town")


def test_extract_prompts_unwraps_lines():
    eras = extract_prompts(_MD)
    assert "water, looking north" in eras[1]["prompt"]
    assert "\n" not in eras[1]["prompt"]
    assert "**Provenance" not in eras[1]["prompt"]


def test_extract_negative_unwraps():
    assert extract_negative(_MD) == "bridge across the river, modern watermark"


def test_per_era_negative_optional():
    eras = extract_prompts(_MD)
    assert eras[0]["negative"] == ""
    assert eras[2]["negative"] == "tall buildings, Beaux-Arts palaces"
    assert "Negative" not in eras[2]["prompt"]


def test_missing_sections_yield_empty():
    assert extract_prompts("# nothing here") == []
    assert extract_negative("# nothing here") == ""
