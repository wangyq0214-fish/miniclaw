"""Simple test for path configuration without backend dependencies."""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    get_user_memory_dir,
    get_user_workspace_dir,
    get_user_sessions_dir,
    get_skills_dir,
    get_workspace_dir,
    get_knowledge_dir,
)


def test_user_specific_paths():
    """Test that user-specific paths are correctly resolved."""
    print("=" * 60)
    print("Testing User-Specific Path Resolution")
    print("=" * 60)

    for user_id in [1, 2, 3]:
        print(f"\nUser {user_id}:")
        memory_dir = get_user_memory_dir(user_id)
        workspace_dir = get_user_workspace_dir(user_id)
        sessions_dir = get_user_sessions_dir(user_id)

        print(f"  Memory:    {memory_dir}")
        print(f"  Workspace: {workspace_dir}")
        print(f"  Sessions:  {sessions_dir}")

        # Verify paths contain user_id
        assert f"users/{user_id}" in str(memory_dir) or f"users\\{user_id}" in str(memory_dir), \
            f"Memory path should contain user_id {user_id}"
        assert f"users/{user_id}" in str(workspace_dir) or f"users\\{user_id}" in str(workspace_dir), \
            f"Workspace path should contain user_id {user_id}"
        assert f"users/{user_id}" in str(sessions_dir) or f"users\\{user_id}" in str(sessions_dir), \
            f"Sessions path should contain user_id {user_id}"


def test_shared_paths():
    """Test that shared resource paths are correctly resolved."""
    print("\n" + "=" * 60)
    print("Testing Shared Resource Paths")
    print("=" * 60)

    skills_dir = get_skills_dir()
    workspace_dir = get_workspace_dir()
    knowledge_dir = get_knowledge_dir()

    print(f"\nShared Resources:")
    print(f"  Skills:    {skills_dir}")
    print(f"  Workspace: {workspace_dir}")
    print(f"  Knowledge: {knowledge_dir}")

    # Verify shared paths do NOT contain user-specific directories
    assert "users" not in str(skills_dir), "Skills should be shared (not user-specific)"
    assert "users" not in str(workspace_dir), "Workspace should be shared (not user-specific)"
    assert "users" not in str(knowledge_dir), "Knowledge should be shared (not user-specific)"


def test_user_isolation():
    """Test that different users get different paths."""
    print("\n" + "=" * 60)
    print("Testing User Isolation")
    print("=" * 60)

    user1_memory = get_user_memory_dir(1)
    user2_memory = get_user_memory_dir(2)
    user3_memory = get_user_memory_dir(3)

    print(f"\nUser memory directories:")
    print(f"  User 1: {user1_memory}")
    print(f"  User 2: {user2_memory}")
    print(f"  User 3: {user3_memory}")

    # Verify each user has a different path
    assert user1_memory != user2_memory, "User 1 and User 2 should have different memory dirs"
    assert user2_memory != user3_memory, "User 2 and User 3 should have different memory dirs"
    assert user1_memory != user3_memory, "User 1 and User 3 should have different memory dirs"

    print("\n[PASS] All users have isolated directories")


def test_path_structure():
    """Test the expected directory structure."""
    print("\n" + "=" * 60)
    print("Testing Path Structure")
    print("=" * 60)

    user_id = 1

    # Check if directories exist or can be created
    memory_dir = get_user_memory_dir(user_id)
    workspace_dir = get_user_workspace_dir(user_id)

    print(f"\nChecking directory structure for user {user_id}:")
    print(f"  Memory dir exists:    {memory_dir.exists()}")
    print(f"  Workspace dir exists: {workspace_dir.exists()}")

    # Check shared resources
    skills_dir = get_skills_dir()
    roles_dir = get_workspace_dir() / "roles"

    print(f"\nChecking shared resources:")
    print(f"  Skills dir exists:    {skills_dir.exists()}")
    print(f"  Roles dir exists:     {roles_dir.exists()}")

    if roles_dir.exists():
        roles = list(roles_dir.glob("*.md"))
        print(f"  Found {len(roles)} role files:")
        for role in roles:
            print(f"    - {role.name}")


def test_path_mapping_structure():
    """Test the structure of path mappings."""
    print("\n" + "=" * 60)
    print("Testing Path Mapping Structure")
    print("=" * 60)

    user_id = 1

    # Build the expected path mappings
    path_mappings = {
        "/memory/": get_user_memory_dir(user_id),
        "/workspace/": get_user_workspace_dir(user_id),
        "/skills/": get_skills_dir(),
        "/roles/": get_workspace_dir() / "roles",
        "/knowledge/": get_knowledge_dir(),
    }

    print(f"\nExpected path mappings for user {user_id}:")
    for virt_path, phys_path in path_mappings.items():
        print(f"  {virt_path:15} -> {phys_path}")

    # Verify user-specific vs shared
    user_specific = ["/memory/", "/workspace/"]
    shared = ["/skills/", "/roles/", "/knowledge/"]

    print(f"\nUser-specific paths (contain 'users/{user_id}'):")
    for vpath in user_specific:
        phys = str(path_mappings[vpath])
        has_user = f"users/{user_id}" in phys or f"users\\{user_id}" in phys
        status = "[PASS]" if has_user else "[FAIL]"
        print(f"  {status} {vpath}")

    print(f"\nShared paths (do NOT contain 'users'):")
    for vpath in shared:
        phys = str(path_mappings[vpath])
        is_shared = "users" not in phys
        status = "[PASS]" if is_shared else "[FAIL]"
        print(f"  {status} {vpath}")


if __name__ == "__main__":
    try:
        test_user_specific_paths()
        test_shared_paths()
        test_user_isolation()
        test_path_structure()
        test_path_mapping_structure()

        print("\n" + "=" * 60)
        print("[PASS] All tests passed!")
        print("=" * 60)
    except AssertionError as e:
        print(f"\n[FAIL] Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
