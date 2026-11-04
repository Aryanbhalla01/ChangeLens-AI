"""Database extension and local repository registrations."""

from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class RepositoryRegistration(db.Model):
    """An explicitly connected, locally approved repository."""

    __tablename__ = "repository_registrations"

    id = db.Column(db.String(36), primary_key=True)
    path = db.Column(db.Text, nullable=False, unique=True)
    name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
