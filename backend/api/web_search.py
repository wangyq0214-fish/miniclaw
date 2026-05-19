"""Web Search API - Source Discovery endpoint using Tavily."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from models.complete_models import User
from auth.security import get_current_user
from middleware.rate_limit import rate_limit_chat

router = APIRouter()


class WebSearchRequest(BaseModel):
    query: str
    max_results: int = 5
    chinese_first: bool = True


class WebSearchSource(BaseModel):
    id: str
    icon: str
    title: str
    url: str
    summary: str


class WebSearchResponse(BaseModel):
    query: str
    global_summary: str
    sources: list[WebSearchSource]


@router.post("/web-search", response_model=WebSearchResponse)
async def web_search(
    request: WebSearchRequest,
    current_user: User = Depends(get_current_user),
    _rate_limit=Depends(rate_limit_chat),
):
    """Search the web and return structured source discovery results."""
    from tools.web_search import search_web
    return await search_web(request.query, request.max_results, request.chinese_first)
