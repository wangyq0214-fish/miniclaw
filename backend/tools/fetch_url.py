"""
Fetch URL Tool - Web Content Fetcher

Features:
- 60 second timeout (increased from 15s for slow international sites)
- Automatic retry (up to 2 attempts)
- 5000 character output truncation
- Automatic JSON/HTML detection
- HTML to Markdown conversion
- Script/style/nav/header/footer removal
"""
import json
import logging
import time
from typing import Optional
import httpx
from langchain_core.tools import BaseTool
from pydantic import Field
from bs4 import BeautifulSoup
import html2text

logger = logging.getLogger(__name__)

# Multiple browser-like headers to rotate and avoid bot blocking
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

DEFAULT_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}


class CleanedFetchTool(BaseTool):
    """Fetch URL tool that cleans HTML to Markdown/Text."""

    name: str = "fetch_url"
    description: str = """Fetch content from a URL and return cleaned text.
    Use this to get web page content for analysis or information retrieval.
    The tool automatically detects JSON responses and converts HTML to clean Markdown format.

    Args:
        url: The URL to fetch content from

    Returns:
        Cleaned content (Markdown for HTML, formatted JSON for JSON responses)
    """

    timeout: int = Field(default=60, description="Request timeout in seconds")
    max_output_chars: int = Field(default=5000, description="Maximum output characters")
    max_retries: int = Field(default=2, description="Maximum number of retry attempts")

    def __init__(self, **data):
        super().__init__(**data)
        self._html_converter = html2text.HTML2Text()
        self._html_converter.ignore_links = False
        self._html_converter.ignore_images = True
        self._html_converter.ignore_emphasis = False
        self._html_converter.body_width = 0  # No line wrapping

    def _is_json(self, content: str, content_type: str = "") -> bool:
        """Check if content is JSON."""
        if 'application/json' in content_type.lower():
            return True
        try:
            json.loads(content)
            return True
        except (json.JSONDecodeError, ValueError):
            return False

    def _truncate_output(self, output: str) -> str:
        """Truncate output to max characters."""
        if len(output) > self.max_output_chars:
            return output[:self.max_output_chars] + "\n\n...[output truncated]"
        return output

    def _fetch_with_retry(self, url: str) -> tuple[str, str]:
        """Fetch URL content with retry and rotating User-Agents."""
        import random
        last_error = None
        for attempt in range(self.max_retries):
            # Rotate User-Agent for each attempt
            headers = {**DEFAULT_HEADERS, "User-Agent": random.choice(USER_AGENTS)}
            try:
                with httpx.Client(
                    timeout=self.timeout,
                    headers=headers,
                    follow_redirects=True,
                ) as client:
                    response = client.get(url)
                    response.raise_for_status()
                    content_type = response.headers.get('content-type', '')
                    return response.text, content_type
            except httpx.TimeoutException as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    logger.warning(f"Timeout on attempt {attempt + 1}, retrying...")
                    time.sleep(1)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 403 and attempt < self.max_retries - 1:
                    logger.warning(f"403 Forbidden on attempt {attempt + 1}, retrying with different User-Agent...")
                    time.sleep(0.5)
                    continue
                # For other HTTP errors, try urllib as fallback
                logger.warning(f"httpx failed with {e.response.status_code}, trying urllib fallback...")
                return self._fetch_with_urllib(url)
            except Exception as e:
                logger.warning(f"httpx error: {e}, trying urllib fallback...")
                return self._fetch_with_urllib(url)
        # If all httpx attempts failed, try urllib
        if last_error:
            logger.warning(f"All httpx attempts failed, trying urllib fallback...")
            return self._fetch_with_urllib(url)
        raise last_error

    def _fetch_with_urllib(self, url: str) -> tuple[str, str]:
        """Fallback fetch using urllib (works when httpx is blocked)."""
        import urllib.request
        import ssl
        import random

        headers = {**DEFAULT_HEADERS, "User-Agent": random.choice(USER_AGENTS)}
        req = urllib.request.Request(url, headers=headers, method="GET")
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        with urllib.request.urlopen(req, timeout=self.timeout, context=ctx) as response:
            content_type = response.headers.get('Content-Type', '')
            content = response.read().decode('utf-8', errors='replace')
            return content, content_type

    def _run(self, url: str, run_manager=None) -> str:
        """Fetch and clean URL content."""
        try:
            content, content_type = self._fetch_with_retry(url)

            # Check if JSON
            if self._is_json(content, content_type):
                try:
                    parsed = json.loads(content)
                    formatted = json.dumps(parsed, indent=2, ensure_ascii=False)
                    return self._truncate_output(formatted)
                except json.JSONDecodeError:
                    pass

            # Process HTML
            if 'text/html' in content_type.lower() or content.strip().startswith('<'):
                return self._process_html(content)

            # Return plain text
            return self._truncate_output(content)

        except httpx.TimeoutException:
            return (
                f"Error: Request timed out after {self.timeout}s (tried {self.max_retries} times). "
                f"The site may be inaccessible from this server. "
                f"Try a different URL or use a search engine instead."
            )
        except httpx.HTTPStatusError as e:
            return f"Error: HTTP {e.response.status_code} - {str(e)}"
        except Exception as e:
            logger.error(f"Error fetching URL {url}: {str(e)}")
            return f"Error fetching URL: {str(e)}"

    def _process_html(self, html_content: str) -> str:
        """Process HTML content to clean Markdown."""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')

            # Remove unwanted elements
            for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
                tag.decompose()

            # Remove comments
            from bs4 import Comment
            for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
                comment.extract()

            # Convert to Markdown
            markdown = self._html_converter.handle(str(soup))

            # Clean up excessive whitespace
            import re
            markdown = re.sub(r'\n{3,}', '\n\n', markdown)

            return self._truncate_output(markdown)

        except Exception as e:
            logger.error(f"Error processing HTML: {str(e)}")
            return f"Error processing HTML: {str(e)}"


def create_fetch_url_tool(timeout: int = 60) -> CleanedFetchTool:
    """
    Create a URL fetch tool with HTML cleaning.

    Args:
        timeout: Request timeout in seconds (default 60)

    Returns:
        CleanedFetchTool instance
    """
    return CleanedFetchTool(timeout=timeout)
