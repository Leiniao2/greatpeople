from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO

from config import Config
from models import ndb_client
from api.auth import auth_bp
from api.cards import cards_bp
from api.battle import battle_bp, register_battle_sockets

socketio = SocketIO()


def ndb_wsgi_middleware(wsgi_app):
    """Wraps every HTTP request in an NDB context."""
    def middleware(environ, start_response):
        with ndb_client.context():
            return wsgi_app(environ, start_response)
    return middleware


def create_app() -> Flask:
    app = Flask(__name__)
    cfg = Config.from_env()
    app.config.from_object(cfg)

    CORS(app, origins=cfg.CORS_ORIGINS)
    JWTManager(app)
    # threading mode avoids eventlet/gRPC compatibility issues with NDB
    socketio.init_app(app, cors_allowed_origins=cfg.CORS_ORIGINS, async_mode='threading')

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(cards_bp, url_prefix='/profile')
    app.register_blueprint(battle_bp, url_prefix='/battle')
    register_battle_sockets(socketio)

    app.wsgi_app = ndb_wsgi_middleware(app.wsgi_app)

    @app.get('/healthz')
    def health():
        return {'status': 'ok'}

    return app


app = create_app()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=8080, debug=True)
