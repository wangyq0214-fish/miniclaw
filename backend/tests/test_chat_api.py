"""Test chat API with proper authentication"""
import requests
import json

# Login
login_response = requests.post(
    "http://localhost:8002/api/auth/login",
    data={"username": "testuser2", "password": "test123456"}
)
print(f"Login status: {login_response.status_code}")
token = login_response.json()["access_token"]
print(f"Token: {token[:50]}...")

# Test chat
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {token}"
}
payload = {
    "message": "你好",
    "session_id": "test_session_003",
    "stream": False
}

print(f"\nSending request with payload: {json.dumps(payload, ensure_ascii=False)}")

chat_response = requests.post(
    "http://localhost:8002/api/chat",
    headers=headers,
    json=payload
)

print(f"\nChat status: {chat_response.status_code}")
print(f"Response: {chat_response.text}")
