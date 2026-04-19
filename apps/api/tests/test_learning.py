from fastapi.testclient import TestClient


def test_learning_terms_create_list_master(client: TestClient) -> None:
    created = client.post(
        "/api/learning/terms",
        json={"term": "RAG", "definition": "Retrieval Augmented Generation", "source": ""},
        headers={"X-User-Id": "u1"},
    ).json()
    assert created["term"] == "RAG"
    assert created["mastered"] is False

    listed = client.get("/api/learning/terms", headers={"X-User-Id": "u1"}).json()
    assert any(i["id"] == created["id"] for i in listed)

    mastered = client.post(
        f"/api/learning/terms/{created['id']}/master",
        json={},
        headers={"X-User-Id": "u1"},
    ).json()
    assert mastered["mastered"] is True

