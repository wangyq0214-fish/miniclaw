#!/usr/bin/env python3
"""
Test script for knowledge.py - validates hybrid search implementation.

Verification checklist (from plan):
  1. tool._run() returns results without error
  2. source_type: vector appears in output (vector search active)
  3. source_type: entity_relation appears in output (relation traversal active)
  4. Breadcrumbs (course > chapter > section) are correctly populated
"""
import sys
import os
import logging

# Add backend directory to path so config/tools can be imported
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(levelname)s [%(name)s] %(message)s"
)
logger = logging.getLogger("test_knowledge")


def run_tests():
    print("=" * 60)
    print("knowledge.py 混合检索测试")
    print("=" * 60)

    # ----------------------------------------------------------------
    # 1. 导入检查
    # ----------------------------------------------------------------
    print("\n[1] 导入模块...")
    try:
        from tools.knowledge import create_knowledge_search_tool, _get_embedding
        from config import settings
        print(f"  ✓ 导入成功")
        print(f"  embedding_direct_url  : {settings.embedding_direct_url}")
        print(f"  embedding_direct_model: {settings.embedding_direct_model}")
        print(f"  embedding_max_retries : {settings.embedding_max_retries}")
        print(f"  neo4j_uri             : {settings.neo4j_uri}")
        print(f"  neo4j_fulltext_index  : {settings.neo4j_fulltext_index}")
        print(f"  neo4j_vector_index    : {settings.neo4j_vector_index}")
    except Exception as e:
        print(f"  ✗ 导入失败: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)

    # ----------------------------------------------------------------
    # 2. Embedding 服务连通性测试
    # ----------------------------------------------------------------
    print("\n[2] 测试 embedding 服务...")
    try:
        vec = _get_embedding("卷积神经网络")
        if vec and len(vec) > 0:
            print(f"  ✓ Embedding 生成成功，维度: {len(vec)}")
        else:
            print(f"  ✗ Embedding 返回空向量")
    except Exception as e:
        print(f"  ✗ Embedding 异常: {e}")

    # ----------------------------------------------------------------
    # 3. 创建工具 & Neo4j 连通性
    # ----------------------------------------------------------------
    print("\n[3] 创建 knowledge search tool 并连接 Neo4j...")
    try:
        tool = create_knowledge_search_tool()
        driver = tool.__dict__.get("_driver")
        if driver:
            print(f"  ✓ Neo4j 连接成功")
            print(f"  embedding_enabled: {tool.embedding_enabled}")
        else:
            print(f"  ✗ Neo4j 连接失败，后续检索将跳过数据库查询")
    except Exception as e:
        print(f"  ✗ 工具创建失败: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)

    # ----------------------------------------------------------------
    # 4. 各子检索方法单独测试
    # ----------------------------------------------------------------
    queries = ["卷积神经网络", "激活函数", "梯度下降"]
    TOP_K = 5

    for query in queries:
        print(f"\n{'=' * 60}")
        print(f"查询: '{query}'  top_k={TOP_K}")
        print('=' * 60)

        # fulltext
        print("\n  -- fulltext_search --")
        try:
            ft = tool._fulltext_search(query, TOP_K)
            print(f"  结果数: {len(ft)}")
            for r in ft[:2]:
                print(f"    id={r.get('id')} score={r.get('score',0):.3f} source={r.get('source_type')}")
        except Exception as e:
            print(f"  ERROR: {e}")

        # contains fallback
        print("\n  -- contains_search (fallback) --")
        try:
            cs = tool._contains_search(query, TOP_K)
            print(f"  结果数: {len(cs)}")
        except Exception as e:
            print(f"  ERROR: {e}")

        # entity
        print("\n  -- entity_search --")
        try:
            es = tool._entity_search(query, TOP_K)
            print(f"  结果数: {len(es)}")
            for r in es[:2]:
                print(f"    id={r.get('id')} entity={r.get('entity_name')} source={r.get('source_type')}")
        except Exception as e:
            print(f"  ERROR: {e}")

        # entity relation
        print("\n  -- entity_relation_search --")
        try:
            er = tool._entity_relation_search(query, TOP_K)
            print(f"  结果数: {len(er)}")
            for r in er[:2]:
                print(f"    id={r.get('id')} entity={r.get('entity_name')} source={r.get('source_type')}")
        except Exception as e:
            print(f"  ERROR: {e}")

        # vector
        print("\n  -- vector_search --")
        try:
            vs = tool._vector_search(query, TOP_K)
            print(f"  结果数: {len(vs)}")
            for r in vs[:2]:
                print(f"    id={r.get('id')} score={r.get('score',0):.4f} source={r.get('source_type')}")
        except Exception as e:
            print(f"  ERROR: {e}")

    # ----------------------------------------------------------------
    # 5. 完整 _run() 端到端测试 + 验证计划要求的三项指标
    # ----------------------------------------------------------------
    print(f"\n{'=' * 60}")
    print("完整 _run() 端到端验证")
    print('=' * 60)

    check_query = "卷积神经网络"
    print(f"\n调用 tool._run('{check_query}', top_k=5) ...")
    result = tool._run(check_query, top_k=5)
    print("\n--- 输出 ---")
    print(result)

    # 验证三项指标
    print("\n--- 验证计划要求 ---")
    ok_vector = "vector" in result
    ok_entity_rel = "entity_relation" in result
    ok_breadcrumb = " > " in result  # 至少一条 breadcrumb

    print(f"  [{'✓' if ok_vector else '✗'}] source_type: vector 出现在结果中")
    print(f"  [{'✓' if ok_entity_rel else '✗'}] source_type: entity_relation 出现在结果中")
    print(f"  [{'✓' if ok_breadcrumb else '✗'}] breadcrumb (A > B > C) 格式出现在结果中")

    all_pass = ok_vector and ok_entity_rel and ok_breadcrumb
    print(f"\n{'✓ 全部验证通过！' if all_pass else '✗ 部分验证未通过，请检查以上输出'}")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(run_tests())
