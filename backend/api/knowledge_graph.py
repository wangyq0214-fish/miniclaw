"""
Knowledge Graph API

REST endpoints for querying the Neo4j knowledge graph,
exposing entity relationships and course structure to the frontend.

Reuses Cypher query patterns from tools/entity_graph.py and tools/course_structure.py.
"""
import re
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Models ──────────────────────────────────────────────

class GraphNode(BaseModel):
    id: str
    name: str
    type: str  # "entity" | "course" | "chapter" | "section"
    # Enriched properties (optional, populated when available)
    occurrence: Optional[int] = None       # entity frequency across corpus
    entity_type: Optional[str] = None      # entity semantic type (e.g. "概念", "模型")
    description: Optional[str] = None      # entity description
    chapters: Optional[str] = None         # chapter this entity belongs to
    section_id: Optional[str] = None       # raw section id (for section nodes)
    child_count: Optional[int] = None      # number of direct children


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str  # "RELATES_TO" | "CONTAINS" | "HAS_SECTION" | "APPEARS_IN"
    # Enriched properties (optional)
    description: Optional[str] = None      # relationship description
    chapter: Optional[str] = None          # chapter reference (for APPEARS_IN)
    chunk_id: Optional[str] = None         # chunk reference (for APPEARS_IN)
    occurrence: Optional[int] = None       # relationship occurrence count


class GraphData(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


# ── Neo4j Connection ────────────────────────────────────

_driver = None


def _get_driver():
    global _driver
    if _driver is None:
        try:
            from neo4j import GraphDatabase
            _driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_user, settings.neo4j_password),
            )
            _driver.verify_connectivity()
        except Exception as e:
            logger.error(f"Neo4j connection failed: {e}")
            _driver = None
    return _driver


def _get_db():
    return settings.neo4j_database


def _chapter_sort_key(ch_id: str) -> int:
    m = re.search(r"\d+", ch_id or "")
    return int(m.group()) if m else 999


def _valid_id(val) -> bool:
    """Return True if val is a usable id (not None and not the literal string 'None')."""
    return bool(val) and val != "None"


# ── Endpoints ───────────────────────────────────────────

@router.get("/knowledge/graph/root", response_model=GraphData)
async def get_graph_root():
    """
    Get the root node of the knowledge graph.

    Returns a single course node (the first valid one found).
    Falls back to a virtual root if no valid course exists.
    """
    driver = _get_driver()
    if driver is None:
        raise HTTPException(status_code=503, detail="Neo4j not available")

    try:
        with driver.session(database=_get_db()) as session:
            # Try to find a valid course with an id
            courses = session.run(
                "MATCH (c:Course) RETURN c.id AS id, c.title AS title LIMIT 10"
            ).data()

            # Find first course with a valid id
            for c in courses:
                if _valid_id(c.get("id")):
                    cid = f"course:{c['id']}"
                    name = c.get("title") or c["id"]
                    return GraphData(
                        nodes=[GraphNode(id=cid, name=name, type="course")],
                        edges=[],
                    )

            # No valid course id — use the first course with a title
            for c in courses:
                if c.get("title"):
                    return GraphData(
                        nodes=[GraphNode(id="course:root", name=c["title"], type="course")],
                        edges=[],
                    )

            # Last resort: virtual root
            return GraphData(
                nodes=[GraphNode(id="course:root", name="深度学习", type="course")],
                edges=[],
            )

    except Exception as e:
        logger.error(f"Graph root query error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/knowledge/graph/entity", response_model=GraphData)
async def get_entity_graph(
    name: str = Query(..., description="Entity name to search (partial match)"),
    depth: int = Query(1, ge=1, le=2, description="Traversal depth"),
):
    """
    Query entity relationships from the knowledge graph.

    Returns the target entity, its outgoing relations (related concepts),
    and incoming relations (concepts that lead to this one).
    """
    driver = _get_driver()
    if driver is None:
        raise HTTPException(status_code=503, detail="Neo4j not available")

    nodes: Dict[str, GraphNode] = {}
    edges: List[GraphEdge] = []

    def add_node(nid: str, name: str, ntype: str, **kwargs):
        if nid not in nodes:
            nodes[nid] = GraphNode(id=nid, name=name, type=ntype, **kwargs)

    def add_edge(source: str, target: str, etype: str, **kwargs):
        if not any(e.source == source and e.target == target and e.type == etype for e in edges):
            edges.append(GraphEdge(source=source, target=target, type=etype, **kwargs))

    try:
        with driver.session(database=_get_db()) as session:
            # Find matching entities
            entities = session.run(
                """
                MATCH (e:Entity)
                WHERE toLower(e.name) CONTAINS toLower($name)
                RETURN e.name AS name, e.type AS etype, e.occurrence AS occurrence,
                       e.description AS description, e.chapters AS chapters
                LIMIT 5
                """,
                {"name": name},
            ).data()

            if not entities:
                return GraphData(nodes=[], edges=[])

            entity_names = [e["name"] for e in entities]
            for e in entities:
                eid = f"entity:{e['name']}"
                add_node(eid, e["name"], "entity",
                         occurrence=e.get("occurrence"), entity_type=e.get("etype"),
                         description=e.get("description"), chapters=e.get("chapters"))

            # Outgoing relations
            if depth == 1:
                outgoing = session.run(
                    """
                    MATCH (e1:Entity)
                    WHERE toLower(e1.name) CONTAINS toLower($name)
                    WITH e1 LIMIT 5
                    MATCH (e1)-[r:RELATES_TO]->(e2:Entity)
                    RETURN e1.name AS source, e2.name AS target,
                           e2.type AS target_type, e2.occurrence AS target_occ,
                           e2.description AS target_desc, e2.chapters AS target_chapters,
                           r.description AS rel_desc
                    ORDER BY e1.name, e2.name
                    LIMIT 80
                    """,
                    {"name": name},
                ).data()
            else:
                outgoing = session.run(
                    """
                    MATCH (e1:Entity)
                    WHERE toLower(e1.name) CONTAINS toLower($name)
                    WITH e1 LIMIT 3
                    MATCH path = (e1)-[:RELATES_TO*1..2]->(e2:Entity)
                    WHERE e1 <> e2
                    RETURN e1.name AS source, e2.name AS target,
                           e2.type AS target_type, e2.occurrence AS target_occ,
                           e2.description AS target_desc, e2.chapters AS target_chapters,
                           length(path) AS hops
                    ORDER BY hops, e2.name
                    LIMIT 120
                    """,
                    {"name": name},
                ).data()

            for r in outgoing:
                src_id = f"entity:{r['source']}"
                tgt_id = f"entity:{r['target']}"
                add_node(tgt_id, r["target"], "entity",
                         occurrence=r.get("target_occ"), entity_type=r.get("target_type"),
                         description=r.get("target_desc"), chapters=r.get("target_chapters"))
                add_edge(src_id, tgt_id, "RELATES_TO", description=r.get("rel_desc"))

            # Incoming relations
            incoming = session.run(
                """
                MATCH (e1:Entity)
                WHERE toLower(e1.name) CONTAINS toLower($name)
                WITH e1 LIMIT 5
                MATCH (e0:Entity)-[r:RELATES_TO]->(e1)
                RETURN e0.name AS source, e1.name AS target,
                       e0.type AS source_type, e0.occurrence AS source_occ,
                       e0.description AS source_desc, e0.chapters AS source_chapters,
                       r.description AS rel_desc
                ORDER BY e0.name
                LIMIT 50
                """,
                {"name": name},
            ).data()

            for r in incoming:
                src_id = f"entity:{r['source']}"
                tgt_id = f"entity:{r['target']}"
                add_node(src_id, r["source"], "entity",
                         occurrence=r.get("source_occ"), entity_type=r.get("source_type"),
                         description=r.get("source_desc"), chapters=r.get("source_chapters"))
                add_edge(src_id, tgt_id, "RELATES_TO", description=r.get("rel_desc"))

            # Locations (which chapter/section contains this entity)
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
                {"name": name},
            ).data()

            for loc in locations:
                if _valid_id(loc.get("ch_id")):
                    ch_id = f"chapter:{loc['ch_id']}"
                    add_node(ch_id, loc.get("ch_title") or loc["ch_id"], "chapter")
                if _valid_id(loc.get("sec_id")):
                    sec_id = f"section:{loc['sec_id']}"
                    add_node(sec_id, loc.get("sec_title") or loc["sec_id"], "section")
                    if _valid_id(loc.get("ch_id")):
                        add_edge(f"chapter:{loc['ch_id']}", sec_id, "HAS_SECTION")

    except Exception as e:
        logger.error(f"Entity graph query error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    return GraphData(nodes=list(nodes.values()), edges=edges)


@router.get("/knowledge/graph/course", response_model=GraphData)
async def get_course_graph():
    """
    Get the full course structure as a graph.

    Returns courses, chapters, and sections with CONTAINS/HAS_SECTION edges.
    """
    driver = _get_driver()
    if driver is None:
        raise HTTPException(status_code=503, detail="Neo4j not available")

    nodes: Dict[str, GraphNode] = {}
    edges: List[GraphEdge] = []

    try:
        with driver.session(database=_get_db()) as session:
            # Get courses
            courses = session.run(
                "MATCH (c:Course) RETURN c.id AS id, c.title AS title"
            ).data()

            for c in courses:
                if not _valid_id(c.get("id")):
                    continue
                cid = f"course:{c['id']}"
                nodes[cid] = GraphNode(id=cid, name=c.get("title") or c["id"], type="course")

            # Get chapters
            chapters = session.run(
                "MATCH (ch:Chapter) RETURN ch.id AS id, ch.title AS title"
            ).data()
            chapters.sort(key=lambda c: _chapter_sort_key(c["id"]))

            for ch in chapters:
                if not _valid_id(ch.get("id")):
                    continue
                chid = f"chapter:{ch['id']}"
                nodes[chid] = GraphNode(id=chid, name=ch.get("title") or ch["id"], type="chapter")

            # Get sections
            ch_ids = [c["id"] for c in chapters if _valid_id(c.get("id"))]
            if ch_ids:
                sections = session.run(
                    """
                    MATCH (ch:Chapter)-[:HAS_SECTION]->(s:Section)
                    WHERE ch.id IN $ids
                    RETURN ch.id AS chapter_id, s.id AS id, s.title AS title
                    ORDER BY s.id
                    """,
                    {"ids": ch_ids},
                ).data()

                for sec in sections:
                    if not _valid_id(sec.get("id")):
                        continue
                    sid = f"section:{sec['id']}"
                    nodes[sid] = GraphNode(id=sid, name=sec.get("title") or sec["id"], type="section")
                    if _valid_id(sec.get("chapter_id")):
                        edges.append(GraphEdge(
                            source=f"chapter:{sec['chapter_id']}",
                            target=sid,
                            type="HAS_SECTION",
                        ))

            # Course -> Chapter edges
            # Try explicit CONTAINS edges first
            contains_rels = session.run(
                """
                MATCH (c:Course)-[:CONTAINS]->(ch:Chapter)
                RETURN c.id AS course_id, ch.title AS course_title, ch.id AS chapter_id
                """
            ).data()

            valid_contains = [
                r for r in contains_rels
                if _valid_id(r.get("course_id")) and _valid_id(r.get("chapter_id"))
            ]

            if valid_contains:
                for rel in valid_contains:
                    edges.append(GraphEdge(
                        source=f"course:{rel['course_id']}",
                        target=f"chapter:{rel['chapter_id']}",
                        type="CONTAINS",
                    ))
            else:
                # No valid Course→Chapter edges — create a virtual root
                root_id = "course:root"
                root_name = "全部课程"
                # Pick name from first course that has a title
                titled = next((c for c in courses if c.get("title")), None)
                if titled:
                    root_name = titled["title"]
                nodes[root_id] = GraphNode(id=root_id, name=root_name, type="course")
                for ch in chapters:
                    if _valid_id(ch.get("id")):
                        edges.append(GraphEdge(
                            source=root_id,
                            target=f"chapter:{ch['id']}",
                            type="CONTAINS",
                        ))

    except Exception as e:
        logger.error(f"Course graph query error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    return GraphData(nodes=list(nodes.values()), edges=edges)


@router.get("/knowledge/graph/course/{course_id}/entities", response_model=GraphData)
async def get_course_entities(course_id: str):
    """
    Get entities and their relationships within a specific course.

    Returns entities that appear in the course chunks, plus RELATES_TO edges between them.
    """
    driver = _get_driver()
    if driver is None:
        raise HTTPException(status_code=503, detail="Neo4j not available")

    nodes: Dict[str, GraphNode] = {}
    edges: List[GraphEdge] = []

    try:
        with driver.session(database=_get_db()) as session:
            # Get entities that appear in this course's chunks
            entities = session.run(
                """
                MATCH (ch:Chapter)
                WHERE ch.id STARTS WITH $prefix OR ch.id = $course_id
                MATCH (ch)-[:HAS_SECTION]->(s:Section)-[:HAS_CHUNK]->(c:Chunk)
                MATCH (e:Entity)-[:APPEARS_IN]->(c)
                RETURN DISTINCT e.name AS name, e.type AS etype, e.occurrence AS occurrence,
                       e.description AS description, e.chapters AS chapters, count(*) AS freq
                ORDER BY freq DESC
                LIMIT 100
                """,
                {"prefix": course_id, "course_id": course_id},
            ).data()

            for e in entities:
                eid = f"entity:{e['name']}"
                nodes[eid] = GraphNode(id=eid, name=e["name"], type="entity",
                                       occurrence=e.get("occurrence"), entity_type=e.get("etype"),
                                       description=e.get("description"), chapters=e.get("chapters"))

            # Get relationships between these entities
            entity_names = [e["name"] for e in entities]
            if len(entity_names) >= 2:
                rels = session.run(
                    """
                    MATCH (e1:Entity)-[r:RELATES_TO]->(e2:Entity)
                    WHERE e1.name IN $names AND e2.name IN $names
                    RETURN e1.name AS source, e2.name AS target, r.description AS rel_desc
                    LIMIT 200
                    """,
                    {"names": entity_names},
                ).data()

                for r in rels:
                    edges.append(GraphEdge(
                        source=f"entity:{r['source']}",
                        target=f"entity:{r['target']}",
                        type="RELATES_TO",
                        description=r.get("rel_desc"),
                    ))

    except Exception as e:
        logger.error(f"Course entities query error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    return GraphData(nodes=list(nodes.values()), edges=edges)


@router.get("/knowledge/graph/children", response_model=GraphData)
async def get_node_children(
    node_type: str = Query(..., description="Node type: course, chapter, section, entity"),
    node_id: str = Query(..., description="Full node id, e.g. chapter:ch1"),
):
    """
    Get direct children of a node for lazy-expand interaction.

    - course  → chapters
    - chapter → sections
    - entity  → related entities
    - section → (no children)
    """
    driver = _get_driver()
    if driver is None:
        raise HTTPException(status_code=503, detail="Neo4j not available")

    # Extract the original id (after the first colon)
    original_id = node_id.split(":", 1)[1] if ":" in node_id else node_id

    nodes_list: List[GraphNode] = []
    edges_list: List[GraphEdge] = []

    try:
        with driver.session(database=_get_db()) as session:

            if node_type == "course":
                # Return all chapters with child_count
                chapters = session.run(
                    "MATCH (ch:Chapter) RETURN ch.id AS id, ch.title AS title ORDER BY ch.id"
                ).data()
                for ch in chapters:
                    if not _valid_id(ch.get("id")):
                        continue
                    # Count sections under this chapter
                    count_result = session.run(
                        "MATCH (ch:Chapter {id: $id})-[:HAS_SECTION]->(s:Section) RETURN count(s) AS cnt",
                        {"id": ch["id"]},
                    ).data()
                    child_count = count_result[0]["cnt"] if count_result else 0
                    chid = f"chapter:{ch['id']}"
                    nodes_list.append(GraphNode(id=chid, name=ch.get("title") or ch["id"],
                                                type="chapter", child_count=child_count))
                    edges_list.append(GraphEdge(source=node_id, target=chid, type="CONTAINS"))

            elif node_type == "chapter":
                # Return sections under this chapter
                if _valid_id(original_id):
                    sections = session.run(
                        """
                        MATCH (ch:Chapter)-[:HAS_SECTION]->(s:Section)
                        WHERE ch.id = $id
                        RETURN s.id AS id, s.title AS title ORDER BY s.id
                        """,
                        {"id": original_id},
                    ).data()
                    for sec in sections:
                        if not _valid_id(sec.get("id")):
                            continue
                        sid = f"section:{sec['id']}"
                        nodes_list.append(GraphNode(id=sid, name=sec.get("title") or sec["id"],
                                                    type="section", section_id=sec["id"]))
                        edges_list.append(GraphEdge(source=node_id, target=sid, type="HAS_SECTION"))

            elif node_type == "section":
                # Return entities that appear in this section's chunks
                if _valid_id(original_id):
                    entities = session.run(
                        """
                        MATCH (s:Section)-[:HAS_CHUNK]->(c:Chunk)
                        WHERE s.id = $id
                        MATCH (e:Entity)-[r:APPEARS_IN]->(c)
                        RETURN DISTINCT e.name AS name, e.type AS etype, e.occurrence AS occurrence,
                               e.description AS description, e.chapters AS chapters,
                               r.description AS rel_desc, r.chunk_id AS chunk_id
                        ORDER BY e.name LIMIT 30
                        """,
                        {"id": original_id},
                    ).data()
                    for r in entities:
                        eid = f"entity:{r['name']}"
                        nodes_list.append(GraphNode(id=eid, name=r["name"], type="entity",
                                                    occurrence=r.get("occurrence"), entity_type=r.get("etype"),
                                                    description=r.get("description"), chapters=r.get("chapters")))
                        edges_list.append(GraphEdge(source=node_id, target=eid, type="APPEARS_IN",
                                                    description=r.get("rel_desc"), chunk_id=r.get("chunk_id")))

            elif node_type == "entity":
                # Return related entities
                if _valid_id(original_id):
                    rels = session.run(
                        """
                        MATCH (e1:Entity)-[r:RELATES_TO]->(e2:Entity)
                        WHERE e1.name = $name
                        RETURN e2.name AS name, e2.type AS etype, e2.occurrence AS occurrence,
                               e2.description AS description, e2.chapters AS chapters,
                               r.description AS rel_desc
                        ORDER BY e2.name LIMIT 30
                        """,
                        {"name": original_id},
                    ).data()
                    for r in rels:
                        eid = f"entity:{r['name']}"
                        nodes_list.append(GraphNode(id=eid, name=r["name"], type="entity",
                                                    occurrence=r.get("occurrence"), entity_type=r.get("etype"),
                                                    description=r.get("description"), chapters=r.get("chapters")))
                        edges_list.append(GraphEdge(source=node_id, target=eid, type="RELATES_TO",
                                                    description=r.get("rel_desc")))

    except Exception as e:
        logger.error(f"Children query error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    return GraphData(nodes=nodes_list, edges=edges_list)


# ── Traceback: shortest path from Course root to target entity ──

class TracebackNode(BaseModel):
    id: str
    label: str
    style: Optional[Dict] = None
    # Enriched properties (optional)
    node_type: Optional[str] = None      # "entity" | "section" | "chapter" | "course"
    entity_type: Optional[str] = None    # entity semantic type (e.g. "概念")
    description: Optional[str] = None
    occurrence: Optional[int] = None
    chapters: Optional[str] = None

class TracebackEdge(BaseModel):
    source: str
    target: str
    label: str
    style: Optional[Dict] = None
    description: Optional[str] = None

class TracebackData(BaseModel):
    nodes: List[TracebackNode]
    edges: List[TracebackEdge]


@router.get("/knowledge/graph/traceback", response_model=TracebackData)
async def graph_traceback(
    target_concept: str = Query(..., description="Target node name to trace back"),
    node_type: str = Query("entity", description="Node type: entity, section, chapter, course"),
):
    """
    Trace back from a node to Course root.
    node_type determines which label to search against.
    """
    driver = _get_driver()
    if driver is None:
        raise HTTPException(status_code=503, detail="Neo4j not available")

    nodes_map: Dict[str, TracebackNode] = {}
    edges_list: List[TracebackEdge] = []

    def add_node(nid: str, label: str, highlight: bool = False, *,
                 node_type: str = None, entity_type: str = None,
                 description: str = None, occurrence: int = None, chapters: str = None):
        if nid not in nodes_map:
            style = None
            if highlight:
                style = {"fill": "#1677FF", "stroke": "#1677FF", "lineWidth": 2}
            nodes_map[nid] = TracebackNode(
                id=nid, label=label, style=style,
                node_type=node_type, entity_type=entity_type,
                description=description, occurrence=occurrence, chapters=chapters,
            )

    def add_edge(source: str, target: str, label: str, highlight: bool = False, description: str = None):
        if not any(e.source == source and e.target == target for e in edges_list):
            style = None
            if highlight:
                style = {"stroke": "#1677FF", "lineWidth": 3, "endArrow": True, "endArrowFill": "#1677FF"}
            edges_list.append(TracebackEdge(source=source, target=target, label=label, style=style, description=description))

    try:
        with driver.session(database=_get_db()) as session:
            if node_type == "entity":
                # ── Entity: trace back to Course, add RELATES_TO ──
                paths = session.run(
                    """
                    MATCH (e:Entity {name: $concept})-[:APPEARS_IN]->(ch:Chunk)
                    MATCH (s:Section)-[:HAS_CHUNK]->(ch)
                    MATCH (ch2:Chapter)-[:HAS_SECTION]->(s)
                    MATCH (c:Course)-[:CONTAINS]->(ch2)
                    RETURN coalesce(e.name, e.id) AS entity_name, coalesce(e.id, e.name) AS entity_id,
                           e.type AS entity_type, e.description AS entity_desc, e.occurrence AS entity_occ, e.chapters AS entity_chapters,
                           coalesce(c.title, c.name, c.id) AS course_name, coalesce(c.id, c.name) AS course_id,
                           coalesce(ch2.title, ch2.name, ch2.id) AS chapter_name, coalesce(ch2.id, ch2.name) AS chapter_id,
                           coalesce(s.title, s.name, s.id) AS section_name, coalesce(s.id, s.name) AS section_id
                    """,
                    {"concept": target_concept},
                ).data()

                # Track the actual entity key and name (may differ from target_concept due to case)
                entity_key = None
                entity_actual_name = target_concept

                if paths:
                    for path in paths:
                        add_node(f"course:{path['course_id']}", path["course_name"], node_type="course")
                        add_node(f"chapter:{path['chapter_id']}", path["chapter_name"], node_type="chapter")
                        add_node(f"section:{path['section_id']}", path["section_name"], node_type="section")
                        entity_key = f"entity:{path['entity_id']}"
                        entity_actual_name = path["entity_name"]
                        add_node(
                            entity_key, entity_actual_name, highlight=True,
                            node_type="entity", entity_type=path.get("entity_type"),
                            description=path.get("entity_desc"), occurrence=path.get("entity_occ"),
                            chapters=path.get("entity_chapters"),
                        )
                        add_edge("course:" + path["course_id"], "chapter:" + path["chapter_id"], "CONTAINS", highlight=True)
                        add_edge("chapter:" + path["chapter_id"], "section:" + path["section_id"], "HAS_SECTION", highlight=True)
                        add_edge("section:" + path["section_id"], entity_key, "APPEARS_IN", highlight=True)
                else:
                    # Entity exists but no path to course — query its properties directly
                    ent_data = session.run(
                        "MATCH (e:Entity {name: $name}) RETURN e.id AS id, e.type AS t, e.description AS d, e.occurrence AS o, e.chapters AS ch",
                        {"name": target_concept},
                    ).data()
                    if ent_data:
                        e = ent_data[0]
                        entity_key = f"entity:{e['id'] or target_concept}"
                        add_node(entity_key, target_concept, highlight=True,
                                 node_type="entity", entity_type=e.get("t"), description=e.get("d"),
                                 occurrence=e.get("o"), chapters=e.get("ch"))

                # RELATES_TO for target entity (use actual name from DB to ensure match)
                if entity_key:
                    related = session.run(
                        """
                        MATCH (e:Entity {name: $name})-[r:RELATES_TO]-(e2:Entity)
                        RETURN e2.name AS name, e2.type AS type, e2.description AS desc, e2.occurrence AS occ, e2.chapters AS ch,
                               r.description AS rel_desc
                        LIMIT 10
                        """,
                        {"name": entity_actual_name},
                    ).data()
                    for r in related:
                        rel_key = f"entity:{r['name']}"
                        add_node(rel_key, r["name"], node_type="entity", entity_type=r.get("type"),
                                 description=r.get("desc"), occurrence=r.get("occ"), chapters=r.get("ch"))
                        add_edge(entity_key, rel_key, "RELATES_TO", description=r.get("rel_desc"))

            elif node_type == "section":
                # ── Section: trace back to Course, show entities ──
                paths = session.run(
                    """
                    MATCH (s:Section) WHERE s.title = $name OR s.name = $name
                    MATCH (ch:Chapter)-[:HAS_SECTION]->(s)
                    MATCH (c:Course)-[:CONTAINS]->(ch)
                    RETURN coalesce(s.title, s.name, s.id) AS section_name, coalesce(s.id, s.name) AS section_id,
                           coalesce(ch.title, ch.name, ch.id) AS chapter_name, coalesce(ch.id, ch.name) AS chapter_id,
                           coalesce(c.title, c.name, c.id) AS course_name, coalesce(c.id, c.name) AS course_id
                    """,
                    {"name": target_concept},
                ).data()

                if paths:
                    for path in paths:
                        add_node(f"course:{path['course_id']}", path["course_name"], node_type="course")
                        add_node(f"chapter:{path['chapter_id']}", path["chapter_name"], node_type="chapter")
                        add_node(f"section:{path['section_id']}", path["section_name"], highlight=True, node_type="section")
                        add_edge("course:" + path["course_id"], "chapter:" + path["chapter_id"], "CONTAINS", highlight=True)
                        add_edge("chapter:" + path["chapter_id"], "section:" + path["section_id"], "HAS_SECTION", highlight=True)

                # Show entities in this section
                entities = session.run(
                    """
                    MATCH (s:Section) WHERE s.title = $name OR s.name = $name
                    MATCH (s)-[:HAS_CHUNK]->(ch:Chunk)<-[:APPEARS_IN]-(e:Entity)
                    RETURN DISTINCT e.name AS name, e.type AS type, e.description AS desc, e.occurrence AS occ, e.chapters AS ch
                    LIMIT 20
                    """,
                    {"name": target_concept},
                ).data()
                section_key = f"section:{paths[0]['section_id']}" if paths else None
                for ent in entities:
                    ent_key = f"entity:{ent['name']}"
                    add_node(ent_key, ent["name"], node_type="entity", entity_type=ent.get("type"),
                             description=ent.get("desc"), occurrence=ent.get("occ"), chapters=ent.get("ch"))
                    if section_key:
                        add_edge(section_key, ent_key, "APPEARS_IN")

            elif node_type == "chapter":
                # ── Chapter: trace back to Course, show sections ──
                paths = session.run(
                    """
                    MATCH (ch:Chapter) WHERE ch.title = $name OR ch.name = $name
                    MATCH (c:Course)-[:CONTAINS]->(ch)
                    RETURN coalesce(ch.title, ch.name, ch.id) AS chapter_name, coalesce(ch.id, ch.name) AS chapter_id,
                           coalesce(c.title, c.name, c.id) AS course_name, coalesce(c.id, c.name) AS course_id
                    """,
                    {"name": target_concept},
                ).data()

                if paths:
                    for path in paths:
                        add_node(f"course:{path['course_id']}", path["course_name"], node_type="course")
                        add_node(f"chapter:{path['chapter_id']}", path["chapter_name"], highlight=True, node_type="chapter")
                        add_edge("course:" + path["course_id"], "chapter:" + path["chapter_id"], "CONTAINS", highlight=True)

                # Show sections in this chapter
                sections = session.run(
                    """
                    MATCH (ch:Chapter) WHERE ch.title = $name OR ch.name = $name
                    MATCH (ch)-[:HAS_SECTION]->(s:Section)
                    RETURN coalesce(s.title, s.name, s.id) AS name, coalesce(s.id, s.name) AS id
                    """,
                    {"name": target_concept},
                ).data()
                chapter_key = f"chapter:{paths[0]['chapter_id']}" if paths else None
                for sec in sections:
                    sec_key = f"section:{sec['id']}"
                    add_node(sec_key, sec["name"], node_type="section")
                    if chapter_key:
                        add_edge(chapter_key, sec_key, "HAS_SECTION")

            elif node_type == "course":
                # ── Course: show chapters ──
                course = session.run(
                    """
                    MATCH (c:Course) WHERE c.title = $name OR c.name = $name
                    RETURN coalesce(c.title, c.name, c.id) AS name, coalesce(c.id, c.name) AS id
                    """,
                    {"name": target_concept},
                ).data()

                if course:
                    c = course[0]
                    course_key = f"course:{c['id']}"
                    add_node(course_key, c["name"], highlight=True, node_type="course")

                    chapters = session.run(
                        """
                        MATCH (c:Course) WHERE c.title = $name OR c.name = $name
                        MATCH (c)-[:CONTAINS]->(ch:Chapter)
                        RETURN coalesce(ch.title, ch.name, ch.id) AS name, coalesce(ch.id, ch.name) AS id
                        """,
                        {"name": target_concept},
                    ).data()
                    for ch in chapters:
                        ch_key = f"chapter:{ch['id']}"
                        add_node(ch_key, ch["name"], node_type="chapter")
                        add_edge(course_key, ch_key, "CONTAINS")
            else:
                # No match found
                return TracebackData(nodes=[], edges=[])

    except Exception as e:
        logger.error(f"Traceback query error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    return TracebackData(nodes=list(nodes_map.values()), edges=edges_list)
