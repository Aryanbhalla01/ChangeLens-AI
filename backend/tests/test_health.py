def test_health_returns_application_status(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {
        "success": True,
        "data": {
            "status": "ok",
            "application": "ChangeLens AI",
            "version": "0.1.0",
        },
    }
