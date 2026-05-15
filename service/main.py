import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO

from config import Config
from api.auth import auth_bp
from api.cards import cards_bp
from api.battle import battle_bp, register_battle_sockets

socketio = SocketIO()

_STATIC = os.path.join(os.path.dirname(__file__), 'static')


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    cfg = Config.from_env()
    app.config.from_object(cfg)

    CORS(app, origins=cfg.CORS_ORIGINS)
    JWTManager(app)
    async_mode = 'eventlet' if os.environ.get('FLASK_ENV') == 'production' else 'threading'
    socketio.init_app(app, cors_allowed_origins=cfg.CORS_ORIGINS, async_mode=async_mode)

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(cards_bp, url_prefix='/profile')
    app.register_blueprint(battle_bp, url_prefix='/battle')
    register_battle_sockets(socketio)

    @app.get('/healthz')
    def health():
        return {'status': 'ok'}

    # ── Serve React SPA ────────────────────────────────────────────────────────
    # All non-API requests serve the built frontend.  Static assets (JS, CSS,
    # images) are returned directly; every other path returns index.html so the
    # React router handles client-side navigation.
    # In local development the Vite dev server handles the frontend (port 3001),
    # so this route is only exercised when static/ is present (production build).

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def spa(path: str):
        if not os.path.isdir(_STATIC):
            return {'error': 'Frontend not built. Run `npm run build` in /web and copy dist/ to service/static/'}, 503
        full = os.path.join(_STATIC, path)
        if path and os.path.isfile(full):
            return send_from_directory(_STATIC, path)
        return send_from_directory(_STATIC, 'index.html')

    return app


app = create_app()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=8080, debug=True)
