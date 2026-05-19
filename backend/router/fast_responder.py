"""
Fast Responder - Direct LLM response without agent overhead

For simple questions that don't need tools or complex reasoning.
"""
import logging
from typing import AsyncGenerator, Dict, Any, List
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessageChunk

from config import settings

logger = logging.getLogger(__name__)


class FastResponder:
    """Direct LLM streaming without agent framework overhead."""

    def __init__(self):
        self._model = None

    def _get_model(self) -> ChatOpenAI:
        """Lazy initialize model."""
        if self._model is None:
            self._model = ChatOpenAI(
                model=settings.openai_model,
                api_key=settings.openai_api_key or "sk-dummy",
                base_url=settings.openai_api_base,
                temperature=0.7,
                streaming=True,
            )
        return self._model

    def _build_messages(
        self,
        message: str,
        history: List[Dict[str, Any]],
        system_prompt: str
    ) -> List:
        """Build message list for simple chat."""
        messages = []

        # System prompt (simplified for fast response)
        messages.append(SystemMessage(content=system_prompt))

        # Add relevant history (last few messages for context)
        for msg in history[-5:]:  # Last 5 messages only
            role = msg.get("role", "user")
            content = msg.get("content", "")[:500]  # Truncate long messages
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessageChunk(content=content))

        # Current message
        messages.append(HumanMessage(content=message))

        return messages

    async def stream_response(
        self,
        message: str,
        history: List[Dict[str, Any]],
        system_prompt: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream direct LLM response without agent overhead.

        Yields:
        - token: Streaming tokens
        - done: Response complete
        """
        try:
            model = self._get_model()
            messages = self._build_messages(message, history, system_prompt)

            full_content = ""

            async for chunk in model.astream(messages):
                if chunk.content:
                    full_content += chunk.content
                    yield {
                        "type": "token",
                        "content": chunk.content
                    }

            # Signal completion
            yield {
                "type": "done",
                "content": full_content,
                "session_id": "",  # Will be filled by caller
                "tool_calls": []
            }

        except Exception as e:
            logger.error(f"Fast responder error: {e}")
            yield {
                "type": "error",
                "error": str(e)
            }


# Singleton instance
fast_responder = FastResponder()
