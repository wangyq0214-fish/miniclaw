"""
Quick script to generate TTS audio for an existing animation HTML.
Usage: python generate_tts.py <html_file> [user_id]
"""
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from api.tts import enhance_animation


async def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_tts.py <html_file> [user_id]")
        print("Example: python generate_tts.py 'data/users/2/workspace/generated/media-scripts/2026-05-19-Transformer架构.html' 2")
        return

    html_path = Path(sys.argv[1])
    user_id = int(sys.argv[2]) if len(sys.argv) > 2 else 2

    if not html_path.exists():
        print(f"Error: {html_path} not found")
        return

    print(f"Reading: {html_path}")
    html_content = html_path.read_text(encoding="utf-8")

    # Audio dir is same as HTML file
    audio_dir = html_path.parent / html_path.stem
    html_filename = html_path.name

    print(f"Generating TTS audio...")
    print(f"Audio dir: {audio_dir}")

    enhanced = await enhance_animation(html_content, html_filename, audio_dir, user_id)

    # Write back
    html_path.write_text(enhanced, encoding="utf-8")
    print(f"Done! Enhanced HTML saved to: {html_path}")


if __name__ == "__main__":
    asyncio.run(main())
