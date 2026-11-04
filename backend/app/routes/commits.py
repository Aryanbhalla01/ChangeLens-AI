"""Commit history and detail endpoints."""

from flask import Blueprint, current_app, jsonify, request

from ..services.git_service import get_commit_details, get_commit_history
from ..utils.errors import ApiError

commits_bp = Blueprint(
    "commits", __name__, url_prefix="/api/repositories/<repository_id>/commits"
)


@commits_bp.get("")
def history(repository_id: str):
    page = _positive_int(request.args.get("page", "1"), "page")
    per_page = _positive_int(request.args.get("per_page", "20"), "per_page")
    if per_page > current_app.config["MAX_PAGE_SIZE"]:
        raise ApiError(
            "INVALID_PAGINATION",
            f"'per_page' must not exceed {current_app.config['MAX_PAGE_SIZE']}.",
            400,
        )
    search = request.args.get("search", "").strip()
    branch = request.args.get("branch")
    if len(search) > 200:
        raise ApiError("INVALID_SEARCH", "Search text must be 200 characters or fewer.", 400)
    return jsonify(
        {
            "success": True,
            "data": get_commit_history(
                repository_id, page=page, per_page=per_page, search=search, branch=branch
            ),
        }
    )


@commits_bp.get("/<commit_hash>")
def detail(repository_id: str, commit_hash: str):
    return jsonify(
        {"success": True, "data": get_commit_details(repository_id, commit_hash)}
    )


def _positive_int(value: str, name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ApiError("INVALID_PAGINATION", f"'{name}' must be a positive integer.", 400) from error
    if parsed < 1:
        raise ApiError("INVALID_PAGINATION", f"'{name}' must be a positive integer.", 400)
    return parsed
