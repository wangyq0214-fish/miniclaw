"""
TTS Module — Generate audio for HTML animation subtitles.

Flow:
1. Extract subtitles (cn text) from HTML
2. Call MiMo TTS API for each subtitle
3. Save .mp3 to media-scripts/<animation_name>/ (same dir as HTML)
4. Inject audio URLs into HTML subtitles array
5. Serve audio files via GET endpoint
"""
import base64
import hashlib
import logging
import re
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from config import get_project_root, get_user_workspace_dir

logger = logging.getLogger(__name__)
router = APIRouter()

import os

TTS_API_BASE = os.getenv("TTS_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")
TTS_API_KEY = os.getenv("TTS_API_KEY", "")
TTS_MODEL = os.getenv("TTS_MODEL", "mimo-v2.5-tts")
TTS_VOICE = os.getenv("TTS_VOICE", "冰糖")


def _text_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]


def _extract_subtitles(html: str) -> list[dict]:
    """Extract subtitles array from HTML script."""
    match = re.search(r'const\s+subtitles\s*=\s*\[([\s\S]*?)\];', html)
    if not match:
        return []

    raw = match.group(1)
    entries = []
    for m in re.finditer(
        r'\{\s*time:\s*(\d+)\s*,\s*cn:\s*["\'](.+?)["\']\s*\}', raw
    ):
        entries.append({"time": int(m.group(1)), "cn": m.group(2)})
    return entries


async def _generate_single_audio(text: str, output_path: Path) -> bool:
    """Call MiMo TTS API to generate a single audio file."""
    if not TTS_API_KEY:
        logger.warning("TTS_API_KEY not configured, skipping audio generation")
        return False

    url = f"{TTS_API_BASE.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {TTS_API_KEY}",
        "Content-Type": "application/json; charset=utf-8",
    }
    text = text.strip()
    logger.info("TTS generating for: %s", text[:60])

    payload = {
        "model": TTS_MODEL,
        "messages": [
            {"role": "user", "content": "请朗读以下内容"},
            {"role": "assistant", "content": text},
        ],
        "modalities": ["text", "audio"],
        "audio": {"voice": TTS_VOICE, "format": "mp3"},
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                logger.error("TTS API error %d: %s", resp.status_code, resp.text[:200])
                return False

            data = resp.json()
            audio_data = data.get("choices", [{}])[0].get("message", {}).get("audio", {})
            if not audio_data or "data" not in audio_data:
                logger.error("TTS response missing audio data: %s", str(data)[:200])
                return False

            raw_bytes = base64.b64decode(audio_data["data"])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(raw_bytes)
            logger.info("Generated audio: %s (%d bytes)", output_path.name, len(raw_bytes))
            return True
    except Exception as e:
        logger.error("TTS request failed: %s", e)
        return False


async def generate_audio_for_subtitles(
    html: str,
    html_filename: str,
    audio_dir: Path,
    user_id: int = 0,
) -> str:
    """
    Post-process HTML to generate audio for subtitles.

    Args:
        html: The HTML content
        html_filename: Just the filename (e.g. "transformer动画.html")
        audio_dir: Directory to save audio files (e.g. media-scripts/transformer动画/)

    Returns enhanced HTML with audio URLs injected, or original HTML on failure.
    """
    subtitles = _extract_subtitles(html)
    if not subtitles:
        return html

    animation_name = Path(html_filename).stem
    audio_dir.mkdir(parents=True, exist_ok=True)

    audio_urls = []
    any_generated = False

    for i, sub in enumerate(subtitles):
        text = sub["cn"]
        text_h = _text_hash(text)
        audio_file = audio_dir / f"{i}_{text_h}.mp3"

        if audio_file.exists():
            logger.info("Audio cached: %s", audio_file.name)
        else:
            success = await _generate_single_audio(text, audio_file)
            if not success:
                audio_urls.append("")
                continue

        audio_urls.append(f"/api/tts/audio/{user_id}/{animation_name}/{audio_file.name}")
        any_generated = True

    if not any_generated:
        return html

    # Inject audio URLs into subtitles array
    def inject_audio(match):
        raw = match.group(1)
        # Remove any existing audio fields first (handles re-injection)
        raw = re.sub(r'\s*,?\s*audio:\s*"[^"]*"', '', raw)
        for i, url in enumerate(audio_urls):
            if not url:
                continue
            cn_escaped = re.escape(subtitles[i]["cn"])
            pattern = r'(\{\s*time:\s*\d+\s*,\s*cn:\s*["\']' + cn_escaped + r'["\']\s*)\}'
            replacement = r'\1, audio: "' + url + r'" }'
            raw = re.sub(pattern, replacement, raw, count=1)
        return 'const subtitles = [' + raw + '];'

    html = re.sub(
        r'const\s+subtitles\s*=\s*\[([\s\S]*?)\];',
        inject_audio,
        html,
        count=1,
    )

    logger.info("Injected %d audio URLs into %s", len([u for u in audio_urls if u]), html_filename)
    return html


# ── Animation timing enhancement ──

# Speech rate: Chinese characters per second
CHARS_PER_SEC = 4.5
MIN_SUBTITLE_DURATION = 2.5  # seconds
PAUSE_BETWEEN_SUBTITLES = 0.5  # seconds


def _recalculate_subtitle_timing(html: str) -> str:
    """Recalculate subtitle timing based on character count."""
    match = re.search(r'const\s+subtitles\s*=\s*\[([\s\S]*?)\];', html)
    if not match:
        return html

    raw = match.group(1)

    # Parse entries
    entries = []
    for m in re.finditer(
        r'\{\s*time:\s*(\d+)\s*,\s*cn:\s*(["\'])(.+?)\2\s*(?:,\s*audio:\s*(["\'])(.+?)\4)?\s*\}',
        raw
    ):
        entries.append({
            "old_time": int(m.group(1)),
            "quote": m.group(2),
            "cn": m.group(3),
            "audio_quote": m.group(4) or '"',
            "audio": m.group(5) or "",
        })

    if not entries:
        return html

    # Calculate new timing
    cumulative = 0
    for e in entries:
        char_count = len(e["cn"])
        duration = max(MIN_SUBTITLE_DURATION, char_count / CHARS_PER_SEC)
        e["new_time"] = int(cumulative * 1000)
        cumulative += duration + PAUSE_BETWEEN_SUBTITLES

    total_ms = int((cumulative - PAUSE_BETWEEN_SUBTITLES) * 1000)

    # Build new subtitles array
    lines = []
    for i, e in enumerate(entries):
        audio_part = f', audio: {e["audio_quote"]}{e["audio"]}{e["audio_quote"]}' if e["audio"] else ""
        line = f'            {{ time: {e["new_time"]},    cn: {e["quote"]}{e["cn"]}{e["quote"]}{audio_part} }}'
        if i < len(entries) - 1:
            line += ","
        lines.append(line)

    new_subtitles = "const subtitles = [\n" + "\n".join(lines) + "\n        ];"
    html = html[:match.start()] + new_subtitles + html[match.end():]

    # Update TOTAL_DURATION
    html = re.sub(
        r'const\s+TOTAL_DURATION\s*=\s*\d+',
        f'const TOTAL_DURATION = {total_ms}',
        html,
    )

    logger.info("Recalculated timing: %d subtitles, total %dms", len(entries), total_ms)
    return html


def _inject_audio_sync(html: str) -> str:
    """Inject waitForSubtitle() function into animation code."""
    # Add waitForSubtitle function before the MAIN section
    wait_func = """
        // ── Wait for subtitle to reach a specific text ──
        function waitForSubtitle(textFragment) {
            return new Promise(resolve => {
                const el = document.getElementById('subtitle-cn');
                if (el && el.innerText.includes(textFragment)) { resolve(); return; }
                const obs = new MutationObserver(() => {
                    if (el.innerText.includes(textFragment)) { obs.disconnect(); resolve(); }
                });
                obs.observe(el, { childList: true, characterData: true, subtree: true });
            });
        }
"""

    # Insert before "// ══════ MAIN ══════" or similar
    main_marker = re.search(r'(// [═]+.*?MAIN.*?[═]+)', html)
    if main_marker:
        html = html[:main_marker.start()] + wait_func + "\n        " + html[main_marker.start():]
    else:
        logger.warning("Could not find MAIN section marker, skipping waitForSubtitle injection")

    return html


async def enhance_animation(
    html: str,
    html_filename: str,
    audio_dir: Path,
    user_id: int = 0,
) -> str:
    """
    Full animation enhancement pipeline:
    1. Recalculate subtitle timing based on character count
    2. Generate TTS audio for each subtitle
    3. Inject audio URLs into HTML
    4. Inject waitForSubtitle() for scene synchronization
    5. Replace placeholder "准备开始..." with first subtitle text
    """
    # Step 1: Recalculate timing
    html = _recalculate_subtitle_timing(html)

    # Step 2 & 3: Generate audio and inject URLs
    html = await generate_audio_for_subtitles(html, html_filename, audio_dir, user_id)

    # Step 4: Inject audio sync helper
    html = _inject_audio_sync(html)

    return html


# ── Audio file serving ──

@router.get("/audio/{user_id}/{animation_name}/{filename}")
async def serve_audio(user_id: int, animation_name: str, filename: str):
    """Serve a generated audio file. Public endpoint — path is already user-isolated."""
    if ".." in animation_name or "/" in animation_name or "\\" in animation_name:
        raise HTTPException(status_code=400, detail="Invalid animation name")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    audio_path = (
        get_user_workspace_dir(user_id)
        / "generated"
        / "media-scripts"
        / animation_name
        / filename
    )
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(str(audio_path), media_type="audio/mpeg")
