from fastapi.testclient import TestClient


def test_dashboard_summary_counts(client: TestClient) -> None:
    client.post("/api/assistant/todos", json={"text": "T1"}, headers={"X-User-Id": "u1"})
    client.post("/api/learning/terms", json={"term": "RAG", "definition": "d", "source": "chat"}, headers={"X-User-Id": "u1"})

    summary = client.get("/api/dashboard/summary", headers={"X-User-Id": "u1"}).json()
    assert summary["todo_open"] >= 1
    assert summary["review_due"] >= 1
    assert "items" in summary
