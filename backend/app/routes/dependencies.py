"""Commit-scoped Python dependency analysis endpoint."""

from flask import Blueprint, jsonify

from ..services.dependency_service import analyze_commit_dependencies

dependencies_bp = Blueprint(
    "dependencies",
    __name__,
    url_prefix="/api/repositories/<repository_id>/commits",
)


@dependencies_bp.get("/<commit_hash>/dependencies")
def commit_dependencies(repository_id: str, commit_hash: str):
    return jsonify(
        {
            "success": True,
            "data": analyze_commit_dependencies(repository_id, commit_hash),
        }
    )
