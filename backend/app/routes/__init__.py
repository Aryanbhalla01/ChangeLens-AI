"""API route registration."""

from flask import Flask

from .analysis import analysis_bp
from .commits import commits_bp
from .comparisons import comparisons_bp
from .dependencies import dependencies_bp
from .health import health_bp
from .risk import risk_bp
from .repositories import repositories_bp


def register_blueprints(app: Flask) -> None:
    app.register_blueprint(health_bp)
    app.register_blueprint(repositories_bp)
    app.register_blueprint(commits_bp)
    app.register_blueprint(comparisons_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(risk_bp)
    app.register_blueprint(dependencies_bp)
