from fastapi.testclient import TestClient


def test_action_execute_writes_audit(client: TestClient) -> None:
    resp = client.post(
        "/api/actions/execute",
        json={"type": "noop", "payload": {"x": 1}},
        headers={"X-User-Id": "u1"},
    )
    assert resp.status_code == 200

    logs = client.get("/api/audit", headers={"X-User-Id": "u1"}).json()
    assert any(l["action"] == "action.execute" for l in logs)

