"""
Knowledge Search Tool - Neo4j Graph Database RAG

Graph Schema:
  (Course)-[:CONTAINS]->(Chapter)-[:HAS_SECTION]->(Section)-[:HAS_CHUNK]->(Chunk)
  (Entity)-[:APPEARS_IN]->(Chunk)
  (Entity)-[:RELATES_TO]->(Entity)

Node Properties:
  Chunk:   id (e.g. "ch2_s2_4"), content (text body), embedding (vector)
  Section: id, section_id, title
  Chapter: id, title
  Course:  id, title
  Entity:  name, type, occurrence

Search Strategy:
  1. Fulltext index search on Chunk.content (falls back to CONTAINS if index missing)
  2. Entity name matching -> APPEARS_IN -> related Chunks
  3. Entity relation traversal -> RELATES_TO -> Entity -> APPEARS_IN -> Chunks
  4. Vector similarity search on Chunk.embedding (via qwen3-embedding:8b)
  5. Results merged, deduplicated, sorted by score, returned with breadcrumb context
"""
import logging
import time
import requests
from typing import Optional, List, Dict, Any

from langchain_core.tools import BaseTool
from pydantic import Field

from config import settings

logger = logging.getLogger(__name__)


def _get_embedding(text: str) -> Optional[List[float]]:
    """Generate embedding using direct HTTP call to qwen3-embedding service."""
    url = settings.embedding_direct_url
    model = settings.embedding_direct_model
    max_retries = settings.embedding_max_retries
    retry_delay = settings.embedding_retry_delay

    for attempt in range(max_retries):
        try:
            resp = requests.post(
                url,
                json={"model": model, "input": [text]},
                timeout=60
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]
        except Exception as e:
            logger.warning(f"Embedding retry {attempt + 1}: {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
    logger.error("Embedding failed after all retries")
    return None


class Neo4jKnowledgeTool(BaseTool):
    """
    Hybrid knowledge search tool backed by Neo4j graph database.

    Supports fulltext index search, entity-based traversal, entity relation
    traversal, and vector similarity search on Chunk embeddings.

    Designed for multi-agent educational scenarios including:
    - Personalized resource generation (course docs, mindmaps, exercises, etc.)
    - Learning path planning and resource recommendation
    - Student profile analysis and knowledge gap identification
    - Domain concept and entity relationship queries
    """

    name: str = "search_knowledge_base"
    description: str = """Search the knowledge graph for relevant educational information.

The graph contains courses, chapters, sections, text chunks, and extracted entities with relationships.
Use this tool when agents need course content, concept explanations, learning resources, or domain knowledge.

Supported search modes (all run automatically and merged):
- Fulltext: keyword match on chunk content
- Entity: find chunks by entity name match (e.g. concept names, tool names)
- Entity relation: traverse Entity-[:RELATES_TO]->Entity to find related concept chunks
- Vector: semantic similarity search using qwen3-embedding (enabled by default)

Query examples for multi-agent educational tasks:
- Course concept lookup: "机器学习 损失函数"
- Student weakness resources: "梯度下降 反向传播"
- Learning path planning: "深度学习 入门 先修知识"
- Entity relationship: "卷积神经网络 激活函数"
- Resource type: "代码实操案例 Python 神经网络"
- Exercise generation: "练习题 分类算法 评估指标"

Args:
    query: The search query or question (Chinese or English)
    top_k: Number of results to return (default: 5)
"""

    uri: str = Field(default="")
    user: str = Field(default="")
    password: str = Field(default="")
    database: str = Field(default="")
    top_k: int = Field(default=5)
    embedding_enabled: bool = Field(
        default=True,
        description="Enable vector similarity search (requires Chunk.embedding property)"
    )

    def __init__(self, **data):
        super().__init__(**data)
        # Store driver outside Pydantic model to avoid serialization issues
        self.__dict__["_driver"] = None
        self._connect()

    def _uri(self) -> str:
        return self.uri or settings.neo4j_uri

    def _auth(self):
        return (
            self.user or settings.neo4j_user,
            self.password or settings.neo4j_password,
        )

    def _db(self) -> str:
        return self.database or settings.neo4j_database

    def _connect(self):
        try:
            from neo4j import GraphDatabase
            driver = GraphDatabase.driver(self._uri(), auth=self._auth())
            driver.verify_connectivity()
            self.__dict__["_driver"] = driver
            logger.info(f"Neo4j connected: {self._uri()}")
        except Exception as e:
            logger.warning(f"Neo4j connection failed: {e}")
            self.__dict__["_driver"] = None

    def _driver_or_reconnect(self):
        driver = self.__dict__.get("_driver")
        if driver is None:
            self._connect()
        return self.__dict__.get("_driver")

    # ------------------------------------------------------------------
    # Fulltext index search (primary path)
    # ------------------------------------------------------------------
    def _fulltext_search(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """Search via fulltext index on Chunk.content."""
        driver = self._driver_or_reconnect()
        if not driver:
            return []
        try:
            with driver.session(database=self._db()) as session:
                records = session.run(
                    """
                    CALL db.index.fulltext.queryNodes($index, $query)
                    YIELD node, score
                    OPTIONAL MATCH (s:Section)-[:HAS_CHUNK]->(node)
                    OPTIONAL MATCH (s)<-[:HAS_SECTION]-(ch:Chapter)<-[:CONTAINS]-(course:Course)
                    RETURN node.content AS content,
                           node.id     AS id,
                           s.title     AS section,
                           ch.title    AS chapter,
                           course.title AS course,
                           score,
                           'fulltext'  AS source_type
                    ORDER BY score DESC
                    LIMIT $top_k
                    """,
                    {"index": settings.neo4j_fulltext_index, "query": query, "top_k": top_k},
                ).data()
                logger.debug(f"Fulltext search returned {len(records)} results")
                return records
        except Exception as e:
            logger.error(f"Fulltext search error: {e}", exc_info=True)
            print(f"[FULLTEXT ERROR] {type(e).__name__}: {e}")
            import traceback; traceback.print_exc()
            return []

    # ------------------------------------------------------------------
    # CONTAINS fallback search (when fulltext index is absent)
    # ------------------------------------------------------------------
    def _contains_search(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """Fallback: CONTAINS scan on Chunk.content."""
        driver = self._driver_or_reconnect()
        if not driver:
            return []
        try:
            with driver.session(database=self._db()) as session:
                records = session.run(
                    """
                    MATCH (n:Chunk)
                    WHERE toLower(n.content) CONTAINS toLower($query)
                    OPTIONAL MATCH (s:Section)-[:HAS_CHUNK]->(n)
                    OPTIONAL MATCH (s)<-[:HAS_SECTION]-(ch:Chapter)<-[:CONTAINS]-(course:Course)
                    RETURN n.content     AS content,
                           n.id         AS id,
                           s.title      AS section,
                           ch.title     AS chapter,
                           course.title AS course,
                           0.5          AS score,
                           'contains'   AS source_type
                    LIMIT $top_k
                    """,
                    {"query": query, "top_k": top_k},
                ).data()
                logger.debug(f"CONTAINS fallback returned {len(records)} results")
                return records
        except Exception as e:
            logger.error(f"CONTAINS search error: {e}", exc_info=True)
            print(f"[CONTAINS ERROR] {type(e).__name__}: {e}")
            import traceback; traceback.print_exc()
            return []

    # ------------------------------------------------------------------
    # Entity direct search
    # ------------------------------------------------------------------
    def _entity_search(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """Match Entity nodes by name, then retrieve their associated Chunks."""
        driver = self._driver_or_reconnect()
        if not driver:
            return []
        try:
            with driver.session(database=self._db()) as session:
                records = session.run(
                    """
                    MATCH (e:Entity)
                    WHERE toLower(e.name) CONTAINS toLower($query)
                    WITH e LIMIT 5
                    MATCH (e)-[:APPEARS_IN]->(chunk:Chunk)
                    OPTIONAL MATCH (s:Section)-[:HAS_CHUNK]->(chunk)
                    OPTIONAL MATCH (s)<-[:HAS_SECTION]-(ch:Chapter)<-[:CONTAINS]-(course:Course)
                    RETURN chunk.content AS content,
                           chunk.id     AS id,
                           s.title      AS section,
                           ch.title     AS chapter,
                           course.title AS course,
                           e.name       AS entity_name,
                           e.type       AS entity_type,
                           0.7          AS score,
                           'entity'     AS source_type
                    LIMIT $top_k
                    """,
                    {"query": query, "top_k": top_k},
                ).data()
                logger.debug(f"Entity search returned {len(records)} results")
                return records
        except Exception as e:
            logger.error(f"Entity search error: {e}", exc_info=True)
            print(f"[ENTITY ERROR] {type(e).__name__}: {e}")
            import traceback; traceback.print_exc()
            return []

    # ------------------------------------------------------------------
    # Entity relation traversal search (new)
    # ------------------------------------------------------------------
    def _entity_relation_search(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """
        Traverse Entity-[:RELATES_TO]->Entity-[:APPEARS_IN]->Chunk.

        Finds chunks containing entities that are related to the queried entity,
        enabling discovery of contextually connected knowledge.
        """
        driver = self._driver_or_reconnect()
        if not driver:
            return []
        try:
            with driver.session(database=self._db()) as session:
                records = session.run(
                    """
                    MATCH (e1:Entity)
                    WHERE toLower(e1.name) CONTAINS toLower($query)
                    WITH e1 LIMIT 5
                    MATCH (e1)-[:RELATES_TO]->(e2:Entity)-[:APPEARS_IN]->(chunk:Chunk)
                    OPTIONAL MATCH (s:Section)-[:HAS_CHUNK]->(chunk)
                    OPTIONAL MATCH (s)<-[:HAS_SECTION]-(ch:Chapter)<-[:CONTAINS]-(course:Course)
                    RETURN chunk.content AS content,
                           chunk.id     AS id,
                           s.title      AS section,
                           ch.title     AS chapter,
                           course.title AS course,
                           e2.name      AS entity_name,
                           e2.type      AS entity_type,
                           0.65         AS score,
                           'entity_relation' AS source_type
                    LIMIT $top_k
                    """,
                    {"query": query, "top_k": top_k},
                ).data()
                logger.debug(f"Entity relation search returned {len(records)} results")
                return records
        except Exception as e:
            logger.error(f"Entity relation search error: {e}", exc_info=True)
            print(f"[ENTITY_RELATION ERROR] {type(e).__name__}: {e}")
            import traceback; traceback.print_exc()
            return []

    # ------------------------------------------------------------------
    # Vector similarity search
    # ------------------------------------------------------------------
    def _vector_search(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """
        Search via vector index on Chunk.embedding using qwen3-embedding:8b.

        Generates query embedding via direct HTTP call to the embedding service,
        then queries the Neo4j vector index for nearest neighbor chunks.
        """
        if not self.embedding_enabled:
            return []
        driver = self._driver_or_reconnect()
        if not driver:
            return []
        embedding = _get_embedding(query)
        if not embedding:
            logger.warning("Vector search skipped: embedding generation failed")
            return []
        try:
            with driver.session(database=self._db()) as session:
                records = session.run(
                    """
                    CALL db.index.vector.queryNodes($index, $top_k, $embedding)
                    YIELD node, score
                    OPTIONAL MATCH (s:Section)-[:HAS_CHUNK]->(node)
                    OPTIONAL MATCH (s)<-[:HAS_SECTION]-(ch:Chapter)<-[:CONTAINS]-(course:Course)
                    RETURN node.content AS content,
                           node.id     AS id,
                           s.title     AS section,
                           ch.title    AS chapter,
                           course.title AS course,
                           score,
                           'vector'    AS source_type
                    ORDER BY score DESC
                    LIMIT $top_k
                    """,
                    {
                        "index": settings.neo4j_vector_index,
                        "top_k": top_k,
                        "embedding": embedding,
                    },
                ).data()
                logger.debug(f"Vector search returned {len(records)} results")
                return records
        except Exception as e:
            logger.debug(f"Vector search error: {e}")
            return []

    # ------------------------------------------------------------------
    # Merge & format
    # ------------------------------------------------------------------
    def _merge_results(self, *result_lists, top_k: int) -> List[Dict[str, Any]]:
        """
        Merge multiple result lists with source diversity guarantee.

        Strategy:
          1. Each non-empty source contributes its top-1 result first (diversity slots).
          2. Remaining slots are filled by score-descending order across all sources.
        """
        seen_ids: set = set()
        merged: List[Dict[str, Any]] = []

        def _add(rec: Dict[str, Any]) -> bool:
            chunk_id = rec.get("id") or (rec.get("content") or "")[:50]
            if chunk_id not in seen_ids:
                seen_ids.add(chunk_id)
                merged.append(rec)
                return True
            return False

        # Phase 1: guarantee one result per source type
        for lst in result_lists:
            if lst:
                _add(lst[0])

        # Phase 2: fill remaining slots by score
        all_results: List[Dict[str, Any]] = []
        for lst in result_lists:
            all_results.extend(lst)
        all_results.sort(key=lambda x: x.get("score", 0), reverse=True)

        for rec in all_results:
            if len(merged) >= top_k:
                break
            _add(rec)

        return merged

    def _format_results(self, results: List[Dict[str, Any]], query: str) -> str:
        if not results:
            return f"No relevant information found in knowledge graph for: '{query}'"

        lines = [f"Knowledge graph search results for '{query}':\n"]
        for i, rec in enumerate(results, 1):
            source = rec.get("source_type", "")
            score = rec.get("score", 0)
            content = rec.get("content") or ""
            course = rec.get("course") or ""
            chapter = rec.get("chapter") or ""
            section = rec.get("section") or ""
            entity_name = rec.get("entity_name") or ""
            entity_type = rec.get("entity_type") or ""

            breadcrumb_parts = [p for p in [course, chapter, section] if p]
            breadcrumb = " > ".join(breadcrumb_parts) if breadcrumb_parts else "(unknown location)"

            entity_note = ""
            if entity_name:
                entity_note = f" [entity: {entity_name}"
                if entity_type:
                    entity_note += f" ({entity_type})"
                entity_note += "]"

            header = f"{i}. {breadcrumb}{entity_note}  [{source}] score={score:.3f}"
            display_text = content[:400] + "..." if len(content) > 400 else content

            lines.append(header)
            lines.append(f"   {display_text}")
            lines.append("")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------
    def _run(self, query: str, top_k: int = 5, run_manager=None) -> str:
        driver = self._driver_or_reconnect()
        if driver is None:
            return (
                "Error: Cannot connect to Neo4j knowledge base. "
                "Check NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD in .env"
            )

        # Primary: fulltext index
        ft_results = self._fulltext_search(query, top_k)

        # Fallback: CONTAINS scan if fulltext index returned nothing
        if not ft_results:
            ft_results = self._contains_search(query, top_k)

        # Entity direct traversal (always run)
        entity_results = self._entity_search(query, top_k)

        # Entity relation traversal (always run)
        entity_relation_results = self._entity_relation_search(query, top_k)

        # Vector search (runs when embedding_enabled=True, default)
        vec_results = self._vector_search(query, top_k)

        merged = self._merge_results(
            ft_results, vec_results, entity_results, entity_relation_results,
            top_k=top_k
        )
        return self._format_results(merged, query)


def create_knowledge_search_tool(
    knowledge_dir=None,  # kept for backward-compatibility with tools/__init__.py
    storage_dir=None,    # kept for backward-compatibility
    base_dir=None,       # kept for backward-compatibility
    **kwargs,
) -> Neo4jKnowledgeTool:
    """
    Create a Neo4j-backed knowledge search tool with hybrid retrieval.

    Retrieval strategy (all merged and ranked):
      1. Fulltext index search on Chunk.content
      2. CONTAINS fallback (if fulltext index missing)
      3. Entity name matching -> APPEARS_IN -> Chunk
      4. Entity relation traversal -> RELATES_TO -> Entity -> APPEARS_IN -> Chunk
      5. Vector similarity search on Chunk.embedding (qwen3-embedding:8b)

    The knowledge_dir / storage_dir / base_dir parameters are accepted but
    ignored — they were used by the previous LlamaIndex implementation.
    """
    return Neo4jKnowledgeTool(**kwargs)
