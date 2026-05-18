"""Debug hash mismatch."""
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from api.tts import _extract_subtitles, _text_hash

html_path = Path("../data/users/2/workspace/generated/media-scripts/transformer动画.html")
html = html_path.read_text(encoding="utf-8")

subtitles = _extract_subtitles(html)
print(f"Extracted {len(subtitles)} subtitles")

# Check first subtitle
sub = subtitles[0]
text = sub["cn"]
print(f"\nFirst subtitle text: {repr(text[:80])}")
print(f"Hash: {_text_hash(text)}")

# Check what hash the file has
audio_dir = Path("../data/users/2/workspace/generated/media-scripts/transformer动画")
files = sorted(audio_dir.glob("0_*.mp3"))
print(f"\nFiles starting with '0_':")
for f in files:
    print(f"  {f.name}")

# Try to find the file
expected_file = audio_dir / f"0_{_text_hash(text)}.mp3"
print(f"\nExpected file: {expected_file.name}")
print(f"Exists: {expected_file.exists()}")

# Check the actual first file
actual_file = files[0] if files else None
if actual_file:
    # Extract hash from filename
    actual_hash = actual_file.stem.split('_', 1)[1]
    print(f"\nActual file hash: {actual_hash}")

    # Try to find what text produces this hash
    # We need to check if the text has different encoding
    text_bytes = text.encode('utf-8')
    text_hash = hashlib.md5(text_bytes).hexdigest()[:12]
    print(f"Hash of extracted text: {text_hash}")

    # Check if there's a BOM or other encoding issue
    print(f"Text bytes (first 20): {text_bytes[:20]}")
