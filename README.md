# InvisiGuard

InvisiGuard is an invisible watermarking system that embeds textual data into digital images. It ships **two complementary engines**, selectable per request:

- **Classic** — a 2-level DWT + **key-derived dither QIM (DM-QIM)** + Reed-Solomon pipeline with the payload **tiled redundantly across the whole image**. High capacity (92 bytes of text), resilient to cropping on any edge, runs on CPU with no model.
- **TrustMark (deep learning)** — Adobe's neural watermark, robust to the attacks the classic track is weakest against: **heavy JPEG re-compression and downscaling** (the social-media re-encode scenario). It carries a 61-bit ID; the full text lives in a server-side registry.

The two tracks are intentionally complementary — see [Dual-Engine Design](#dual-engine-design).

## Key Features

- **Invisible Embedding**: Embeds in the LL2 (2-level low-frequency) sub-band of the Y-channel, keeping visual distortion low (PSNR ≈ 43 dB, SSIM ≈ 0.99 on the benchmark set).
- **Keyed & Tamper-Resistant**: Both the QIM dither offsets and the bit-placement permutation are derived from a secret key (`WATERMARK_KEY`). Without the key an attacker cannot read, forge, or precisely re-quantize away the watermark. *(See [Security](#security) — the built-in `DEFAULT_KEY` is a public demo key; set your own for anything real.)*
- **Tiled Redundancy**: The payload is a single RS(128, 96) packet (each packet corrects up to 16 byte-errors) replicated into every 32×32-coefficient tile of LL2. Extraction fuses all tiles by soft voting, so any surviving tile can recover the message — this is what gives it cropping resilience on **all** edges, not just bottom/right.
- **Moderate JPEG Robustness**: Survives JPEG down to ~q60–q70 in the synthetic benchmark (default `DELTA=24`). It does **not** survive geometric attacks (rotation/scaling) in blind mode, heavy re-compression, resampling, or generative (diffusion) edits.
- **Extraction and Verification**: Two modes — extraction with the original image (adds ORB alignment before a phase/tile-origin search) and a "blind" verification mode without the original.
- **Professional Web Platform**: A bilingual (English / Traditional Chinese) React app with four deep-linkable sub-pages (`#embed`, `#verify`, `#developers`, `#status`), side-by-side comparison with PSNR/SSIM metrics, a live system-status page, and a developers page offering both full API documentation and a one-click integration brief for AI coding agents.

## Dual-Engine Design

Every endpoint takes an `engine` form field: `classic` (default) or `trustmark`. The two engines cover each other's blind spots:

| | Classic (DWT-QIM) | TrustMark (deep learning) |
|---|---|---|
| Capacity | 92 UTF-8 bytes of text | 61-bit ID → text in server registry |
| JPEG | survives ≥ ~q60 | **reliably ≥ ~q30, often q20** |
| Downscaling | ✗ | **survives ≥ 0.5×** |
| Cropping | **any edge** | ✗ (needs full frame) |
| Rotation | ✗ | ✗ |
| Runtime | pure NumPy/OpenCV, CPU | PyTorch model (CPU ~0.1s/op, GPU auto) |
| Keyed security | yes (`WATERMARK_KEY`) | no (payload not signed) |

Every TrustMark embed runs a **self-check** — it immediately re-decodes the freshly watermarked image and fails loudly (`422 EMBED_NOT_RECOVERABLE`, no orphan registry row) rather than returning a "success" that could never be verified. This guards against degenerate payloads and low-texture images.

**Short-ID + registry.** Because the TrustMark payload is only 61 bits, that track embeds a random 61-bit ID and stores the full text (any length up to 2000 chars) in a SQLite registry (`static/registry.sqlite3`, `backend/src/core/registry.py`). Verification decodes the ID and looks the text back up. This is the industry-standard pattern (Digimarc/Imatag/TrustMark) and is the natural hook for C2PA soft-binding.

**Installing the deep-learning track.** It's optional — the classic track needs none of it. See `backend/requirements-dl.txt` for the exact steps (Windows/py3.13 needs `PYTHONUTF8=1` and a `--no-deps` install of `trustmark`). If the `trustmark` package isn't installed, classic requests work normally and `trustmark` requests return a clear `503 ENGINE_UNAVAILABLE`. TrustMark's model weights auto-download from Adobe's servers on first use; the registry lives in `backend/data/` (not the HTTP-served `static/`) so registered text is never publicly downloadable.

**Demo-scope limitations (not yet production-hardened).** The API has no authentication or rate limiting, and neither `static/processed/` (watermarked outputs) nor the registry has a cleanup/TTL policy — both grow unbounded, so a public deployment needs an auth layer, request limits, and a retention job before real use. The TrustMark payload is also not cryptographically signed (no forgery protection); pair it with an HMAC/signature if you need tamper-evidence.

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, OpenCV, PyWavelets, NumPy, reedsolo
- **Frontend**: React 18 (Vite), Tailwind CSS, Axios; self-hosted Geist type, light-only design system with spring-physics micro-interactions, bilingual i18n (EN / 繁中), hash-based routing with per-view SEO titles
- **Classic engine**: 2-level DWT, key-derived dither QIM (DM-QIM), Reed-Solomon, tiled redundancy with cross-tile soft voting
- **Deep-learning engine**: Adobe TrustMark (PyTorch), 61-bit ID + server-side registry

## Robustness Certificate

`POST /v1/embed` with `certify=true` runs a real attack battery on the just-embedded image (JPEG q30/q10, downscale 0.5×, 25% crop, 5° rotation, Gaussian noise), re-extracts after each via **blind detection** (no original image), and returns a per-attack survival report plus per-category status lights. This turns "will this watermark survive Instagram?" into a measured answer the user sees on-screen, instead of a whitepaper claim — the shared attack code lives in `backend/src/core/attacks.py` (also used by `benchmark.py`). The report is a **lower bound**: it reflects blind detection, so extract-with-original (which adds geometric alignment) can recover some cases the certificate marks failed — notably rotation.

The certificate is deliberately honest about the two engines' **complementary** failure modes: classic survives cropping but fails JPEG/resize; TrustMark survives JPEG/resize but fails cropping. It does **not** include diffusion-based regeneration, which defeats essentially all post-hoc watermarks — so the product never claims to be unbreakable.

## Security

The watermark's security rests entirely on a secret key. The QIM dither vector and the bit-placement permutation are derived from it via SHA-256, so only a holder of the key can read, forge, or cleanly remove the mark.

- Set the key via the `WATERMARK_KEY` environment variable before running the backend in any real deployment.
- If `WATERMARK_KEY` is unset, the system falls back to a **public** `DEFAULT_KEY` baked into the source (`backend/src/core/params.py`) and logs a prominent security warning at startup. Anyone with the repo can read/forge marks made with the demo key — never use it in production.
- Changing the key invalidates every watermark embedded with the previous key. Store it durably.

```bash
# Windows (PowerShell)
$env:WATERMARK_KEY = "your-long-random-secret"
# macOS/Linux
export WATERMARK_KEY="your-long-random-secret"
```

## Getting Started

### Prerequisites
- Python 3.11 or later
- Node.js 18 or later

### Backend Setup

```bash
cd backend
# Create and activate a virtual environment
python -m venv .venv

# On Windows
.venv\Scripts\activate
# On macOS/Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
# Run the server
python main.py
# The backend will be available at http://localhost:8000
```

### Frontend Setup

```bash
cd frontend
# Install dependencies
npm install
# Start the development server
npm run dev
# The frontend will be available at http://localhost:5173
```

## Usage

The web platform has four deep-linkable sub-pages: **Embed Watermark** (`#embed`), **Verify (Blind)** (`#verify`), **Developers** (`#developers`), and **Status** (`#status`). The browser back button works across sub-pages, and every page has its own bilingual title and description.

### Embed Watermark (`#embed`)
1.  Upload an image (PNG or JPEG, at least 128×128).
2.  Pick a usage scenario (social sharing / copyright proof) or choose the engine directly.
3.  Enter the text to embed (classic: up to **92 UTF-8 bytes**, with a live byte counter; TrustMark: up to 2000 chars stored in the server registry).
4.  Click **Embed Watermark**, review the robustness report and PSNR/SSIM metrics, then download the result. **PNG is strongly preferred** (lossless).

### Verify (Blind) (`#verify`)
1.  Upload the suspect image — no original needed.
2.  Click **Verify Watermark** to detect the mark and see confidence, watermark ID, and technical details.
    *Note: blind mode does not correct rotation or scaling.*

> The extract-with-original flow was removed from the UI; the `POST /api/v1/extract` endpoint remains available for API and CLI users who hold the original image.

### Developers (`#developers`)
Choose your path on entry: **AI agent** (one click copies a complete English integration brief covering endpoints, parameters, response schemas, the error envelope, engines, and the CLI, ready to paste into Claude, Cursor, or any coding agent) or **Documentation** (full API reference with syntax-highlighted curl / Python / JavaScript examples and an error-code table).

### Status (`#status`)
Live availability checked from your browser: overall state, per-service rows, and measured API latency, refreshed every 30 seconds.

## API Documentation

Interactive API documentation is available via Swagger UI and ReDoc when the backend is running:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Endpoints
- `GET /api/v1/health`: Liveness check (used by the in-app Status page).
- `POST /api/v1/embed`: Embeds text into an image (form fields: `file`, `text`, `engine`, `certify`).
- `POST /api/v1/extract`: Extracts a watermark by comparing against the original image (API/CLI only; not exposed in the UI).
- `POST /api/v1/verify`: Attempts to extract a watermark without the original image.

### Command-line access

Every action is a plain HTTP request, so the whole product is scriptable. The web app has a **Developers** tab with copy-paste `curl` commands, and a zero-dependency Python CLI lives in [`cli/`](cli/):

```bash
export INVISIGUARD_API=http://localhost:8000/v1
python cli/invisiguard.py embed photo.png --text "Copyright 2026" --engine classic --certify --out marked.png
python cli/invisiguard.py verify marked.png --engine classic
```

See [`cli/README.md`](cli/README.md) for all commands.

## Core Algorithm Details

The v2 scheme combines a 2-level DWT, key-derived dither QIM (DM-QIM), Reed-Solomon error correction, and full-image tiled redundancy. Parameters live in a single source of truth, `backend/src/core/params.py`.

### 1. Algorithm Parameters

```python
WAVELET       = 'haar'   # DWT wavelet (haar aligns cleanly to 4-pixel shifts)
DWT_LEVEL     = 2        # LL2 = quarter-scale low-frequency sub-band
DELTA         = 24.0     # QIM step size (quality/robustness trade-off; PSNR≈43dB, JPEG~q60)
PACKET_BYTES  = 128      # RS(128, 96): 96 data + 32 ECC → corrects up to 16 byte-errors
DATA_BYTES    = 96
MAGIC         = b'IV'    # 2-byte magic + 1-byte version + 1-byte length header
MAX_TEXT_BYTES = 92      # UTF-8 byte cap = DATA_BYTES - 4-byte header
TILE_COEFF    = 32       # 32×32 LL2 coefficients = 1024 bits = one full packet per tile
```

### 2. Watermark Embedding Pipeline

Implemented in `backend/src/core/embedding.py` (`WatermarkEmbedder.embed`) and `packet.py`.

#### a. Payload Construction
A fixed **128-byte** packet is built: `MAGIC(2) + VERSION(1) + LENGTH(1) + message(≤92 UTF-8 bytes) + zero-padding`, then Reed-Solomon encoded to append 32 ECC bytes. The 128 bytes become 1024 bits (`packet_to_bits`, MSB-first).

#### b. Color Space & DWT
Color images are converted BGR→YUV; only the Y (luminance) channel is modified. A **2-level** Haar DWT yields the LL2 approximation sub-band (¼ scale in each dimension); each LL2 coefficient aggregates a 4×4 pixel block, giving better resistance to JPEG quantization noise than a single-level transform.

#### c. Keyed Dither QIM + Tiling
LL2 is divided into 32×32-coefficient tiles; **every** tile carries a full copy of the same 1024-bit packet (tiled redundancy). Within a tile, bit `j` is written to flattened position `perm[j]`, where `perm` is a key-derived permutation. Embedding uses dither modulation:

```
offset = dither[j] + bit * DELTA/2         # dither[j] ∈ [0, DELTA) derived from the key
q      = round((c - offset) / DELTA)
c_new  = q * DELTA + offset
```

Because both `perm` and `dither` come from `WATERMARK_KEY` (SHA-256), an attacker without the key cannot locate the carrier coefficients, read the bits, or re-quantize them away cleanly.

#### d. Reconstruction
Inverse 2-level DWT rebuilds the Y-channel (cropped to the exact original size if the transform padded by a pixel), which is clipped to `[0, 255]`, merged back with the original U/V, and saved as PNG.

### 3. Watermark Extraction Pipeline

Implemented in `backend/src/core/extraction.py` (`WatermarkExtractor.extract`). Extraction never returns an error string — failure raises `WatermarkNotFoundError` (this closed the v1 bug where blind verification reported success on any image).

1.  **Candidate search**: cropping shifts the DWT grid, so extraction tries pixel-phase offsets `(dx, dy) ∈ 0..3` (`search="phase"`) and, in `search="full"`, also LL2 tile-origin offsets `0..31`, stopping at the first success. `(0,0)` is tried first.
2.  **Soft demodulation**: for each candidate, per bit `j`, `r = (c − dither[j]) mod DELTA`; the distances to 0 and DELTA/2 give a hard bit plus a signed soft margin.
3.  **Cross-tile fusion**: margins are summed across all tiles and the fused bits are RS-decoded first; if that fails, each tile is decoded individually (any one intact tile suffices).
4.  **Result**: on success returns the text plus diagnostics (`confidence`, `tiles_decoded/tiles_total`, `vote_agreement`, `phase`, `origin`).

## Performance Metrics

Measured by `backend/benchmark.py` on synthetic images (gradient + noise + saturated top band) at `DELTA=24`, 3 seeds:

- **Visual Quality**: PSNR ≈ 43 dB, SSIM ≈ 0.99.
- **Capacity**: up to 92 UTF-8 bytes (92 ASCII / ~30 CJK characters).
- **JPEG**: 100% recovery at q90–q60; drops off at q50.
- **Cropping**: 100% recovery for bottom-right crop (10%/25%) and top-left crop (128px) — tiling makes it edge-agnostic.
- **Additive noise**: survives Gaussian noise σ=2 and σ=5.

Run it yourself:
```bash
cd backend
python benchmark.py --seeds 3 --out benchmark_report.md
python -m pytest tests            # 50 tests (unit + integration + regression)
```

## Limitations

- **Geometric attacks**: blind verification does **not** handle rotation or scaling (the extraction search compensates only sub-4px translation and tile-origin offsets). The extract-with-original path attempts ORB alignment first but resampling still degrades the mark.
- **Heavy compression / resampling**: JPEG below ~q50, downscaling, and low-pass (blur) attacks overwrite the low-frequency carrier and are not recoverable.
- **Generative edits**: like all post-hoc watermarks, diffusion-based re-generation can remove it — treat robustness as "raises the cost of removal," not a guarantee.
- **Not cryptographic provenance**: the payload is not signed. Anyone with the key can also forge marks; for tamper-evidence you would add an HMAC/signature over the payload.

## Deployment

A single-origin `Dockerfile` at the repo root builds the frontend and serves it together with the API on one port (the server resolves `PORT` / `WEB_PORT` from the environment in-process, so platform start-command overrides cannot break it). For any real deployment set `WATERMARK_KEY` (required; see [Security](#security)) and `CORS_ORIGINS`, and mount persistent volumes at `backend/data/` (registry) and `backend/static/processed/` (watermarked outputs).

## License

This project is licensed under the MIT License.
