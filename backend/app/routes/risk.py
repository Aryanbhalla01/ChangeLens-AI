"""Commit risk assessment endpoint."""

from flask import Blueprint, jsonify

from ..services.risk_service import assess_commit_risk

risk_bp = Blueprint(
    "risk",
    __name__,
    url_prefix="/api/repositories/<repository_id>/commits",
)


@risk_bp.get("/<commit_hash>/risk")
def commit_risk(repository_id: str, commit_hash: str):
    return jsonify(
        {
            "success": True,
            "data": assess_commit_risk(repository_id, commit_hash),
        }
    )
