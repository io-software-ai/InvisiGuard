# Deploying InvisiGuard to Zeabur

This repo ships a root **`Dockerfile`** that builds the Vite frontend and serves it together
with the FastAPI API and the generated-image store from **one process, one port, one origin**.
That single-origin design is required, because the frontend calls the API at the relative path
`/api/v1` and image URLs come back as relative `/static/...` — they only resolve if the app and
API share an origin.

## TL;DR

| Question | Answer |
|---|---|
| **Which port to expose** | The container listens on **`$PORT`** (Zeabur injects it); falls back to `8000`. Zeabur auto-detects the exposed port from the Dockerfile (`EXPOSE 8000`). You do **not** set `PORT` yourself. |
| **Env vars to set** | `WATERMARK_KEY` (required), `CORS_ORIGINS` (your domain). `FRONTEND_DIST` and `RELOAD` are already set in the Dockerfile. |
| **Volumes to mount** | `/app/backend/data` (SQLite registry) and `/app/backend/static/processed` (generated images). |

## 1. Create the service

1. Zeabur dashboard → your project → **Deploy → Git** → pick this repo.
2. Zeabur detects the root **`Dockerfile`** and builds it. No other build config is needed
   (the `.dockerignore` keeps the context small: it excludes `node_modules`, `.venv`, the
   landing pages, `cli/`, etc.).
3. Build produces a single container. Working directory inside is `/app/backend`.

## 2. Environment variables (Service → Variables)

| Variable | Required | Value | Notes |
|---|---|---|---|
| `WATERMARK_KEY` | **Yes (for real use)** | a long random secret string | Derives all watermark security. If unset, the backend falls back to the **public demo key** and logs a `[SECURITY]` warning; anyone could then read/forge/erase your marks. **Do not change it after go-live** — changing the key invalidates every watermark already embedded. |
| `CORS_ORIGINS` | Recommended | `https://invisiguard.iosoftware.ai` (comma-separated for several) | Allow-list for cross-origin browser calls (e.g. the CLI or a separate site hitting the API). With the single-origin setup the app itself does not need it, but set it to your real domain(s). Default is localhost-only. |
| `FRONTEND_DIST` | Preset | `/app/frontend/dist` | Already set in the Dockerfile; only change if you relocate the build. Setting it is what makes the backend serve the SPA. |
| `RELOAD` | Preset | `0` | Already set; disables uvicorn autoreload in production. |
| `PORT` | **No** | (injected) | Zeabur sets this automatically. Do not define it. |

## 3. Volumes (Service → Volumes)

Both directories are **git-ignored and start empty**, and their contents must survive
restarts/redeploys:

| Mount path | Holds | Consequence if not persisted |
|---|---|---|
| `/app/backend/data` | SQLite registry (`registry.sqlite3` + WAL sidecars) mapping each TrustMark short-ID to its full text | TrustMark IDs become unresolvable after a restart. Critical **if you use the deep-learning engine**. |
| `/app/backend/static/processed` | Generated watermarked PNGs served at `/static/processed/...` | Previously generated download links 404 after a restart. |

(Optional: `/app/backend/static/debug` if you want debug artifacts kept.)

Note: neither directory has a cleanup/TTL policy yet, so both grow unbounded. Plan periodic
pruning or a size-capped volume.

## 4. Domain

Bind your domain (e.g. `invisiguard.iosoftware.ai`) to the service, or use the Zeabur-generated
subdomain. Everything is same-origin, so no path routing rules are needed:

- `GET /` -> the web app (SPA)
- `POST /api/v1/embed`, `/api/v1/verify`, `GET /api/v1/health` -> API (also available at `/v1/...`)
- `GET /static/processed/<id>.png` -> generated images

## 5. Verify after deploy

- `https://<domain>/api/v1/health` -> `{"status":"ok","service":"InvisiGuard API"}`
- `https://<domain>/` -> the app loads; run an embed and confirm the image + robustness report.
- (Optional Zeabur health check path: `/api/v1/health`.)

## 6. Classic vs deep-learning engine

- **Default = classic only** (the `requirements.txt` DWT-QIM engine). Light image, no GPU,
  works out of the box. Requests with `engine=trustmark` return HTTP `503` until you enable DL.
- **To enable TrustMark (deep learning):** uncomment the `requirements-dl.txt` block in the
  `Dockerfile`. This pulls torch (multi-GB image, more RAM), and model weights download on first
  use. If you enable it, also give the trustmark package's weight-cache directory a volume, or
  weights re-download on every cold start. Start classic-only unless you specifically need it.

## 7. The landing pages are separate

`invisiguard-landing/` and `fluxrelay-landing/` are standalone static sites and are **not** part
of this image (excluded via `.dockerignore`). Deploy each as its own Zeabur **static** service if
you want them, or host them anywhere static. The footer links point Documentation / API reference
at `https://invisiguard.iosoftware.ai/#developers` and Status at `./status.html`, so serve the
landing at your apex domain and the app where those links expect it (adjust the hrefs if your
topology differs).

## Troubleshooting

**`Error: Invalid value for '--port': '${WEB_PORT}' is not a valid integer`** (container BackOff loop)
The service was built by Zeabur's auto-detection (zbpack) as a plain Python app instead of the
root `Dockerfile`, and its generated start command passes `${WEB_PORT}` without shell expansion.
Fix either way:
1. **Preferred:** Service Settings → set **Root Directory to the repo root** (`/`), clear any
   custom start command, and redeploy so the root `Dockerfile` is used (this also builds and
   serves the frontend same-origin).
2. If you intentionally deploy only `backend/` via auto-detection: set the **custom start
   command to `python main.py`** and add env `RELOAD=0`. `main.py` reads `PORT` / `WEB_PORT`
   from the environment itself, so no shell expansion is needed.

## What the deploy relies on in code

- Root `Dockerfile` + `.dockerignore` (added for this).
- `backend/main.py`: mounts the API at both `/v1` and `/api/v1`, serves `FRONTEND_DIST` at `/`
  (guarded — local dev without a build keeps the JSON root), and honors `PORT` / `RELOAD`.
- The classic engine has no other required config; only `WATERMARK_KEY` and `CORS_ORIGINS` are read.
