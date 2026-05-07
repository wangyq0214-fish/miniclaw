"""Test streaming chat API"""

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

# Test streaming chat
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {token}"
}
payload = {
    "message": "你好，请介绍一下你自己",
    "session_id": "test_session_004",
    "stream": True
}

print(f"\nSending streaming request...")

response = requests.post(
    "http://localhost:8002/api/chat",
    headers=headers,
    json=payload,
    stream=True
)

print(f"Response status: {response.status_code}")
print(f"Response headers: {dict(response.headers)}")
print("\nStreaming events:")

event_count = 0

for line in response.iter_lines():
    if line:
        decoded = line.decode('utf-8')
        print(decoded)
        event_count += 1
        if event_count > 20:
            print("... (showing first 20 events)")
            break
