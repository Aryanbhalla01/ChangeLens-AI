import pytest

from app.services import ai_summary_service


@pytest.mark.parametrize(
    ("endpoint", "expected"),
    [
        ("https://provider.example/summarize", True),
        ("http://localhost:8080/summarize", True),
        ("http://api.localhost/summarize", True),
        ("http://127.0.0.1:8080/summarize", True),
        ("http://[::1]:8080/summarize", True),
        ("http://provider.example/summarize", False),
        ("http://localhost:invalid/summarize", False),
        ("http://[invalid]/summarize", False),
        ("http:///summarize", False),
        ("not a URL", False),
    ],
)
def test_http_endpoint_requires_https_or_local_http(endpoint, expected):
    assert ai_summary_service._is_http_endpoint(endpoint) is expected


def _provider_response():
    return {
        "what_changed": "A new file was added and the README was extended.",
        "why_it_matters": "The project now documents the new behavior.",
        "important_files": ["README.md", "added.txt"],
        "suggested_review_checks": ["Confirm the documented behavior matches the implementation."],
    }


def test_summary_uses_bounded_commit_and_diff_and_formats_sections(
    app, repository, connected_repository, monkeypatch
):
    app.config.update(
        AI_SUMMARY_API_URL="https://provider.example/summarize",
        AI_SUMMARY_API_KEY="test-secret",
    )
    captured = {}

    def fake_request(endpoint, api_key, payload, timeout, max_response_bytes):
        captured.update(
            endpoint=endpoint,
            api_key=api_key,
            payload=payload,
            timeout=timeout,
            max_response_bytes=max_response_bytes,
        )
        return _provider_response()

    monkeypatch.setattr(ai_summary_service, "_request_provider", fake_request)
    with app.app_context():
        result = ai_summary_service.summarize_commit(
            connected_repository["id"], repository["second"].hexsha
        )

    assert result["available"] is True
    assert "What changed: A new file was added" in result["summary"]
    assert "Why it matters: The project now documents" in result["summary"]
    assert "Important files: README.md, added.txt" in result["summary"]
    assert "Suggested review checks:" in result["summary"]
    assert captured["api_key"] == "test-secret"
    assert captured["payload"]["commit"]["hash"] == repository["second"].hexsha
    assert {item["path"] for item in captured["payload"]["files"]} == {
        "README.md",
        "added.txt",
    }
    assert sum(len(item["diff"].encode("utf-8")) for item in captured["payload"]["files"]) <= app.config[
        "MAX_DIFF_RESPONSE_BYTES"
    ]


def test_summary_is_unavailable_without_provider_configuration(app, monkeypatch):
    app.config.update(AI_SUMMARY_API_URL=None, AI_SUMMARY_API_KEY=None)
    called = False

    def fail_if_called(*_args, **_kwargs):
        nonlocal called
        called = True
        raise AssertionError("provider must not be called")

    monkeypatch.setattr(ai_summary_service, "_request_provider", fail_if_called)
    with app.app_context():
        result = ai_summary_service.summarize_commit("unused", "unused")

    assert result["available"] is False
    assert result["summary"].startswith("AI unavailable:")
    assert result["whatChanged"] is None
    assert called is False


def test_summary_rejects_malformed_provider_response(
    app, repository, connected_repository, monkeypatch
):
    app.config.update(
        AI_SUMMARY_API_URL="https://provider.example/summarize",
        AI_SUMMARY_API_KEY="test-secret",
    )
    monkeypatch.setattr(
        ai_summary_service,
        "_request_provider",
        lambda *_args, **_kwargs: {"what_changed": "Incomplete response"},
    )

    with app.app_context():
        result = ai_summary_service.summarize_commit(
            connected_repository["id"], repository["second"].hexsha
        )

    assert result["available"] is False
    assert result["summary"] == "AI unavailable: provider request failed."
    assert result["importantFiles"] == []


def test_summary_rejects_unmodified_paths_from_provider(
    app, repository, connected_repository, monkeypatch
):
    app.config.update(
        AI_SUMMARY_API_URL="https://provider.example/summarize",
        AI_SUMMARY_API_KEY="test-secret",
    )
    response = _provider_response()
    response["important_files"] = ["not-changed.txt"]
    monkeypatch.setattr(
        ai_summary_service, "_request_provider", lambda *_args, **_kwargs: response
    )

    with app.app_context():
        result = ai_summary_service.summarize_commit(
            connected_repository["id"], repository["second"].hexsha
        )

    assert result["available"] is False
    assert result["summary"].startswith("AI unavailable:")


def test_summary_handles_provider_errors(
    app, repository, connected_repository, monkeypatch
):
    app.config.update(
        AI_SUMMARY_API_URL="https://provider.example/summarize",
        AI_SUMMARY_API_KEY="test-secret",
    )

    def fail_request(*_args, **_kwargs):
        raise TimeoutError("sensitive provider details")

    monkeypatch.setattr(ai_summary_service, "_request_provider", fail_request)
    with app.app_context():
        result = ai_summary_service.summarize_commit(
            connected_repository["id"], repository["second"].hexsha
        )

    assert result["available"] is False
    assert result["summary"] == "AI unavailable: provider request failed."
    assert "sensitive provider details" not in result["summary"]
