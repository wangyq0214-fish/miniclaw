"""Web search via Tavily API for Source Discovery."""
from urllib.parse import urlparse

import httpx

from config import settings

TAVILY_URL = "https://api.tavily.com/search"

# Popular Chinese websites for prioritized search results
CHINESE_DOMAINS = [
    "csdn.net",           # CSDN
    "cnblogs.com",        # 博客园
    "juejin.cn",          # 掘金
    "segmentfault.com",   # 思否
    "runoob.com",         # 菜鸟教程
    "w3school.com.cn",    # W3School
    "baike.baidu.com",    # 百度百科
    "zh.wikipedia.org",   # 中文维基
    "douban.com",         # 豆瓣
    "bilibili.com",       # B站
    "163.com",            # 网易
    "sina.com.cn",        # 新浪
    "sohu.com",           # 搜狐
    "qq.com",             # 腾讯
    "baidu.com",          # 百度
    "weibo.com",          # 微博
    "toutiao.com",        # 今日头条
    "jianshu.com",        # 简书
    "sspai.com",          # 少数派
    "huxiu.com",          # 虎嗅
    "36kr.com",           # 36氪
]


async def search_web(query: str, max_results: int = 5, chinese_first: bool = True) -> dict:
    """Search the web via Tavily API.

    Returns:
        {
            "query": str,
            "global_summary": str,
            "sources": [{"id", "icon", "title", "url", "summary"}, ...]
        }
    """
    api_key = settings.tavily_api_key
    if not api_key:
        return {
            "query": query,
            "global_summary": "未配置 TAVILY_API_KEY，无法执行网络搜索。",
            "sources": [],
        }

    payload = {
        "api_key": api_key,
        "query": query,
        "max_results": max(1, min(max_results, 10)),
        "search_depth": "basic",
        "include_answer": True,
        "include_images": False,
        "include_raw_content": False,
    }

    # Prioritize Chinese websites if enabled
    if chinese_first:
        payload["include_domains"] = CHINESE_DOMAINS

    try:
        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            resp = await client.post(
                TAVILY_URL,
                json=payload,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        return {
            "query": query,
            "global_summary": "搜索请求超时，请稍后重试。",
            "sources": [],
        }
    except httpx.HTTPStatusError as e:
        return {
            "query": query,
            "global_summary": f"搜索服务返回错误: {e.response.status_code}",
            "sources": [],
        }
    except Exception:
        return {
            "query": query,
            "global_summary": "搜索失败，请稍后重试。",
            "sources": [],
        }

    sources = []
    for i, r in enumerate(data.get("results") or []):
        url = r.get("url", "")
        hostname = (urlparse(url).hostname or "").replace("www.", "")
        icon = hostname[0].upper() if hostname else "?"
        content = (r.get("content") or "").strip()
        summary = content[:120] + ("..." if len(content) > 120 else "")
        sources.append({
            "id": str(i + 1),
            "icon": icon,
            "title": r.get("title") or "",
            "url": url,
            "summary": summary,
        })

    answer = (data.get("answer") or "").strip()
    global_summary = answer if answer else f"找到 {len(sources)} 条关于 \"{query}\" 的搜索结果。"

    return {
        "query": query,
        "global_summary": global_summary,
        "sources": sources,
    }
