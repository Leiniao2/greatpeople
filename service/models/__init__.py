from google.cloud import datastore

# Use HTTP instead of gRPC: under eventlet's socket patching (production) the
# gRPC channel deadlocks, so every Datastore call hangs until gunicorn kills
# the worker.  Same issue as the Secret Manager client in config.py.
client = datastore.Client(_use_grpc=False)
