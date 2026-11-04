"""Flask application factory for the ChangeLens API."""

from pathlib import Path

from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.engine import make_url
from werkzeug.exceptions import HTTPException

from .config import Config, resolve_database_uri
from .models import db
from .routes import register_blueprints
from .utils.errors import ApiError


def create_app(test_config: dict | None = None) -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    database_uri = resolve_database_uri(app.config["SQLALCHEMY_DATABASE_URI"])
    app.config["SQLALCHEMY_DATABASE_URI"] = database_uri
    database_url = make_url(database_uri)
    if database_url.get_backend_name() == "sqlite" and database_url.database:
        database_file = database_url.database
        if database_file != ":memory:" and database_url.query.get("mode") != "memory":
            if database_file.startswith("file:"):
                database_file = database_file[len("file:") :]
            Path(database_file).parent.mkdir(parents=True, exist_ok=True)
    db.init_app(app)
    CORS(app, origins=app.config["CORS_ORIGINS"])

    @app.errorhandler(ApiError)
    def handle_api_error(error: ApiError):
        return jsonify(
            {
                "success": False,
                "error": {"code": error.code, "message": error.message},
            }
        ), error.status_code

    @app.errorhandler(404)
    def handle_not_found(_error):
        return jsonify(
            {
                "success": False,
                "error": {"code": "NOT_FOUND", "message": "The requested resource was not found."},
            }
        ), 404

    @app.errorhandler(HTTPException)
    def handle_http_error(error: HTTPException):
        status_code = error.code or 500
        code = "METHOD_NOT_ALLOWED" if status_code == 405 else "HTTP_ERROR"
        return jsonify(
            {
                "success": False,
                "error": {"code": code, "message": "The request could not be completed."},
            }
        ), status_code

    @app.errorhandler(SQLAlchemyError)
    def handle_database_error(error: SQLAlchemyError):
        app.logger.exception("Database operation failed: %s", error)
        return jsonify(
            {
                "success": False,
                "error": {
                    "code": "DATABASE_ERROR",
                    "message": "A database operation could not be completed.",
                },
            }
        ), 500

    @app.errorhandler(Exception)
    def handle_unexpected_error(error: Exception):
        app.logger.exception("Unhandled API error: %s", error)
        return jsonify(
            {
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected server error occurred.",
                },
            }
        ), 500

    register_blueprints(app)
    with app.app_context():
        db.create_all()
    return app
