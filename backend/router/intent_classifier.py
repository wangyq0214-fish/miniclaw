"""
Intent Classifier - Fast routing for simple vs complex queries

Classifies user messages into categories to route them appropriately:
- simple_qa: Simple questions that can be answered directly
- knowledge_query: Questions needing RAG retrieval
- complex_task: Tasks requiring full agent with tools
- subagent_task: Tasks that should go directly to a specific subagent
"""
import re
import logging
from typing import Literal
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from config import settings

logger = logging.getLogger(__name__)

IntentType = Literal["simple_qa", "knowledge_query", "complex_task", "subagent_task"]

# Patterns for quick rule-based classification
SUBAGENT_PATTERNS = {
    "mindmap_designer": r"(思维导图|脑图|mindmap|知识结构图)",
    "lecture_writer": r"(讲义|讲解|文档|详细说明|学习材料)",
    "exercise_composer": r"(练习题|习题|测试题|题目|测验)",
    "flashcard_composer": r"(闪卡|记忆卡|flashcard|背诵卡)",
    "reading_curator": r"(阅读清单|书单|推荐阅读|参考资料)",
    "code_case_builder": r"(代码案例|示例代码|代码示例|编程示例)",
}

# Simple patterns that indicate simple Q&A
SIMPLE_PATTERNS = [
    r"^(你好|hi|hello|嗨)",
    r"^(谢谢|感谢|thanks)",
    r"^(帮我|请).{0,5}(翻译|转换|计算|求)",
]

# Patterns indicating need for tools/knowledge
COMPLEX_PATTERNS = [
    r"(生成|创建|写|制作).{0,10}(代码|程序|脚本|文件)",
    r"(分析|研究|调查|探索)",
    r"(实现|开发|设计|构建)",
    r"(调试|修复|优化|改进)",
    r"(读取|查看|搜索|查找).{0,10}(文件|目录|代码)",
]


class IntentClassifier:
    """Fast intent classifier using rules + optional LLM fallback."""

    def __init__(self):
        self._llm = None

    def _get_llm(self) -> ChatOpenAI:
        """Lazy initialize LLM for classification."""
        if self._llm is None:
            self._llm = ChatOpenAI(
                model=settings.openai_model,
                api_key=settings.openai_api_key or "sk-dummy",
                base_url=settings.openai_api_base,
                temperature=0,
                max_tokens=50,
            )
        return self._llm

    def classify_by_rules(self, message: str) -> IntentType | None:
        """
        Quick rule-based classification.
        Returns None if rules can't determine intent (needs LLM).
        """
        # Check for subagent tasks first (most specific)
        for agent_name, pattern in SUBAGENT_PATTERNS.items():
            if re.search(pattern, message, re.IGNORECASE):
                logger.info(f"Rule match: subagent_task -> {agent_name}")
                return "subagent_task"

        # Check for simple patterns
        for pattern in SIMPLE_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                logger.info("Rule match: simple_qa")
                return "simple_qa"

        # Check for complex patterns
        for pattern in COMPLEX_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                logger.info("Rule match: complex_task")
                return "complex_task"

        # Short messages are likely simple questions
        if len(message) < 20 and "?" in message or "？" in message:
            logger.info("Rule match: simple_qa (short question)")
            return "simple_qa"

        return None  # Need LLM classification

    async def classify_with_llm(self, message: str, history: list = None) -> IntentType:
        """
        LLM-based classification for ambiguous messages.
        Fast single LLM call with structured output.
        """
        try:
            llm = self._get_llm()

            system_prompt = """你是一个意图分类器。根据用户消息，快速判断属于以下哪一类：

1. simple_qa - 简单问答，可以直接用文字回答的问题（概念解释、定义、简单对比）
2. knowledge_query - 需要检索知识库的问题（涉及具体课程内容、专业知识点）
3. complex_task - 复杂任务，需要使用工具（生成代码、文件操作、分析任务）
4. subagent_task - 需要专门子代理完成的任务（生成讲义、思维导图、练习题等）

只回复分类名称，不要解释。"""

            # Include last few messages for context if available
            context = ""
            if history and len(history) > 0:
                recent = history[-3:]  # Last 3 messages
                context = "\n最近对话：" + "".join([f"\n{m.get('role')}: {m.get('content', '')[:50]}" for m in recent])

            response = await llm.ainvoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"用户消息：{message}{context}")
            ])

            result = response.content.strip().lower()

            # Map response to intent type
            if "simple" in result:
                return "simple_qa"
            elif "knowledge" in result:
                return "knowledge_query"
            elif "complex" in result:
                return "complex_task"
            elif "subagent" in result:
                return "subagent_task"
            else:
                # Default to complex_task for safety
                logger.warning(f"Unexpected LLM classification: {result}")
                return "complex_task"

        except Exception as e:
            logger.error(f"LLM classification error: {e}")
            # Fallback to complex_task to be safe
            return "complex_task"

    async def classify(self, message: str, history: list = None) -> IntentType:
        """
        Classify message intent.
        Tries rules first, falls back to LLM if needed.
        """
        # Try rule-based first (fast)
        intent = self.classify_by_rules(message)
        if intent:
            return intent

        # Fall back to LLM (still fast, single call)
        return await self.classify_with_llm(message, history)


# Singleton instance
intent_classifier = IntentClassifier()
