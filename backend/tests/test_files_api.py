"""测试文件 API 的用户隔离功能"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import (
    get_user_workspace_dir,
    get_knowledge_dir,
)
from api.files import resolve_path


def test_resolve_path_user_isolation():
    """测试路径解析的用户隔离"""
    print("=" * 60)
    print("测试路径解析 - 用户隔离")
    print("=" * 60)

    # 测试用户1
    user1_workspace = resolve_path("workspace", 1)
    user1_workspace_file = resolve_path("workspace/test.md", 1)

    print(f"\n用户1:")
    print(f"  workspace -> {user1_workspace}")
    print(f"  workspace/test.md -> {user1_workspace_file}")

    # 测试用户2
    user2_workspace = resolve_path("workspace", 2)
    user2_workspace_file = resolve_path("workspace/test.md", 2)

    print(f"\n用户2:")
    print(f"  workspace -> {user2_workspace}")
    print(f"  workspace/test.md -> {user2_workspace_file}")

    # 验证用户隔离
    assert user1_workspace != user2_workspace, "用户1和用户2应该有不同的workspace"
    assert "users/1" in str(user1_workspace) or "users\\1" in str(user1_workspace)
    assert "users/2" in str(user2_workspace) or "users\\2" in str(user2_workspace)

    print("\n[PASS] 用户workspace正确隔离")


def test_resolve_path_shared_resources():
    """测试共享资源路径解析"""
    print("\n" + "=" * 60)
    print("测试路径解析 - 共享资源")
    print("=" * 60)

    # 测试共享资源 - 所有用户应该访问相同路径
    user1_knowledge = resolve_path("knowledge/source", 1)
    user2_knowledge = resolve_path("knowledge/source", 2)
    user3_knowledge = resolve_path("knowledge/source", 3)

    print(f"\n共享资源 knowledge/source:")
    print(f"  用户1 -> {user1_knowledge}")
    print(f"  用户2 -> {user2_knowledge}")
    print(f"  用户3 -> {user3_knowledge}")

    # 验证所有用户访问相同的共享资源
    assert user1_knowledge == user2_knowledge == user3_knowledge, \
        "所有用户应该访问相同的knowledge/source"

    # 验证路径不包含用户ID
    assert "users" not in str(user1_knowledge), "共享资源不应包含用户目录"

    print("\n[PASS] 共享资源路径正确")


def test_resolve_path_subdirectories():
    """测试子目录路径解析"""
    print("\n" + "=" * 60)
    print("测试路径解析 - 子目录")
    print("=" * 60)

    user_id = 1

    # 测试workspace子目录
    workspace_subdir = resolve_path("workspace/lectures", user_id)
    workspace_file = resolve_path("workspace/lectures/python.md", user_id)

    print(f"\n用户{user_id} workspace子目录:")
    print(f"  workspace/lectures -> {workspace_subdir}")
    print(f"  workspace/lectures/python.md -> {workspace_file}")

    # 测试knowledge子目录
    knowledge_subdir = resolve_path("knowledge/source/courses", user_id)
    knowledge_file = resolve_path("knowledge/source/courses/intro.md", user_id)

    print(f"\n共享资源子目录:")
    print(f"  knowledge/source/courses -> {knowledge_subdir}")
    print(f"  knowledge/source/courses/intro.md -> {knowledge_file}")

    # 验证路径正确
    assert "users/1" in str(workspace_subdir) or "users\\1" in str(workspace_subdir)
    assert "lectures" in str(workspace_subdir)
    assert "users" not in str(knowledge_subdir)
    assert "courses" in str(knowledge_subdir)

    print("\n[PASS] 子目录路径解析正确")


def test_resource_library_paths():
    """测试资源库应该显示的路径"""
    print("\n" + "=" * 60)
    print("测试资源库路径")
    print("=" * 60)

    user_id = 1

    # 资源库应该显示的两个根目录
    roots = [
        ("knowledge/source", "共享资源"),
        ("workspace", "我的工作区"),
    ]

    print(f"\n资源库根目录 (用户{user_id}):")
    for path, label in roots:
        resolved = resolve_path(path, user_id)
        print(f"  {label:12} ({path:20}) -> {resolved}")

        # 验证路径存在性
        if resolved.exists():
            print(f"    [存在] 包含 {len(list(resolved.iterdir()))} 个项目")
        else:
            print(f"    [不存在] 需要创建")

    # 验证workspace是用户专属的
    workspace_path = resolve_path("workspace", user_id)
    assert "users/1" in str(workspace_path) or "users\\1" in str(workspace_path), \
        "workspace应该是用户专属的"

    # 验证knowledge/source是共享的
    knowledge_path = resolve_path("knowledge/source", user_id)
    assert "users" not in str(knowledge_path), \
        "knowledge/source应该是共享的"

    print("\n[PASS] 资源库路径配置正确")


if __name__ == "__main__":
    try:
        test_resolve_path_user_isolation()
        test_resolve_path_shared_resources()
        test_resolve_path_subdirectories()
        test_resource_library_paths()

        print("\n" + "=" * 60)
        print("[PASS] 所有测试通过!")
        print("=" * 60)
    except AssertionError as e:
        print(f"\n[FAIL] 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] 意外错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
