"""Commit-scoped source analysis endpoints."""

from flask import Blueprint, jsonify

from ..services.analysis_service import analyze_commit

analysis_bp = Blueprint(
    "analysis",
    __name__,
    url_prefix="/api/repositories/<repository_id>/commits",
)


@analysis_bp.get("/<commit_hash>/analysis")
def commit_analysis(repository_id: str, commit_hash: str):
    return jsonify(
        {
            "success": True,
            "data": analyze_commit(repository_id, commit_hash),
        }
    )
