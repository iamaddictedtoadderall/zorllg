#!/usr/bin/env python3
"""Seal or unseal the game's story content.

The story (the ship's hidden instructions, item texts, names) lives in
game/sealed.js as base64 so a glance at the repo doesn't spoil it.

  python3 tools/seal.py unseal   # game/sealed.js -> story/.unsealed.json (gitignored)
  python3 tools/seal.py seal     # story/.unsealed.json -> game/sealed.js
"""
import base64
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEALED = ROOT / "game" / "sealed.js"
PLAIN = ROOT / "story" / ".unsealed.json"


def seal():
    data = json.loads(PLAIN.read_text(encoding="utf-8"))
    blob = base64.b64encode(json.dumps(data, ensure_ascii=False).encode("utf-8")).decode("ascii")
    lines = [blob[i:i + 120] for i in range(0, len(blob), 120)]
    body = "\n".join(f'  "{l}"' + ("," if i < len(lines) - 1 else "") for i, l in enumerate(lines))
    SEALED.write_text(
        "// Sealed story content. Do not decode unless you want spoilers.\n"
        "// Edit via: python3 tools/seal.py unseal / seal\n"
        f"export const SEALED = [\n{body}\n].join('');\n",
        encoding="utf-8",
    )
    print(f"sealed {PLAIN.relative_to(ROOT)} -> {SEALED.relative_to(ROOT)}")


def unseal():
    blob = "".join(re.findall(r'"([A-Za-z0-9+/=]+)"', SEALED.read_text(encoding="utf-8")))
    data = json.loads(base64.b64decode(blob).decode("utf-8"))
    PLAIN.parent.mkdir(exist_ok=True)
    PLAIN.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"unsealed -> {PLAIN.relative_to(ROOT)} (gitignored)")


if __name__ == "__main__":
    {"seal": seal, "unseal": unseal}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
