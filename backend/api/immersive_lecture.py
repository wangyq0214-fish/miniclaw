"""
Immersive Lecture API - LLM-powered lecture generation with caching and chat
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import json
import asyncio
import logging
import hashlib
from datetime import datetime, timezone

from config import get_knowledge_dir, get_openai_api_key, get_openai_api_base, get_openai_model
from database import get_db
from models.immersive_lecture import ImmersiveLectureContent, ImmersiveLectureProgress

logger = logging.getLogger(__name__)

router = APIRouter()


class ImmersiveLectureRequest(BaseModel):
    course_id: str
    chapter_id: int
    page_index: int  # Which page within the chapter
    user_id: int
    markdown_content: str  # The actual page content to generate lecture from
    force_regenerate: bool = False  # Force regeneration even if cached


class ProgressUpdate(BaseModel):
    user_id: int
    course_id: str
    chapter_id: int
    page_index: int  # Which page within the chapter
    current_block_index: int
    current_section: int
    total_sections: int
    completed: bool = False


def compute_content_hash(content: str) -> str:
    """Compute MD5 hash of content for caching"""
    return hashlib.md5(content.encode('utf-8')).hexdigest()


async def generate_lecture_with_llm(markdown_content: str, course_id: str, chapter_id: int) -> dict:
    """
    Use LLM to generate structured lecture content with speech
    Similar to chat streaming but outputs structured blocks
    """
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=get_openai_api_key(),
        base_url=get_openai_api_base()
    )

    prompt = f"""你是一位优秀的教师，需要将以下 Markdown 教学内容转换为结构化的互动讲解。

## 要求

1. **场景划分**：将内容分成 5-8 个场景（section），每个场景围绕一个核心知识点
2. **内容块数量**：每个场景包含 2-4 个内容块，总共 15-25 个 blocks
3. **内容类型多样化**：
   - title：章节标题，使用 level: 1 表示总标题，level: 2 表示场景标题
   - insight：关键洞察和重要概念
   - text：详细解释段落
   - list：要点列表（数组格式）
   - code：代码示例
   - formula：数学公式（LaTeX格式，用 $$ 包裹）
4. **speech 字段**：每个 block 都需要 150-300字的口语化讲解
5. **标题格式**：title 的 content 只写核心标题文字，不要加"场景一："、"第一部分："、"Chapter X："等前缀

## 标题示例（正确 vs 错误）

正确：
- "注意力机制"
- "自注意力计算"
- "多头注意力"

错误（不要这样写）：
- "场景三：注意力机制"
- "第一部分：自注意力计算"
- "Chapter 2 - 多头注意力"

## 输出 JSON 格式

```json
{{
  "blocks": [
    {{
      "type": "title",
      "content": "课程总标题",
      "metadata": {{
        "level": 1,
        "section": 0,
        "speech": "欢迎来到课程..."
      }}
    }},
    {{
      "type": "title",
      "content": "第一个知识点",
      "metadata": {{
        "level": 2,
        "section": 1,
        "speech": "首先我们来学习..."
      }}
    }},
    {{
      "type": "insight",
      "content": "核心概念解释",
      "metadata": {{
        "section": 1,
        "speech": "这里的关键点是..."
      }}
    }},
    {{
      "type": "text",
      "content": "详细说明...",
      "metadata": {{
        "section": 1,
        "speech": "让我详细解释..."
      }}
    }},
    {{
      "type": "formula",
      "content": "$$E = mc^2$$",
      "metadata": {{
        "section": 1,
        "speech": "这个公式表示..."
      }}
    }},
    {{
      "type": "list",
      "content": ["要点1", "要点2", "要点3"],
      "metadata": {{
        "section": 1,
        "speech": "让我们看看这几个要点..."
      }}
    }},
    {{
      "type": "code",
      "content": "print('Hello World')",
      "metadata": {{
        "section": 2,
        "language": "python",
        "speech": "这段代码的作用是..."
      }}
    }}
  ]
}}
```

## Markdown 内容

{markdown_content}

请直接输出 JSON，不要有其他文字。确保：
1. 至少有 5 个不同的 section（0-4 或更多）
2. 包含至少 1 个 formula 类型的 block
3. 包含至少 1 个 code 类型的 block（如果内容涉及编程）
4. 包含至少 2 个 list 类型的 block
"""

    try:
        response = await client.chat.completions.create(
            model=get_openai_model(),
            messages=[
                {"role": "system", "content": "你是一位专业的教学内容生成助手，擅长将教材转换为生动的讲解。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)

        # Add section numbers and IDs
        # First pass: assign sections based on level 2 titles
        current_section = 0
        for i, block in enumerate(result['blocks']):
            block['id'] = f"block-{i+1}"

            # Track sections based on H2 titles (level 2)
            if block['type'] == 'title' and block.get('metadata', {}).get('level') == 2:
                current_section += 1

            if 'metadata' not in block:
                block['metadata'] = {}
            block['metadata']['section'] = current_section

        # If only one section was created (section 0), redistribute blocks
        if current_section == 0:
            # Distribute blocks into multiple sections (3-4 blocks per section)
            blocks = result['blocks']
            blocks_per_section = 3
            for i, block in enumerate(blocks):
                section_index = i // blocks_per_section
                block['metadata']['section'] = section_index
            current_section = len(blocks) // blocks_per_section

        return {
            'blocks': result['blocks'],
            'total_sections': current_section,
            'total_blocks': len(result['blocks'])
        }

    except Exception as e:
        logger.error(f"Error generating lecture with LLM: {e}")
        raise


@router.post("/immersive-lecture/generate")
async def generate_immersive_lecture(
    request: ImmersiveLectureRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate immersive lecture content with LLM

    Flow:
    1. Check cache in database (based on content hash)
    2. If not cached, generate with LLM
    3. Save to database
    4. Stream to frontend
    """
    try:
        # Use the provided markdown content directly
        markdown_content = request.markdown_content

        # Compute content hash for caching
        content_hash = compute_content_hash(markdown_content)

        # Check if already generated and cached (skip if force_regenerate)
        cached = None
        if not request.force_regenerate:
            result = await db.execute(
                select(ImmersiveLectureContent).where(
                    and_(
                        ImmersiveLectureContent.course_id == request.course_id,
                        ImmersiveLectureContent.chapter_id == request.chapter_id,
                        ImmersiveLectureContent.content_hash == content_hash
                    )
                )
            )
            cached = result.scalar_one_or_none()

        if cached:
            logger.info(f"Using cached lecture content for {request.course_id}/chapter{request.chapter_id}/page{request.page_index}")
            blocks = cached.blocks['blocks']
            total_sections = cached.total_sections
        else:
            logger.info(f"Generating new lecture content for {request.course_id}/chapter{request.chapter_id}/page{request.page_index}")
            # Generate with LLM
            result = await generate_lecture_with_llm(markdown_content, request.course_id, request.chapter_id)
            blocks = result['blocks']
            total_sections = result['total_sections']

            # Save to database
            lecture_content = ImmersiveLectureContent(
                course_id=request.course_id,
                chapter_id=request.chapter_id,
                content_hash=content_hash,
                blocks={'blocks': blocks},
                total_sections=total_sections,
                total_blocks=len(blocks)
            )
            db.add(lecture_content)
            await db.commit()
            logger.info(f"Saved lecture content to database")

        # Stream blocks to frontend
        async def stream_blocks():
            try:
                for i, block in enumerate(blocks):
                    # Send content block
                    event = {
                        "type": "content_block",
                        "block_type": block['type'],
                        "content": block['content'],
                        "metadata": block.get('metadata', {})
                    }
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

                    # Send progress update when section changes
                    block_section = block.get('metadata', {}).get('section', 0)
                    if i == 0 or block_section != blocks[i-1].get('metadata', {}).get('section', 0):
                        progress_event = {
                            "type": "progress",
                            "current_section": block_section,
                            "total_sections": total_sections
                        }
                        yield f"data: {json.dumps(progress_event, ensure_ascii=False)}\n\n"

                    # Add delay between blocks for streaming effect
                    delay = 0.8 if block['type'] in ['title', 'insight'] else 0.5
                    await asyncio.sleep(delay)

                # Send completion event
                done_event = {
                    "type": "done",
                    "total_blocks": len(blocks),
                    "total_sections": total_sections
                }
                yield f"data: {json.dumps(done_event, ensure_ascii=False)}\n\n"

            except Exception as e:
                logger.error(f"Error streaming blocks: {e}")
                error_event = {
                    "type": "error",
                    "error": str(e)
                }
                yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            stream_blocks(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Chapter not found")
    except Exception as e:
        logger.error(f"Error generating immersive lecture: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/immersive-lecture/progress")
async def save_progress(
    progress: ProgressUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Save user learning progress"""
    try:
        # Check if progress exists
        result = await db.execute(
            select(ImmersiveLectureProgress).where(
                and_(
                    ImmersiveLectureProgress.user_id == progress.user_id,
                    ImmersiveLectureProgress.course_id == progress.course_id,
                    ImmersiveLectureProgress.chapter_id == progress.chapter_id,
                    ImmersiveLectureProgress.page_index == progress.page_index
                )
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing progress
            existing.current_block_index = progress.current_block_index
            existing.current_section = progress.current_section
            existing.total_sections = progress.total_sections
            existing.completed = progress.completed
        else:
            # Create new progress
            new_progress = ImmersiveLectureProgress(
                user_id=progress.user_id,
                course_id=progress.course_id,
                chapter_id=progress.chapter_id,
                page_index=progress.page_index,
                current_block_index=progress.current_block_index,
                current_section=progress.current_section,
                total_sections=progress.total_sections,
                completed=progress.completed
            )
            db.add(new_progress)

        await db.commit()
        return {"status": "success"}

    except Exception as e:
        logger.error(f"Error saving progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/immersive-lecture/progress/{user_id}/{course_id}/{chapter_id}/{page_index}")
async def get_progress(
    user_id: int,
    course_id: str,
    chapter_id: int,
    page_index: int,
    db: AsyncSession = Depends(get_db)
):
    """Get user learning progress"""
    try:
        result = await db.execute(
            select(ImmersiveLectureProgress).where(
                and_(
                    ImmersiveLectureProgress.user_id == user_id,
                    ImmersiveLectureProgress.course_id == course_id,
                    ImmersiveLectureProgress.chapter_id == chapter_id,
                    ImmersiveLectureProgress.page_index == page_index
                )
            )
        )
        progress = result.scalar_one_or_none()

        if not progress:
            return {
                "exists": False,
                "current_block_index": 0,
                "current_section": 0,
                "completed": False
            }

        return {
            "exists": True,
            "current_block_index": progress.current_block_index,
            "current_section": progress.current_section,
            "total_sections": progress.total_sections,
            "completed": progress.completed,
            "last_accessed": progress.last_accessed.isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Immersive Classroom Chat ──

from typing import List


class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: str


class ImmersiveChatRequest(BaseModel):
    user_id: int
    course_id: str
    chapter_id: int
    page_index: int
    message: str
    chat_history: List[ChatMessage] = []


class CustomTopicRequest(BaseModel):
    user_id: int
    course_id: str
    chapter_id: int
    page_index: int
    topic: str


@router.post("/immersive-lecture/chat")
async def immersive_chat(request: ImmersiveChatRequest):
    """
    Chat endpoint for immersive classroom.
    Agent decides whether to generate new lecture content or just answer questions.
    Returns SSE stream with:
    - message: Chat response tokens
    - new_content: New lecture blocks if agent decides to generate
    - done: Completion signal
    """
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

        api_key = get_openai_api_key()
        api_base = get_openai_api_base()
        model_name = get_openai_model()

        llm = ChatOpenAI(
            model=model_name,
            api_key=api_key,
            base_url=api_base,
            temperature=0.7,
            streaming=True
        )

        async def stream_chat():
            try:
                # Build conversation history
                messages = [
                    SystemMessage(content="""你是一位优秀的AI教学助手，正在帮助学生学习课程内容。

你的职责：
1. 回答学生关于当前课程内容的问题
2. 当学生明确要求"继续讲解"、"下一部分"、"详细说明"等时，生成新的结构化讲解内容
3. 判断是否需要生成新内容：只有当学生明确请求更多讲解时才生成

如果需要生成新的讲解内容，在回复的最后添加特殊标记：
[GENERATE_CONTENT]
然后提供一个简短的主题描述。

否则，直接回答学生的问题即可。""")
                ]

                # Add chat history
                for msg in request.chat_history[-10:]:  # Keep last 10 messages
                    if msg.role == 'user':
                        messages.append(HumanMessage(content=msg.content))
                    else:
                        messages.append(AIMessage(content=msg.content))

                # Add current message
                messages.append(HumanMessage(content=request.message))

                # Stream response
                full_response = ""
                async for chunk in llm.astream(messages):
                    if chunk.content:
                        full_response += chunk.content
                        event = {
                            "type": "message",
                            "content": chunk.content
                        }
                        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

                # Check if agent wants to generate new content
                if "[GENERATE_CONTENT]" in full_response:
                    # Extract topic
                    topic = full_response.split("[GENERATE_CONTENT]")[-1].strip()

                    # Generate new lecture content
                    logger.info(f"Agent requested new content generation for topic: {topic}")

                    # Generate additional content based on topic
                    generation_result = await generate_lecture_with_llm(
                        f"# {topic}\n\n基于之前的内容，继续深入讲解这个主题。",
                        request.course_id,
                        request.chapter_id
                    )

                    # Send new content blocks
                    new_blocks = generation_result.get('blocks', [])
                    for block in new_blocks:
                        event = {
                            "type": "new_content",
                            "block": block
                        }
                        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                        await asyncio.sleep(0.5)

                # Send done event
                done_event = {
                    "type": "done",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                yield f"data: {json.dumps(done_event, ensure_ascii=False)}\n\n"

            except Exception as e:
                logger.error(f"Error in chat stream: {e}")
                error_event = {
                    "type": "error",
                    "error": str(e)
                }
                yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            stream_chat(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )

    except Exception as e:
        logger.error(f"Error in immersive chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/immersive-lecture/generate-custom")
async def generate_custom_topic(request: CustomTopicRequest):
    """
    Generate lecture content for a custom topic specified by user.
    Returns SSE stream with content blocks.
    """
    try:
        # Generate content for the custom topic
        async def stream_blocks():
            try:
                # Send status message
                status_event = {
                    "type": "message",
                    "content": f"正在为你生成关于「{request.topic}」的讲解内容...\n\n"
                }
                yield f"data: {json.dumps(status_event, ensure_ascii=False)}\n\n"

                # Generate lecture content
                result = await generate_lecture_with_llm(
                    request.topic,
                    request.course_id,
                    request.chapter_id
                )

                blocks = result.get('blocks', [])
                total_sections = result.get('total_sections', 0)

                # Stream each block
                for i, block in enumerate(blocks):
                    event = {
                        "type": "content_block",
                        "block_type": block['type'],
                        "content": block['content'],
                        "metadata": block.get('metadata', {})
                    }
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    await asyncio.sleep(0.5)

                # Send completion event
                done_event = {
                    "type": "done",
                    "total_blocks": len(blocks),
                    "total_sections": total_sections,
                    "topic": request.topic
                }
                yield f"data: {json.dumps(done_event, ensure_ascii=False)}\n\n"

            except Exception as e:
                logger.error(f"Error generating custom topic: {e}")
                error_event = {
                    "type": "error",
                    "error": str(e)
                }
                yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            stream_blocks(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )

    except Exception as e:
        logger.error(f"Error in custom topic generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
