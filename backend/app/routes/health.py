"""Health-check endpoint."""

from flask import Blueprint, current_app, jsonify

health_bp = Blueprint("health", __name__, url_prefix="/api")


@health_bp.get("/health")
def health():
    return jsonify(
        {
            "success": True,
            "data": {
                "status": "ok",
                "application": current_app.config["APP_NAME"],
                "version": current_app.config["VERSION"],
            },
        }
    )
