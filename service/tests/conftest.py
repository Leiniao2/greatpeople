"""
conftest.py — pytest configuration for the Flask service test suite.

IMPORTANT: Google Cloud stubs must be inserted into sys.modules BEFORE any
project module is imported, because models/__init__.py runs
`client = datastore.Client()` at import time.  We do this at module level so
that the stubs are in place even before pytest collects test files that contain
top-level project imports.
"""
import os
import sys
import types
from unittest.mock import MagicMock

import pytest

# ---------------------------------------------------------------------------
# 1.  Environment variables — must be set before config.py is imported
# ---------------------------------------------------------------------------
os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest-suite-min32chars")

# ---------------------------------------------------------------------------
# 2.  Stub out google.cloud.datastore and google.cloud.secretmanager
#     so that `from google.cloud import datastore` and the Client() call
#     inside models/__init__.py succeed without real GCP credentials.
# ---------------------------------------------------------------------------

def _make_stub_package(full_name: str) -> types.ModuleType:
    """Return a MagicMock module registered under *full_name* and each of its
    parent package names in sys.modules."""
    parts = full_name.split(".")
    for i in range(1, len(parts) + 1):
        name = ".".join(parts[:i])
        if name not in sys.modules:
            mod = types.ModuleType(name)
            # Allow attribute access to return new MagicMocks automatically
            mod.__path__ = []          # mark as package
            sys.modules[name] = mod

    # Replace the leaf with a proper MagicMock so attribute access is flexible
    leaf = MagicMock(name=full_name)
    leaf.__name__ = full_name
    leaf.__path__ = []
    sys.modules[full_name] = leaf
    return leaf


# Build the stub hierarchy so that `from google.cloud import datastore` works
_make_stub_package("google")
_make_stub_package("google.cloud")
_make_stub_package("google.cloud.datastore")
_make_stub_package("google.cloud.secretmanager")

# Make `from google.cloud import datastore` resolve to our stub
google_cloud_stub = sys.modules["google.cloud"]
google_cloud_stub.datastore = sys.modules["google.cloud.datastore"]
google_cloud_stub.secretmanager = sys.modules["google.cloud.secretmanager"]

# Ensure the datastore.Client() call returns a MagicMock, not a real client
datastore_stub = sys.modules["google.cloud.datastore"]
datastore_stub.Client = MagicMock(return_value=MagicMock())
datastore_stub.Entity = MagicMock(side_effect=lambda key=None, **kw: MagicMock())

# Ensure secretmanager.SecretManagerServiceClient() also returns a MagicMock
secretmanager_stub = sys.modules["google.cloud.secretmanager"]
secretmanager_stub.SecretManagerServiceClient = MagicMock(return_value=MagicMock())

# ---------------------------------------------------------------------------
# 3.  Now it is safe to import project code
# ---------------------------------------------------------------------------
from main import create_app  # noqa: E402  (intentional late import)
from flask_jwt_extended import create_access_token  # noqa: E402


# ---------------------------------------------------------------------------
# 4.  Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app():
    """Application instance shared across the entire test session."""
    application = create_app()
    application.config.update(
        TESTING=True,
        JWT_SECRET_KEY="test-secret-key-for-pytest-suite-min32chars",
    )
    return application


@pytest.fixture()
def client(app):
    """Flask test client for a single test."""
    with app.test_client() as c:
        yield c


@pytest.fixture()
def auth_headers(app):
    """Return Authorization headers with a valid JWT for a dummy test user."""
    test_user_id = "test-user-00000000-0000-0000-0000-000000000001"
    with app.app_context():
        token = create_access_token(identity=test_user_id)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture()
def test_user_id():
    """The fixed user-id used by auth_headers."""
    return "test-user-00000000-0000-0000-0000-000000000001"
