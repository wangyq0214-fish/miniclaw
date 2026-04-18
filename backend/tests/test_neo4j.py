"""
Neo4j 连接与查询测试

用法:
    cd backend
    venv/Scripts/python.exe tests/test_neo4j.py

会依次测试：
  1. 驱动连接 (verify_connectivity)
  2. 查询数据库 schema (labels + relationship types)
  3. 取几个 Chunk 样本，确认 content 属性存在
  4. 按关键词搜索 Chunk (CONTAINS)
  5. 检查全文索引是否存在
  6. 调用 Neo4jKnowledgeTool._run() 端到端测试
"""
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
os.chdir(Path(__file__).parent.parent)  # so .env is found

from dotenv import load_dotenv
load_dotenv()

from config import settings

URI      = settings.neo4j_uri
USER     = settings.neo4j_user
PASSWORD = settings.neo4j_password
DATABASE = settings.neo4j_database

print(f"=== Neo4j Connection Test ===")
print(f"URI      : {URI}")
print(f"User     : {USER}")
print(f"Database : {DATABASE}")
print()

# --------------------------------------------------------------------------
# 1. 连接
# --------------------------------------------------------------------------
try:
    from neo4j import GraphDatabase
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    driver.verify_connectivity()
    print("[PASS] 1. Connection OK")
except Exception as e:
    print(f"[FAIL] 1. Connection FAILED: {e}")
    sys.exit(1)

# --------------------------------------------------------------------------
# 2. Schema 探查
# --------------------------------------------------------------------------
with driver.session(database=DATABASE) as session:
    labels = [r["label"] for r in session.run("CALL db.labels() YIELD label RETURN label").data()]
    rel_types = [r["relationshipType"] for r in
                 session.run("CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType").data()]
    print(f"[INFO] 2. Node labels   : {labels}")
    print(f"[INFO]    Rel types     : {rel_types}")
    print()

# --------------------------------------------------------------------------
# 3. Chunk 样本
# --------------------------------------------------------------------------
with driver.session(database=DATABASE) as session:
    chunks = session.run(
        "MATCH (n:Chunk) RETURN n LIMIT 3"
    ).data()
    if chunks:
        sample = dict(chunks[0]["n"])
        print(f"[INFO] 3. Chunk keys    : {list(sample.keys())}")
        content_key = "content" if "content" in sample else ("text" if "text" in sample else None)
        print(f"[INFO]    Content field : {content_key}")
        if content_key:
            print(f"[INFO]    Sample text  : {str(sample[content_key])[:120]}...")
    else:
        print("[WARN] 3. No Chunk nodes found!")
    print()

# --------------------------------------------------------------------------
# 4. CONTAINS 关键词搜索
# --------------------------------------------------------------------------
TEST_QUERY = "导数"
with driver.session(database=DATABASE) as session:
    hits = session.run(
        """
        MATCH (n:Chunk)
        WHERE toLower(n.content) CONTAINS toLower($q)
        RETURN n.id AS id, left(n.content, 80) AS snippet
        LIMIT 3
        """,
        q=TEST_QUERY,
    ).data()
    if hits:
        print(f"[PASS] 4. CONTAINS search '{TEST_QUERY}': {len(hits)} hit(s)")
        for h in hits:
            print(f"         id={h['id']}  snippet={h['snippet']!r}")
    else:
        print(f"[WARN] 4. CONTAINS search '{TEST_QUERY}': no results (try a different keyword)")
    print()

# --------------------------------------------------------------------------
# 5. 全文索引检查
# --------------------------------------------------------------------------
with driver.session(database=DATABASE) as session:
    indexes = session.run(
        "SHOW INDEXES YIELD name, type, state WHERE type = 'FULLTEXT' RETURN name, state"
    ).data()
    if indexes:
        print(f"[INFO] 5. Fulltext indexes: {indexes}")
    else:
        print(f"[WARN] 5. No fulltext index found. Tool will fall back to CONTAINS search.")
        print(f"          To create one:")
        print(f"          CREATE FULLTEXT INDEX chunkFullTextIndex FOR (n:Chunk) ON EACH [n.content]")
    print()

driver.close()

# --------------------------------------------------------------------------
# 6. Neo4jKnowledgeTool 端到端
# --------------------------------------------------------------------------
print("=== Tool End-to-End Test ===")
from tools.knowledge import Neo4jKnowledgeTool

tool = Neo4jKnowledgeTool()
result = tool._run(TEST_QUERY, top_k=3)
print(result)
print()

# --------------------------------------------------------------------------
# 7. 全文索引 raw 查询（不过滤 label）
# --------------------------------------------------------------------------
print("=== Raw Fulltext Index Query (no label filter) ===")
driver2 = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
with driver2.session(database=DATABASE) as session:
    # Print exact index definition
    idx_detail = session.run(
        "SHOW INDEXES YIELD name, type, labelsOrTypes, properties, state RETURN *"
    ).data()
    print(f"  All indexes:")
    for idx in idx_detail:
        print(f"    {idx}")

    # Try raw fulltext query with no filters
    raw = session.run(
        """
        CALL db.index.fulltext.queryNodes('chunkFullTextIndex', $q)
        YIELD node, score
        RETURN labels(node) AS labels, score, keys(node) AS props, left(node.content, 60) AS snippet
        LIMIT 5
        """,
        q=TEST_QUERY,
    ).data()
    print(f"\n  Fulltext query results for '{TEST_QUERY}':")
    if raw:
        for r in raw:
            print(f"    labels={r['labels']}  score={r['score']:.3f}  snippet={r['snippet']!r}")
    else:
        print("    (no results — index may cover different property or label)")

    # Try with the actual property name variations
    for prop in ["content", "text", "body", "description"]:
        count = session.run(
            f"MATCH (n:Chunk) WHERE n.`{prop}` IS NOT NULL RETURN count(n) AS c"
        ).single()["c"]
        if count > 0:
            print(f"\n  Chunk.{prop} exists: {count} nodes")

driver2.close()
print()
print("=== All tests done ===")
