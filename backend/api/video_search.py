"""
Video Search API

Provides:
- GET /api/video-search — Search Bilibili videos
"""
import hashlib
import logging
import time
import urllib.parse
from typing import List, Optional

from fastapi import APIRouter, Query
import httpx

logger = logging.getLogger(__name__)
router = APIRouter()

# WBI mixin key table
MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

NAV_API = "https://api.bilibili.com/x/web-interface/nav"
SEARCH_API = "https://api.bilibili.com/x/web-interface/wbi/search/type"


def _get_mixin_key(orig: str) -> str:
    """Get mixin key from original key."""
    return "".join(orig[i] for i in MIXIN_KEY_ENC_TAB)[:32]


async def _get_wbi_keys(client: httpx.AsyncClient) -> tuple[str, str]:
    """Get img_key and sub_key from nav API."""
    resp = await client.get(NAV_API, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bilibili.com",
    })
    data = resp.json()
    wbi_img = data["data"]["wbi_img"]
    img_key = wbi_img["img_url"].rsplit("/", 1)[-1].split(".")[0]
    sub_key = wbi_img["sub_url"].rsplit("/", 1)[-1].split(".")[0]
    return img_key, sub_key


def _sign_params(params: dict, img_key: str, sub_key: str) -> dict:
    """Sign parameters with WBI."""
    mixin_key = _get_mixin_key(img_key + sub_key)
    curr_time = round(time.time())
    params["wts"] = curr_time
    params = dict(sorted(params.items()))
    query = urllib.parse.urlencode(params)
    wrid = hashlib.md5((query + mixin_key).encode()).hexdigest()
    params["w_rid"] = wrid
    return params


@router.get("/video-search")
async def video_search(
    query: str = Query(..., description="Search query"),
    max_results: int = Query(5, ge=1, le=20, description="Max results"),
):
    """Search Bilibili videos."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bilibili.com",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Get WBI keys
            img_key, sub_key = await _get_wbi_keys(client)

            # Sign and search
            params = _sign_params({
                "keyword": query,
                "search_type": "video",
                "page": 1,
                "pagesize": max_results,
            }, img_key, sub_key)

            resp = await client.get(SEARCH_API, params=params, headers=headers)
            data = resp.json()
    except Exception as e:
        logger.error(f"Bilibili search failed: {e}")
        return {"results": [], "error": str(e)}

    if data.get("code") != 0:
        error_msg = data.get("message", "Unknown error")
        logger.warning(f"Bilibili API error: {error_msg}")
        return {"results": [], "error": error_msg}

    results = []
    for item in data.get("data", {}).get("result", []):
        title = item.get("title", "").replace('<em class="keyword">', "").replace("</em>", "")

        results.append({
            "bvid": item.get("bvid", ""),
            "title": title,
            "author": item.get("author", ""),
            "play": item.get("play", 0),
            "duration": item.get("duration", ""),
            "description": item.get("description", "")[:100],
            "pic": item.get("pic", ""),
        })

    return {"results": results, "query": query}
