from fastapi.testclient import TestClient


def test_chat_stream_returns_sse(client: TestClient) -> None:
    resp = client.post("/api/chat/sessions", json={"title": ""}, headers={"X-User-Id": "u1"})
    assert resp.status_code == 200
    session_id = resp.json()["id"]

    stream_resp = client.post(
        f"/api/chat/sessions/{session_id}/stream",
        json={"text": "hello"},
        headers={"X-User-Id": "u1"},
    )
    assert stream_resp.status_code == 200
    assert "event: message.delta" in stream_resp.text
    assert "event: card.add" in stream_resp.text
    assert "event: done" in stream_resp.text

