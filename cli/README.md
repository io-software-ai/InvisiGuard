# InvisiGuard CLI

Send watermark requests to the InvisiGuard API from the terminal. No browser, no dependencies.

`invisiguard.py` is a zero-dependency Python 3.8+ client (standard library only). It talks to the same HTTP API the web app uses, so anyone can automate embed and verify from scripts, CI, or the command line.

## Setup

```bash
# Point at your API. Deployed:
export INVISIGUARD_API=https://invisiguard.iosoftware.ai/api/v1
# ...or local development:
export INVISIGUARD_API=http://localhost:8000/v1
```

You can also pass `--base <url>` on any command instead of the environment variable.

## Commands

```bash
# Is the API up?
python invisiguard.py health

# Embed a watermark (classic engine) and download the result, with a robustness report
python invisiguard.py embed photo.png \
    --text "Copyright 2026 ACME" --engine classic --certify --out marked.png

# Embed with the deep-learning engine (short ID + server registry)
python invisiguard.py embed photo.png --text "Copyright 2026 ACME" --engine trustmark --out marked.png

# Blind-verify a suspect image
python invisiguard.py verify marked.png --engine classic
```

Every command prints the API's JSON response to stdout, so it composes with `jq`, pipes, and scripts:

```bash
python invisiguard.py verify marked.png --engine classic | jq '.data.verified'
```

## Options

| Flag | Applies to | Meaning |
|------|-----------|---------|
| `--base URL` | all | API base URL (overrides `INVISIGUARD_API`) |
| `--text` | embed | watermark text (required) |
| `--engine classic\|trustmark` | embed / verify | which engine (default `classic`) |
| `--certify` | embed | also return the measured robustness report |
| `--out PATH` | embed | download the watermarked PNG to `PATH` |

## Raw HTTP (curl)

The CLI is a thin wrapper; any HTTP client works. See the **Developers** tab in the web app for copy-paste `curl` commands, or:

```bash
BASE=http://localhost:8000/v1
curl -X POST "$BASE/embed" \
  -F "file=@photo.png;type=image/png" \
  -F "text=Copyright 2026" -F "engine=classic" -F "certify=true"
```

Exit code is `0` on a 2xx response, `1` on an API error, `2` if the server is unreachable.
