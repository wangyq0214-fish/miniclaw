"""Test full audio injection."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from api.tts import _extract_subtitles, _text_hash

html_path = Path("data/users/2/workspace/generated/media-scripts/transformer动画.html")
html = html_path.read_text(encoding="utf-8")

subtitles = _extract_subtitles(html)
print(f"Extracted {len(subtitles)} subtitles")

# Simulate audio URLs
audio_urls = [f"/api/tts/audio/2/test/{i}_{_text_hash(sub['cn'])}.mp3" for i, sub in enumerate(subtitles)]

# Test the injection
match = re.search(r'const\s+subtitles\s*=\s*\[([\s\S]*?)\];', html)
if not match:
    print("No subtitles found in HTML")
    exit()

raw = match.group(1)

# Remove existing audio fields
raw_cleaned = re.sub(r'\s*,?\s*audio:\s*"[^"]*"', '', raw)
print(f"\nAfter cleaning, first 300 chars:")
print(raw_cleaned[:300])

# Inject new audio
for i, url in enumerate(audio_urls[:2]):  # Test with first 2
    cn_escaped = re.escape(subtitles[i]["cn"])
    pattern = r'(\{\s*time:\s*\d+\s*,\s*cn:\s*["\']' + cn_escaped + r'["\']\s*)\}'
    replacement = r'\1, audio: "' + url + r'" }'

    print(f"\n--- Testing injection for subtitle {i} ---")
    print(f"Pattern: {pattern[:80]}...")
    print(f"Replacement: {replacement}")

    new_raw = re.sub(pattern, replacement, raw_cleaned, count=1)
    if new_raw != raw_cleaned:
        print("SUCCESS: Pattern matched and replaced")
        # Show the injected line
        for line in new_raw.split('\n'):
            if f'audio: "{url}"' in line:
                print(f"Injected line: {line.strip()[:100]}...")
                break
        raw_cleaned = new_raw
    else:
        print("FAILED: Pattern did not match")
