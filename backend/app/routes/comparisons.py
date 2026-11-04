"""Commit comparison endpoint."""

from flask import Blueprint, jsonify, request

from ..services.diff_service import compare_commits
from ..utils.errors import ApiError

comparisons_bp = Blueprint(
    "comparisons", __name__, url_prefix="/api/repositories/<repository_id>"
)


@comparisons_bp.get("/compare")
def compare(repository_id: str):
    base = request.args.get("base", "")
    target = request.args.get("target", "")
    if not base or not target:
        raise ApiError(
            "INVALID_REQUEST", "Both 'base' and 'target' commit hashes are required.", 400
        )
    return jsonify(
        {
            "success": True,
            "data": compare_commits(repository_id, base=base, target=target),
        }
    )
