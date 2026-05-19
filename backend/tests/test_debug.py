"""Debug the full injection process."""
import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from api.tts import _extract_subtitles, _text_hash, generate_audio_for_subtitles

async def main():
    html_path = Path("../data/users/2/workspace/generated/media-scripts/transformer动画.html")
    audio_dir = Path("../data/users/2/workspace/generated/media-scripts/transformer动画")

    html = html_path.read_text(encoding="utf-8")
    print(f"Original HTML length: {len(html)}")

    # Extract subtitles
    subtitles = _extract_subtitles(html)
    print(f"Extracted {len(subtitles)} subtitles")

    # Generate audio URLs
    audio_urls = []
    for i, sub in enumerate(subtitles):
        text = sub["cn"]
        text_h = _text_hash(text)
        audio_file = audio_dir / f"{i}_{text_h}.mp3"
        if audio_file.exists():
            audio_urls.append(f"/api/tts/audio/2/transformer动画/{audio_file.name}")
            print(f"  [{i}] Audio exists: {audio_file.name}")
        else:
            audio_urls.append("")
            print(f"  [{i}] Audio missing: {audio_file.name}")

    # Test injection manually
    match = re.search(r'const\s+subtitles\s*=\s*\[([\s\S]*?)\];', html)
    if not match:
        print("No subtitles found!")
        return

    raw = match.group(1)
    print(f"\nRaw subtitles length: {len(raw)}")

    # Remove existing audio
    raw_cleaned = re.sub(r'\s*,?\s*audio:\s*"[^"]*"', '', raw)
    print(f"After cleaning: {len(raw_cleaned)}")

    # Inject new audio
    for i, url in enumerate(audio_urls[:2]):
        if not url:
            continue
        cn_escaped = re.escape(subtitles[i]["cn"])
        pattern = r'(\{\s*time:\s*\d+\s*,\s*cn:\s*["\']' + cn_escaped + r'["\']\s*)\}'
        replacement = r'\1, audio: "' + url + r'" }'

        new_raw = re.sub(pattern, replacement, raw_cleaned, count=1)
        if new_raw != raw_cleaned:
            print(f"  [{i}] Injection successful")
            raw_cleaned = new_raw
        else:
            print(f"  [{i}] Injection FAILED")

    # Construct final HTML
    new_subtitles_block = 'const subtitles = [' + raw_cleaned + '];'
    enhanced = html[:match.start()] + new_subtitles_block + html[match.end():]
    print(f"\nEnhanced HTML length: {len(enhanced)}")

    # Check if audio fields exist
    audio_count = enhanced.count('audio:')
    print(f"Audio fields in enhanced HTML: {audio_count}")

    # Show a sample
    for line in enhanced.split('\n'):
        if 'audio:' in line:
            print(f"Sample line: {line.strip()[:100]}...")
            break

asyncio.run(main())
