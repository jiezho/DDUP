from fastapi.testclient import TestClient


def test_assistant_todos_create_list_complete(client: TestClient) -> None:
    created = client.post(
        "/api/assistant/todos",
        json={"text": "do something"},
        headers={"X-User-Id": "u1"},
    ).json()
    assert created["done"] is False

    listed = client.get("/api/assistant/todos", headers={"X-User-Id": "u1"}).json()
    assert any(i["id"] == created["id"] for i in listed)

    completed = client.post(
        f"/api/assistant/todos/{created['id']}/complete",
        json={},
        headers={"X-User-Id": "u1"},
    ).json()
    assert completed["done"] is True


def test_assistant_habits_create_checkin(client: TestClient) -> None:
    created = client.post(
        "/api/assistant/habits",
        json={"name": "drink water", "cadence": "daily"},
        headers={"X-User-Id": "u1"},
    ).json()
    assert created["streak"] == 0

    checked = client.post(
        f"/api/assistant/habits/{created['id']}/checkin",
        json={},
        headers={"X-User-Id": "u1"},
    ).json()
    assert checked["streak"] == 1


def test_assistant_ideas_crud(client: TestClient) -> None:
    created = client.post(
        "/api/assistant/ideas",
        json={"content": "an idea", "tags": "a,b"},
        headers={"X-User-Id": "u1"},
    ).json()
    assert created["content"] == "an idea"
    assert created["tags"] == "a,b"

    listed = client.get("/api/assistant/ideas", headers={"X-User-Id": "u1"}).json()
    assert any(i["id"] == created["id"] for i in listed)

    detail = client.get(f"/api/assistant/ideas/{created['id']}", headers={"X-User-Id": "u1"}).json()
    assert detail["id"] == created["id"]
    assert detail["content"] == "an idea"

    updated = client.patch(
        f"/api/assistant/ideas/{created['id']}",
        json={"content": "updated", "tags": None},
        headers={"X-User-Id": "u1"},
    ).json()
    assert updated["content"] == "updated"
    assert updated["tags"] is None

    deleted = client.delete(
        f"/api/assistant/ideas/{created['id']}",
        headers={"X-User-Id": "u1"},
    ).json()
    assert deleted["ok"] is True

    after_delete = client.get(f"/api/assistant/ideas/{created['id']}", headers={"X-User-Id": "u1"})
    assert after_delete.status_code == 404

