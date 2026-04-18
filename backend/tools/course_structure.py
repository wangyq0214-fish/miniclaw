"""
Course Structure Tool - Query Neo4j for course/chapter/section hierarchy.

Graph Schema:
  (Course)-[:CONTAINS]->(Chapter)-[:HAS_SECTION]->(Section)-[:HAS_CHUNK]->(Chunk)

Chapter ids follow pattern: ch1, ch2, ..., ch12 (sorted numerically by id suffix).
Section ids follow pattern: ch1_1.1, ch1_1.1.1, etc.
"""
import re
import logging
from typing import Optional, List, Dict, Any

from langchain_core.tools import BaseTool
from pydantic import Field

from config import settings

logger = logging.getLogger(__name__)


def _chapter_sort_key(ch: Dict) -> int:
    """Sort chapters numerically by id suffix (ch1 < ch2 < ... < ch12)."""
    m = re.search(r"\d+", ch.get("id") or "")
    return int(m.group()) if m else 999


class CourseStructureTool(BaseTool):
    """
    Query the full course structure from Neo4j knowledge graph.

    Returns a hierarchical outline of all chapters and their sections,
    suitable for learning plan generation and curriculum overview.
    """

    name: str = "get_course_structure"
    description: str = """Get the full course structure (chapters and sections) from the knowledge graph.

Use this tool when you need to:
- Generate a learning plan or study schedule
- Understand what topics are covered in the course
- Find which chapter/section covers a specific topic
- Get an overview of the curriculum before diving into details

Returns a structured outline with chapter titles and their sections in order.

Args:
    chapter_id: (optional) Filter to a specific chapter, e.g. "ch5". If omitted, returns all chapters.
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
            logger.warning(f"CourseStructureTool Neo4j connection failed: {e}")
            self.__dict__["_driver"] = None

    def _driver_or_reconnect(self):
        if self.__dict__.get("_driver") is None:
            self._connect()
        return self.__dict__.get("_driver")

    def _run(self, chapter_id: str = "", run_manager=None) -> str:
        driver = self._driver_or_reconnect()
        if driver is None:
            return "Error: Cannot connect to Neo4j. Check connection settings."

        try:
            with driver.session(database=self._db()) as session:
                # Fetch chapters
                if chapter_id:
                    chapters = session.run(
                        "MATCH (ch:Chapter) WHERE ch.id = $id RETURN ch.id AS id, ch.title AS title",
                        {"id": chapter_id}
                    ).data()
                else:
                    chapters = session.run(
                        "MATCH (ch:Chapter) RETURN ch.id AS id, ch.title AS title"
                    ).data()

                chapters.sort(key=_chapter_sort_key)

                if not chapters:
                    return f"No chapters found{' for id: ' + chapter_id if chapter_id else ''}."

                # Fetch all sections for these chapters
                ch_ids = [c["id"] for c in chapters]
                sections = session.run(
                    """
                    MATCH (ch:Chapter)-[:HAS_SECTION]->(s:Section)
                    WHERE ch.id IN $ids
                    RETURN ch.id AS chapter_id, s.id AS id, s.title AS title
                    ORDER BY s.id
                    """,
                    {"ids": ch_ids}
                ).data()

            # Group sections by chapter
            sec_map: Dict[str, List[Dict]] = {c["id"]: [] for c in chapters}
            for sec in sections:
                cid = sec["chapter_id"]
                if cid in sec_map:
                    sec_map[cid].append({"id": sec["id"], "title": sec["title"]})

            # Format output
            lines = ["Course Structure:\n"]
            for ch in chapters:
                lines.append(f"[{ch['id']}] {ch['title']}")
                secs = sec_map.get(ch["id"], [])
                if secs:
                    for sec in secs:
                        indent = "  " * (sec["id"].count("_") + sec["id"].count(".") - 1)
                        lines.append(f"  {indent}- [{sec['id']}] {sec['title']}")
                else:
                    lines.append("  (no sections)")
                lines.append("")

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"CourseStructureTool error: {e}", exc_info=True)
            return f"Error querying course structure: {e}"


def create_course_structure_tool(**kwargs) -> CourseStructureTool:
    return CourseStructureTool(**kwargs)
