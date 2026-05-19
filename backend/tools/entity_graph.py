"""
Entity Graph Tool - Query entity relationships from Neo4j for learning plan generation.

Graph Schema:
  (Entity)-[:RELATES_TO]->(Entity)
  (Entity)-[:APPEARS_IN]->(Chunk)

Entity nodes have: name, type, occurrence
RELATES_TO edges connect related concepts (no relation_type property in current data).
"""
import logging
from typing import Dict, List

from langchain_core.tools import BaseTool
from pydantic import Field

from config import settings

logger = logging.getLogger(__name__)


class EntityGraphTool(BaseTool):
    """
    Query entity relationships from the Neo4j knowledge graph.

    Useful for understanding concept dependencies and determining
    learning order when generating study plans.
    """

    name: str = "get_entity_graph"
    description: str = """Query entity relationships from the knowledge graph.

Use this tool when you need to:
- Find what concepts are related to a given topic
- Understand prerequisite/dependency relationships between concepts
- Determine a logical learning order for a set of knowledge points
- Explore how concepts connect to each other in the curriculum

Args:
    entity_name: The concept to query (Chinese or English), e.g. "卷积神经网络", "梯度下降".
                 Matches by substring so partial names work.
    depth: Traversal depth, 1 or 2 (default 1).
           1 = direct neighbors only; 2 = neighbors of neighbors (broader context).

Returns related entities grouped as outgoing (what this concept leads to)
and incoming (what concepts point to this one).
"""

    uri: str = Field(default="")
    user: str = Field(default="")
    password: str = Field(default="")
    database: str = Field(default="")

    def __init__(self, **data):
        super().__init__(**data)
        self.__dict__["_driver"] = None
        self._connect()

    def _uri(self): return self.uri or settings.neo4j_uri
    def _auth(self): return (self.user or settings.neo4j_user, self.password or settings.neo4j_password)
    def _db(self): return self.database or settings.neo4j_database

    def _connect(self):
        try:
            from neo4j import GraphDatabase
            driver = GraphDatabase.driver(self._uri(), auth=self._auth())
            driver.verify_connectivity()
            self.__dict__["_driver"] = driver
        except Exception as e:
            logger.warning(f"EntityGraphTool Neo4j connection failed: {e}")
            self.__dict__["_driver"] = None

    def _driver_or_reconnect(self):
        if self.__dict__.get("_driver") is None:
            self._connect()
        return self.__dict__.get("_driver")

    def _run(self, entity_name: str, depth: int = 1, run_manager=None) -> str:
        if not entity_name:
            return "Error: entity_name is required."

        driver = self._driver_or_reconnect()
        if driver is None:
            return "Error: Cannot connect to Neo4j. Check connection settings."

        depth = max(1, min(int(depth), 2))

        try:
            with driver.session(database=self._db()) as session:
                # Outgoing: entity -> related concepts
                if depth == 1:
                    outgoing = session.run(
                        """
                        MATCH (e1:Entity)
                        WHERE toLower(e1.name) CONTAINS toLower($name)
                        WITH e1 LIMIT 5
                        MATCH (e1)-[:RELATES_TO]->(e2:Entity)
                        RETURN e1.name AS source, e2.name AS target, e2.type AS target_type
                        ORDER BY e1.name, e2.name
                        LIMIT 80
                        """,
                        {"name": entity_name},
                    ).data()
                else:
                    outgoing = session.run(
                        """
                        MATCH (e1:Entity)
                        WHERE toLower(e1.name) CONTAINS toLower($name)
                        WITH e1 LIMIT 3
                        MATCH path = (e1)-[:RELATES_TO*1..2]->(e2:Entity)
                        WHERE e1 <> e2
                        RETURN e1.name AS source, e2.name AS target, e2.type AS target_type,
                               length(path) AS hops
                        ORDER BY hops, e2.name
                        LIMIT 120
                        """,
                        {"name": entity_name},
                    ).data()

                # Incoming: what concepts point to this entity
                incoming = session.run(
                    """
                    MATCH (e1:Entity)
                    WHERE toLower(e1.name) CONTAINS toLower($name)
                    WITH e1 LIMIT 5
                    MATCH (e0:Entity)-[:RELATES_TO]->(e1)
                    RETURN e0.name AS source, e1.name AS target, e0.type AS source_type
                    ORDER BY e0.name
                    LIMIT 50
                    """,
                    {"name": entity_name},
                ).data()

                # Also find which sections/chapters contain this entity
                locations = session.run(
                    """
                    MATCH (e:Entity)
                    WHERE toLower(e.name) CONTAINS toLower($name)
                    WITH e LIMIT 5
                    MATCH (e)-[:APPEARS_IN]->(c:Chunk)
                    OPTIONAL MATCH (s:Section)-[:HAS_CHUNK]->(c)
                    OPTIONAL MATCH (s)<-[:HAS_SECTION]-(ch:Chapter)
                    RETURN DISTINCT ch.id AS ch_id, ch.title AS ch_title,
                                    s.id AS sec_id, s.title AS sec_title
                    ORDER BY ch.id, s.id
                    LIMIT 20
                    """,
                    {"name": entity_name},
                ).data()

        except Exception as e:
            logger.error(f"EntityGraphTool error: {e}", exc_info=True)
            return f"Error querying entity graph: {e}"

        if not outgoing and not incoming and not locations:
            return f"No entity relationships found for: '{entity_name}'"

        lines = [f"Entity graph for '{entity_name}':\n"]

        # Where it appears in the course
        if locations:
            lines.append("Appears in:")
            for loc in locations:
                ch = f"[{loc['ch_id']}] {loc['ch_title']}" if loc['ch_id'] else "(unknown chapter)"
                sec = f" > [{loc['sec_id']}] {loc['sec_title']}" if loc['sec_id'] else ""
                lines.append(f"  {ch}{sec}")
            lines.append("")

        # Outgoing relations
        if outgoing:
            lines.append("Related concepts (outgoing):")
            grouped: Dict[str, List[str]] = {}
            for r in outgoing:
                grouped.setdefault(r["source"], []).append(r["target"])
            for src, targets in grouped.items():
                lines.append(f"  {src} → {', '.join(targets)}")
            lines.append("")

        # Incoming relations
        if incoming:
            lines.append("Concepts that lead to this entity (incoming):")
            for r in incoming:
                lines.append(f"  {r['source']} → {r['target']}")
            lines.append("")

        return "\n".join(lines)


def create_entity_graph_tool(**kwargs) -> EntityGraphTool:
    return EntityGraphTool(**kwargs)
