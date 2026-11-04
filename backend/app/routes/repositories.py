"""Repository connection and status endpoints."""

from flask import Blueprint, jsonify, request

from ..services.repository_service import (
    connect_repository,
    get_repository_detail,
    get_repository_status,
    list_repositories,
)
from ..utils.errors import ApiError

repositories_bp = Blueprint("repositories", __name__, url_prefix="/api/repositories")


@repositories_bp.post("/connect")
def connect():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get("path"), str):
        raise ApiError(
            "INVALID_REQUEST",
            "Provide a repository path as a JSON string in the 'path' field.",
            400,
        )
    repository = connect_repository(payload["path"])
    return jsonify({"success": True, "data": repository}), 201


@repositories_bp.get("")
def list_connected():
    return jsonify({"success": True, "data": list_repositories()})


@repositories_bp.get("/<repository_id>")
def detail(repository_id: str):
    return jsonify({"success": True, "data": get_repository_detail(repository_id)})


@repositories_bp.get("/<repository_id>/status")
def status(repository_id: str):
    return jsonify({"success": True, "data": get_repository_status(repository_id)})
