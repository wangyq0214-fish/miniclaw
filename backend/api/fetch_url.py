"""Fetch URL API - Get web page content for source import."""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from models.complete_models import User
from auth.security import get_current_user
from middleware.rate_limit import rate_limit_chat

logger = logging.getLogger(__name__)
router = APIRouter()


class FetchUrlRequest(BaseModel):
    url: str


class FetchUrlResponse(BaseModel):
    url: str
    content: str
    success: bool
    error: str = ""


@router.post("/fetch-url", response_model=FetchUrlResponse)
async def fetch_url(
    request: FetchUrlRequest,
    current_user: User = Depends(get_current_user),
    _rate_limit=Depends(rate_limit_chat),
):
    """Fetch web page content and return cleaned text."""
    from tools.fetch_url import CleanedFetchTool
    tool = CleanedFetchTool(max_output_chars=50000, max_retries=3)
    try:
        content = tool.invoke(request.url)
        return FetchUrlResponse(
            url=request.url,
            content=content,
            success=True,
        )
    except Exception as e:
        logger.warning(f"Failed to fetch {request.url}: {e}")
        return FetchUrlResponse(
            url=request.url,
            content="",
            success=False,
            error=str(e),
        )
