# Cloud Run image for the Flask service.
# Expects the built frontend in static/ (cloudbuild.yaml copies web/dist there
# before building); without it the service still runs but / returns 503.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FLASK_ENV=production

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# One eventlet worker: Socket.IO rooms live in process memory, so battles
# only work while every client talks to the same process (see max-instances).
CMD exec gunicorn -k eventlet -w 1 -b :$PORT main:app
