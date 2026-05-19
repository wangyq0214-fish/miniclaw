"""Debug audio injection."""
import re
from pathlib import Path

html_path = Path("../data/users/2/workspace/generated/media-scripts/transformer动画.html")
html = html_path.read_text(encoding="utf-8")

# Extract subtitles
match = re.search(r'const\s+subtitles\s*=\s*\[([\s\S]*?)\];', html)
if not match:
    print("No subtitles found")
    exit()

raw = match.group(1)
print("First 500 chars of subtitles array:")
print(raw[:500])
print("\n---\n")

# Test the regex pattern
test_cn = "2017 年，Google 团队发表了划时代的论文 —— Attention Is All You Need"
cn_escaped = re.escape(test_cn)
print(f"Escaped CN: {cn_escaped}")

pattern = r'(\{\s*time:\s*\d+\s*,\s*cn:\s*["\']' + cn_escaped + r'["\']\s*)\}'
print(f"Pattern: {pattern}")

matches = re.findall(pattern, raw)
print(f"Matches found: {len(matches)}")
if matches:
    print(f"First match: {matches[0][:100]}...")
