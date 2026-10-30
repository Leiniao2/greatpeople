# GCP Infrastructure

## Services Used

| GCP Service | Purpose |
|---|---|
| **Cloud Run** | Hosts the Flask service and the built frontend (WebSocket support, scales to zero) |
| **Artifact Registry** | Stores the service container image |
| **Cloud Datastore (NDB)** | Persistent store for users, cards, matches |
| **Cloud Storage** | Card portrait artwork assets |
| **Secret Manager** | JWT secret key |
| **Cloud Build** | CI/CD — builds the image and deploys to Cloud Run |
| **Cloud Logging / Monitoring** | Observability |

The service previously ran on App Engine Flexible (`../app.yaml`). That kept a
VM running around the clock; Cloud Run bills only while requests are being
served.

## First-Time Setup

### 1. Authenticate and set project

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  datastore.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

### 3. Create the Datastore database (once per project)

Projects that already had App Engine have this. Otherwise create it in
Datastore mode:

```bash
gcloud firestore databases create --location=us-central1 --type=datastore-mode
```

### 4. Store the JWT secret in Secret Manager

```bash
openssl rand -hex 32 | gcloud secrets create jwt-secret --data-file=-
```

### 5. Create Cloud Storage bucket for card artwork

```bash
gcloud storage buckets create gs://YOUR_PROJECT_ID-card-assets --location=us-central1
```

### 6. Create the image repository

```bash
gcloud artifacts repositories create greatpeople \
  --repository-format=docker --location=us-central1
```

### 7. Create the runtime service account

Cloud Run runs the service as this account.

```bash
SA="greatpeople-run@YOUR_PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts create greatpeople-run --display-name="Great People Cloud Run"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/datastore.user"
```

### 8. Let Cloud Build deploy

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$BUILD_SA" \
  --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding \
  greatpeople-run@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --member="serviceAccount:$BUILD_SA" \
  --role="roles/iam.serviceAccountUser"
```

`BUILD_SA` is the account Cloud Build runs as; check
`gcloud builds get-default-service-account` if your project uses a different one.

### 9. Deploy

From the repository root:

```bash
gcloud builds submit --config service/cloudbuild.yaml .
```

This builds the frontend (with the web OAuth client id from the
`_GOOGLE_CLIENT_ID` substitution baked in), runs the backend tests, builds the
image and deploys it. The service URL is printed at the end (also
`gcloud run services describe greatpeople --region=us-central1 --format='value(status.url)'`).

### 10. Allow the new origin for Google sign-in

Add the Cloud Run URL to **Authorized JavaScript origins** on the web OAuth
client (APIs & Services → Credentials).

### Scaling notes

The service deploys with `--min-instances=0 --max-instances=1`. Idle periods
cost nothing, but the first request afterwards waits a few seconds for a cold
start; set `--min-instances=1` to avoid that. Socket.IO rooms live in process
memory, so `--max-instances` must stay at 1 until battles share a message
queue (e.g. Redis via `SocketIO(message_queue=...)`).

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

Real secrets are **never** stored in the image or deploy config. They are fetched at runtime from Secret Manager via `config.py`. Only the non-secret `FLASK_ENV` and `SECRET_MANAGER_PROJECT` env vars are set, by the deploy step in `cloudbuild.yaml`.
