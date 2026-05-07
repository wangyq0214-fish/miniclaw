"""Test subtitle extraction."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from api.tts import _extract_subtitles

html_path = Path("data/users/2/workspace/generated/media-scripts/transformer动画.html")
html = html_path.read_text(encoding="utf-8")

subtitles = _extract_subtitles(html)
print(f"Extracted {len(subtitles)} subtitles")
for i, sub in enumerate(subtitles[:3]):
    print(f"  [{i}] time={sub['time']}, cn={sub['cn'][:50]}...")
