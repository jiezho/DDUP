from fastapi.testclient import TestClient


def test_wiki_query_requires_wiki_enabled(client: TestClient) -> None:
    resp = client.post("/api/wiki/query", json={"query": "DDUP 是什么？"}, headers={"X-User-Id": "u1"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "wiki not enabled"

