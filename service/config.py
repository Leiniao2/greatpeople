import os
from datetime import timedelta
from google.cloud import secretmanager


def _get_secret(secret_id: str) -> str:
    project = os.environ['SECRET_MANAGER_PROJECT']
    # Use REST transport to avoid gRPC/eventlet socket-patching incompatibility.
    client = secretmanager.SecretManagerServiceClient(transport='rest')
    name = f'projects/{project}/secrets/{secret_id}/versions/latest'
    return client.access_secret_version(name=name).payload.data.decode()


class Config:
    JWT_ALGORITHM = 'HS256'
    # Clients renew the access token with the refresh token (POST /auth/refresh),
    # so a session lasts as long as the refresh token: weeks, not 15 minutes.
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=90)
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*')

    @classmethod
    def from_env(cls):
        cfg = cls()
        if os.environ.get('FLASK_ENV') == 'production':
            cfg.JWT_SECRET_KEY = _get_secret('jwt-secret')
        else:
            cfg.JWT_SECRET_KEY = os.environ.get('JWT_SECRET', 'dev-secret-change-me')
        return cfg
