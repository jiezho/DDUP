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

