#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import re
import sys

# Windows: force stdout/stderr to UTF-8 so non-ASCII characters don't crash
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

TAVILY_URL = "https://api.tavily.com/search"


def load_key():
    key = os.environ.get("TAVILY_API_KEY")
    if key:
        return key.strip()

    # Search for .env walking up from this script (supports backend/.env in this project)
    search_dirs = [
        pathlib.Path(__file__).parent,                          # scripts/
        pathlib.Path(__file__).parent.parent,                   # tavily-search/
        pathlib.Path(__file__).parent.parent.parent,            # skills/
        pathlib.Path(__file__).parent.parent.parent.parent,     # backend/ (PROJECT_ROOT)
        pathlib.Path.home() / ".openclaw",                      # ~/.openclaw (legacy)
    ]

    for search_dir in search_dirs:
        env_path = search_dir / ".env"
        if env_path.exists():
            try:
                txt = env_path.read_text(encoding="utf-8", errors="ignore")
                m = re.search(r"^\s*TAVILY_API_KEY\s*=\s*(.+?)\s*$", txt, re.M)
                if m:
                    v = m.group(1).strip().strip('"').strip("'")
                    # Skip placeholder / commented-out values
                    if v and not v.startswith("#") and "your-api-key" not in v:
                        return v
            except Exception:
                pass

    return None


def tavily_search(query: str, max_results: int, include_answer: bool, search_depth: str):
    key = load_key()
    if not key:
        raise SystemExit(
            "Missing TAVILY_API_KEY. Set env var TAVILY_API_KEY or add it to backend/.env"
        )

    try:
        import httpx
        _use_httpx = True
    except ImportError:
        _use_httpx = False

    payload = {
        "api_key": key,
        "query": query,
        "max_results": max_results,
        "search_depth": search_depth,
        "include_answer": bool(include_answer),
        "include_images": False,
        "include_raw_content": False,
    }

    if _use_httpx:
        # trust_env=False: bypass system proxy (avoids SSL MitM failures on proxied networks)
        with httpx.Client(timeout=30, verify=True, trust_env=False) as client:
            resp = client.post(
                TAVILY_URL,
                json=payload,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            body = resp.text
    else:
        import urllib.request
        import ssl
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            TAVILY_URL,
            data=data,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            body = r.read().decode("utf-8", errors="replace")

    try:
        obj = json.loads(body)
    except json.JSONDecodeError:
        raise SystemExit(f"Tavily returned non-JSON: {body[:300]}")

    out = {
        "query": query,
        "answer": obj.get("answer"),
        "results": [],
    }

    for r in (obj.get("results") or [])[:max_results]:
        out["results"].append(
            {
                "title": r.get("title"),
                "url": r.get("url"),
                "content": r.get("content"),
            }
        )

    if not include_answer:
        out.pop("answer", None)

    return out


def to_brave_like(obj: dict) -> dict:
    # A lightweight, stable shape similar to web_search: results with title/url/snippet.
    results = []
    for r in obj.get("results", []) or []:
        results.append(
            {
                "title": r.get("title"),
                "url": r.get("url"),
                "snippet": r.get("content"),
            }
        )
    out = {"query": obj.get("query"), "results": results}
    if "answer" in obj:
        out["answer"] = obj.get("answer")
    return out


def to_markdown(obj: dict) -> str:
    lines = []
    if obj.get("answer"):
        lines.append(obj["answer"].strip())
        lines.append("")
    for i, r in enumerate(obj.get("results", []) or [], 1):
        title = (r.get("title") or "").strip() or r.get("url") or "(no title)"
        url = r.get("url") or ""
        snippet = (r.get("content") or "").strip()
        lines.append(f"{i}. {title}")
        if url:
            lines.append(f"   {url}")
        if snippet:
            lines.append(f"   - {snippet}")
    return "\n".join(lines).strip() + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True)
    ap.add_argument("--max-results", type=int, default=5)
    ap.add_argument("--include-answer", action="store_true")
    ap.add_argument(
        "--search-depth",
        default="basic",
        choices=["basic", "advanced"],
        help="Tavily search depth",
    )
    ap.add_argument(
        "--format",
        default="raw",
        choices=["raw", "brave", "md"],
        help="Output format: raw (default) | brave (title/url/snippet) | md (human-readable)",
    )
    args = ap.parse_args()

    res = tavily_search(
        query=args.query,
        max_results=max(1, min(args.max_results, 10)),
        include_answer=args.include_answer,
        search_depth=args.search_depth,
    )

    if args.format == "md":
        sys.stdout.write(to_markdown(res))
        return

    if args.format == "brave":
        res = to_brave_like(res)

    json.dump(res, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
