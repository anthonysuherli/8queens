"""Generate the six same-camera Shanghai era images via DashScope wanx t2i.

    python -m scripts.generate_era_images [--model wan2.2-t2i-plus] \
        [--md frontend/demo/shanghai-era-prompts.md] [--out frontend/demo/images]

Parses the per-era prompts from the prompts markdown, submits one async
image-synthesis task per era (X-DashScope-Async), polls until done, and
downloads the results. Heavy queens8.* imports live INSIDE main() so the pure
parsing helpers import cleanly (no keys/deps) for unit tests.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

import httpx

_PROMPT_BLOCK = re.compile(
    r"^## (Era (\d+[a-z]?) — [^\n]+)\n\n\*\*Prompt\.\*\* (.*?)"
    r"(?:\n\n\*\*Negative\.\*\* (.*?))?(?=\n\n\*\*Provenance)",
    re.S | re.M,
)
_NEGATIVE = re.compile(r"Global negative prompt \(all eras\): `([^`]+)`", re.S)


def extract_negative(md: str) -> str:
    m = _NEGATIVE.search(md)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def extract_prompts(md: str) -> list[dict]:
    out = []
    for m in _PROMPT_BLOCK.finditer(md):
        out.append({
            "era": m.group(2),
            "title": m.group(1).strip(),
            "prompt": re.sub(r"\s+", " ", m.group(3)).strip(),
            "negative": re.sub(r"\s+", " ", m.group(4)).strip() if m.group(4) else "",
        })
    return out


async def _submit(client: httpx.AsyncClient, base: str, key: str, model: str,
                  prompt: str, negative: str, size: str, retries: int = 6) -> str:
    for attempt in range(retries):
        r = await client.post(
            f"{base}/services/aigc/text2image/image-synthesis",
            headers={"Authorization": f"Bearer {key}", "X-DashScope-Async": "enable"},
            json={
                "model": model,
                "input": {"prompt": prompt, "negative_prompt": negative},
                "parameters": {"size": size, "n": 1},
            },
        )
        if r.status_code == 429:  # account-tier task-rate quota — back off and retry
            await asyncio.sleep(10 * (attempt + 1))
            continue
        if r.status_code != 200:
            raise RuntimeError(f"submit failed HTTP {r.status_code}: {r.text[:300]}")
        return r.json()["output"]["task_id"]
    raise RuntimeError(f"submit failed: rate-limited after {retries} retries")


async def _poll(client: httpx.AsyncClient, base: str, key: str, task_id: str,
                timeout_s: float = 300.0) -> str:
    deadline = asyncio.get_event_loop().time() + timeout_s
    while True:
        r = await client.get(f"{base}/tasks/{task_id}",
                             headers={"Authorization": f"Bearer {key}"})
        r.raise_for_status()
        out = r.json()["output"]
        status = out["task_status"]
        if status == "SUCCEEDED":
            return out["results"][0]["url"]
        if status in ("FAILED", "CANCELED"):
            raise RuntimeError(f"{status}: {out.get('code')} {out.get('message', '')[:200]}")
        if asyncio.get_event_loop().time() > deadline:
            raise RuntimeError(f"timeout after {timeout_s}s (last status {status})")
        await asyncio.sleep(5)


async def _one_era(client: httpx.AsyncClient, base: str, key: str, model: str,
                   era: dict, negative: str, size: str, out_dir: Path) -> Path:
    neg = ", ".join(p for p in (negative, era["negative"]) if p)
    task_id = await _submit(client, base, key, model, era["prompt"], neg, size)
    url = await _poll(client, base, key, task_id)
    img = await client.get(url)
    img.raise_for_status()
    path = out_dir / f"era{era['era']}.png"
    path.write_bytes(img.content)
    return path


async def run(md_path: Path, out_dir: Path, model: str, size: str) -> int:
    from queens8.core.config import get_settings

    s = get_settings()
    if not s.ai_gateway_api_key:
        print("AI_GATEWAY_API_KEY missing in .env", file=sys.stderr)
        return 2
    base = s.ai_gateway_base_url.replace("/compatible-mode/v1", "/api/v1")

    md = md_path.read_text()
    eras, negative = extract_prompts(md), extract_negative(md)
    if not eras:
        print(f"no era prompts found in {md_path}", file=sys.stderr)
        return 2
    out_dir.mkdir(parents=True, exist_ok=True)

    failed = 0
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Sequential: the wanx task quota rejects concurrent submissions (429).
        for era in eras:
            path = out_dir / f"era{era['era']}.png"
            if path.exists():
                print(f"SKIP  {era['title']} -> {path} (exists)")
                continue
            try:
                res = await _one_era(client, base, s.ai_gateway_api_key, model,
                                     era, negative, size, out_dir)
                print(f"OK    {era['title']} -> {res}", flush=True)
            except Exception as e:  # noqa: BLE001 — report per era, keep going
                failed += 1
                print(f"FAIL  {era['title']}: {e}", flush=True)
    return 1 if failed else 0


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model", default="wan2.2-t2i-plus")
    p.add_argument("--size", default="1280*720")
    p.add_argument("--md", type=Path, default=Path("frontend/demo/shanghai-era-prompts.md"))
    p.add_argument("--out", type=Path, default=Path("frontend/demo/images"))
    a = p.parse_args()
    raise SystemExit(asyncio.run(run(a.md, a.out, a.model, a.size)))


if __name__ == "__main__":
    main()
