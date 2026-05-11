from fastapi.testclient import TestClient


def test_list_spaces_creates_personal_space(client: TestClient) -> None:
    resp = client.get("/api/spaces", headers={"X-User-Id": "u1"})
    assert resp.status_code == 200
    spaces = resp.json()
    assert len(spaces) == 1
    assert spaces[0]["type"] == "personal"
    assert spaces[0]["owner_user_id"] == "u1"

