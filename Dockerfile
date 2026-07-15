# InvisiGuard single-origin image: builds the Vite frontend, then serves it together
# with the FastAPI API and the /static image store from one process (one port, one origin).
# Classic (DWT-QIM) engine only by default; the deep-learning TrustMark engine is optional
# (see the commented block below) because torch is multi-GB.

# ---- Stage 1: build the frontend ----
FROM node:20-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build            # -> /app/frontend/dist

# ---- Stage 2: python runtime that serves everything ----
FROM python:3.12-slim AS runtime
# opencv-python-headless / scikit-image need libgomp + libglib at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# Base (classic engine) dependencies only. Light, no torch.
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# --- OPTIONAL: deep-learning TrustMark engine (heavy, multi-GB). Uncomment to enable. ---
# COPY backend/requirements-dl.txt ./
# RUN pip install --no-cache-dir -r requirements-dl.txt \
#  && PYTHONUTF8=1 pip install --no-cache-dir --no-deps trustmark

COPY backend/ ./

# Serve the built frontend same-origin (see main.py: mounts it at "/").
COPY --from=web /app/frontend/dist /app/frontend/dist
ENV FRONTEND_DIST=/app/frontend/dist RELOAD=0

# Persist these across restarts with Zeabur volumes (see the deploy guide):
#   /app/backend/data            -> SQLite registry (TrustMark id -> text)
#   /app/backend/static/processed -> generated watermarked images

EXPOSE 8000
# Exec form + env read in Python: main.py resolves PORT / WEB_PORT / 8000 itself,
# so startup never depends on shell variable expansion (avoids the literal
# "${WEB_PORT}" -> "not a valid integer" crash when the platform overrides CMD).
CMD ["python", "main.py"]
