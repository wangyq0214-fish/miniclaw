"""
Test script for authentication API.
"""
import requests
import json

BASE_URL = "http://localhost:8002/api"


def test_register():
    """Test user registration."""
    print("\n=== Testing User Registration ===")
    url = f"{BASE_URL}/auth/register"
    data = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "password123",
        "full_name": "Test User"
    }

    response = requests.post(url, json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


def test_login(username, password):
    """Test user login."""
    print("\n=== Testing User Login ===")
    url = f"{BASE_URL}/auth/login"
    data = {
        "username": username,
        "password": password
    }

    response = requests.post(url, data=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


def test_get_current_user(token):
    """Test getting current user info."""
    print("\n=== Testing Get Current User ===")
    url = f"{BASE_URL}/auth/me"
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(url, headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


def test_logout(token):
    """Test user logout."""
    print("\n=== Testing User Logout ===")
    url = f"{BASE_URL}/auth/logout"
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.post(url, headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


def main():
    """Run all tests."""
    print("Starting Authentication API Tests...")
    print(f"Base URL: {BASE_URL}")

    try:
        # Test registration
        user = test_register()

        # Test login
        login_result = test_login("testuser", "password123")
        token = login_result.get("access_token")

        if token:
            # Test get current user
            test_get_current_user(token)

            # Test logout
            test_logout(token)

            # Try to access protected endpoint after logout
            print("\n=== Testing Access After Logout ===")
            test_get_current_user(token)

        print("\n=== All Tests Completed ===")

    except Exception as e:
        print(f"\nError: {str(e)}")


if __name__ == "__main__":
    main()
