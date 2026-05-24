"""
Bilibili Video Search Script (with WBI signing)

Usage:
    python video_search.py --query "深度学习" --max-results 5

Output: Markdown formatted video list
"""
import argparse
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request


# WBI mixin key table
MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

NAV_API = "https://api.bilibili.com/x/web-interface/nav"
SEARCH_API = "https://api.bilibili.com/x/web-interface/wbi/search/type"


def get_mixin_key(orig: str) -> str:
    """Get mixin key from original key."""
    return "".join(orig[i] for i in MIXIN_KEY_ENC_TAB)[:32]


def get_wbi_keys() -> tuple[str, str]:
    """Get img_key and sub_key from nav API."""
    req = urllib.request.Request(NAV_API, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bilibili.com",
    })

    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    wbi_img = data["data"]["wbi_img"]
    img_key = wbi_img["img_url"].rsplit("/", 1)[-1].split(".")[0]
    sub_key = wbi_img["sub_url"].rsplit("/", 1)[-1].split(".")[0]
    return img_key, sub_key


def sign_params(params: dict, img_key: str, sub_key: str) -> dict:
    """Sign parameters with WBI."""
    mixin_key = get_mixin_key(img_key + sub_key)
    curr_time = round(time.time())
    params["wts"] = curr_time
    params = dict(sorted(params.items()))
    query = urllib.parse.urlencode(params)
    wrid = hashlib.md5((query + mixin_key).encode()).hexdigest()
    params["w_rid"] = wrid
    return params


def search_bilibili(query: str, max_results: int = 5) -> list[dict]:
    """Search Bilibili for videos."""
    try:
        img_key, sub_key = get_wbi_keys()
    except Exception as e:
        print(f"Error getting WBI keys: {e}", file=sys.stderr)
        return []

    params = sign_params({
        "keyword": query,
        "search_type": "video",
        "page": 1,
        "pagesize": max_results,
    }, img_key, sub_key)

    url = f"{SEARCH_API}?{urllib.parse.urlencode(params)}"

    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bilibili.com",
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return []

    if data.get("code") != 0:
        print(f"API Error: {data.get('message', 'Unknown')}", file=sys.stderr)
        return []

    results = []
    for item in data.get("data", {}).get("result", []):
        # Clean HTML tags from title
        title = item.get("title", "").replace("<em class=\"keyword\">", "").replace("</em>", "")

        results.append({
            "bvid": item.get("bvid", ""),
            "title": title,
            "author": item.get("author", ""),
            "play": item.get("play", 0),
            "duration": item.get("duration", ""),
            "description": item.get("description", "")[:100],
            "pic": item.get("pic", ""),
        })

    return results


def format_play_count(play: int) -> str:
    """Format play count (e.g., 123456 -> '12.3万')."""
    if play >= 10000:
        return f"{play / 10000:.1f}万"
    return str(play)


def output_markdown(results: list[dict]) -> None:
    """Output results as Markdown."""
    if not results:
        print("未找到相关视频。")
        return

    print("## 推荐视频\n")

    for i, video in enumerate(results, 1):
        bvid = video["bvid"]
        title = video["title"]
        author = video["author"]
        play = format_play_count(video["play"])
        duration = video["duration"]
        url = f"https://www.bilibili.com/video/{bvid}"

        print(f"{i}. [{title}]({url})")
        print(f"   - UP主：{author} | 播放：{play} | 时长：{duration}")
        print()


def main():
    parser = argparse.ArgumentParser(description="Search Bilibili videos")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--max-results", type=int, default=5, help="Max results")
    args = parser.parse_args()

    results = search_bilibili(args.query, args.max_results)
    output_markdown(results)


if __name__ == "__main__":
    main()
