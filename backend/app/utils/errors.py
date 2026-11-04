"""Safe, structured errors used by API services and routes."""


class ApiError(Exception):
    """An expected API failure with a public message and HTTP status."""

    def __init__(self, code: str, message: str, status_code: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
