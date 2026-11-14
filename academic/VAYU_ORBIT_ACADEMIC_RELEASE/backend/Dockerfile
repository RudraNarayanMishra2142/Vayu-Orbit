# VAYU ORBIT — Backend Production Containerfile
# Python 3.11 slim runtime for containerized cloud deployment (Render, Railway, Fly.io, Cloud Run)

FROM python:3.11-slim

# Set environment variables for clean container execution
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    PORT=8000 \
    CMS_DB_PATH=/data/military_logistics.db

# Install minimal OS dependencies for SQLite and health checking
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python package dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY . .

# Create persistent data volume mount point and unprivileged service user
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -s /bin/sh -m appuser && \
    mkdir -p /data && \
    chown -R appuser:appgroup /app /data

USER appuser

# Expose default API port
EXPOSE 8000

# Cloud healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/healthz || exit 1

# Start Uvicorn bound to 0.0.0.0 on runtime $PORT
CMD ["sh", "-c", "python -m uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
