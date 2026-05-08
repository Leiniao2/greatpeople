# GCP Infrastructure

## Services Used

| GCP Service | Purpose |
|---|---|
| **App Engine Flexible** | Hosts the Flask service (WebSocket support via threading mode) |
| **Cloud Datastore (NDB)** | Persistent store for users, cards, matches |
| **Cloud Storage** | Card portrait artwork assets |
| **Secret Manager** | JWT secret key |
| **Cloud Build** | CI/CD — deploys to App Engine on push |
| **Cloud Logging / Monitoring** | Observability |

## First-Time Setup

### 1. Authenticate and set project

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Enable required APIs

```bash
gcloud services enable \
  appengine.googleapis.com \
  datastore.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

### 3. Create App Engine app (once per project)

```bash
gcloud app create --region=us-central
```

This also initializes Cloud Datastore in Datastore mode for the project.

### 4. Store the JWT secret in Secret Manager

```bash
openssl rand -hex 32 | gcloud secrets create jwt-secret --data-file=-
```

### 5. Create Cloud Storage bucket for card artwork

```bash
gcloud storage buckets create gs://YOUR_PROJECT_ID-card-assets --location=us-central1
```

### 6. Grant App Engine service account access to Secret Manager

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')
SA="${PROJECT_NUMBER}@appspot.gserviceaccount.com"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/datastore.user"
```

### 7. Update app.yaml

Replace `YOUR_GCP_PROJECT_ID` in `app.yaml` with your actual project ID.

### 8. Deploy

```bash
cd service
gcloud app deploy
```

First deploy takes ~10 minutes. Subsequent deploys ~5 minutes.

## Local Development

### Install dependencies

```bash
cd service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Authenticate for local Datastore access

```bash
gcloud auth application-default login
```

This lets the local service connect to your real Cloud Datastore (same project).
For a fully isolated local environment, use the Datastore emulator instead:

```bash
gcloud components install cloud-datastore-emulator
gcloud beta emulators datastore start --project=YOUR_PROJECT_ID
# In a separate terminal:
export DATASTORE_EMULATOR_HOST=localhost:8081
python main.py
```

### Run locally

```bash
# With real Datastore (recommended for SSO testing)
python main.py
```

Service runs on `http://localhost:8080`. The Vite dev server at `localhost:3001` proxies `/auth`, `/profile`, and `/battle` to it.

## Environment Variables

Real secrets are **never** stored in `app.yaml`. They are fetched at runtime from Secret Manager via `config.py`. Only the non-secret `SECRET_MANAGER_PROJECT` env var is set in `app.yaml`.
