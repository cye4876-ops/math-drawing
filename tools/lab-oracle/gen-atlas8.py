"""Generate the n=8 unlabeled graph atlas (graph6) with nauty-geng.

Run in an environment where `nauty-geng` is on PATH. Output is intentionally kept
separate from atlas-data.json so the browser can lazy-load it only when needed.
"""
import json
import subprocess
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[2] / "src" / "extremal" / "atlas-data-8.json"


def main() -> None:
    output = subprocess.check_output(["nauty-geng", "-q", "8"], text=True)
    graphs = [line.strip() for line in output.splitlines() if line.strip()]
    if len(graphs) != 12346:
        raise SystemExit(f"expected 12346 graphs, got {len(graphs)}")
    OUTPUT.write_text(json.dumps(graphs, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"wrote {len(graphs)} graph6 strings to {OUTPUT}")


if __name__ == "__main__":
    main()
