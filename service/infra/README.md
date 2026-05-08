# GCP Infrastructure

## Services Used

| GCP Service | Purpose |
|---|---|
| **App Engine Flexible** | Hosts the Flask service (supports WebSocket via eventlet) |
| **Cloud SQL (PostgreSQL)** | Persistent store for users, cards, matches |
| **Cloud Storage** | Card portrait artwork assets |
| **Secret Manager** | JWT secret, DB connection string |
| **Cloud Build** | CI/CD — runs tests then deploys to App Engine |
| **Cloud Logging / Monitoring** | Observability |

## First-Time Setup

```bash
# 1. Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Enable APIs
gcloud services enable \
  appengine.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com

# 3. Create App Engine app (once per project)
gcloud app create --region=us-central

# 4. Create Cloud SQL instance
gcloud sql instances create greatpeople-db \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=us-central1

gcloud sql databases create greatpeople --instance=greatpeople-db
gcloud sql users create appuser --instance=greatpeople-db --password=CHANGE_ME

# 5. Store secrets
echo -n "postgresql+psycopg2://appuser:CHANGE_ME@/greatpeople?host=/cloudsql/PROJECT:us-central1:greatpeople-db" | \
  gcloud secrets create db-connection-string --data-file=-

openssl rand -hex 32 | \
  gcloud secrets create jwt-secret --data-file=-

# 6. Create Cloud Storage bucket for card artwork
gcloud storage buckets create gs://greatpeople-card-assets --location=us-central1

# 7. Grant App Engine default service account access to secrets and SQL
SA="$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/cloudsql.client"
```

## Deploy

```bash
cd service
gcloud app deploy
```

Or push to the connected repository to trigger Cloud Build automatically.

## Environment Variables (app.yaml)

Real secrets are **never** stored in `app.yaml`. They are fetched at runtime from Secret Manager via `config.py`. Only the `SECRET_MANAGER_PROJECT` env var is set in `app.yaml`.
