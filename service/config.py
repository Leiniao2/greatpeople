import os
from google.cloud import secretmanager


def _get_secret(secret_id: str) -> str:
    project = os.environ['SECRET_MANAGER_PROJECT']
    client = secretmanager.SecretManagerServiceClient()
    name = f'projects/{project}/secrets/{secret_id}/versions/latest'
    return client.access_secret_version(name=name).payload.data.decode()


class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_ALGORITHM = 'HS256'
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*')

    @classmethod
    def from_env(cls):
        cfg = cls()
        if os.environ.get('FLASK_ENV') == 'production':
            cfg.JWT_SECRET_KEY = _get_secret('jwt-secret')
        else:
            cfg.JWT_SECRET_KEY = os.environ.get('JWT_SECRET', 'dev-secret-change-me')
        return cfg
