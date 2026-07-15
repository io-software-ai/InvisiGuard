#!/usr/bin/env python3
"""
InvisiGuard command-line client: send watermark requests from the terminal.

Zero dependencies (Python 3.8+ stdlib only). Talks to the same HTTP API the web app uses.

Examples:
    export INVISIGUARD_API=http://localhost:8000/v1        # or the deployed API base
    python invisiguard.py health
    python invisiguard.py embed photo.png --text "Copyright 2026" --engine classic --certify --out marked.png
    python invisiguard.py verify marked.png --engine classic
"""
import argparse
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from urllib.parse import urlsplit

DEFAULT_BASE = os.environ.get("INVISIGUARD_API", "https://invisiguard.iosoftware.ai/api/v1")


def _encode_multipart(fields, files):
    boundary = uuid.uuid4().hex
    body = bytearray()
    for name, value in fields.items():
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'
                 f'{value}\r\n').encode("utf-8")
    for name, path in files.items():
        with open(path, "rb") as fh:
            data = fh.read()
        filename = os.path.basename(path)
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
                 f'filename="{filename}"\r\nContent-Type: {ctype}\r\n\r\n').encode("utf-8")
        body += data + b"\r\n"
    body += f"--{boundary}--\r\n".encode("utf-8")
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def _request(method, url, body=None, content_type=None):
    req = urllib.request.Request(url, data=body, method=method)
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {"error": str(e)}
    except urllib.error.URLError as e:
        print(f"error: could not reach {url}: {e.reason}", file=sys.stderr)
        sys.exit(2)


def _post_form(base, endpoint, fields, files):
    body, ctype = _encode_multipart(fields, files)
    return _request("POST", f"{base}/{endpoint}", body, ctype)


def _print(status, data):
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0 if 200 <= status < 300 else 1


def _download(base, image_url, out_path):
    # image_url is a server-absolute path like /static/processed/xxx.png
    parts = urlsplit(base)
    host_root = f"{parts.scheme}://{parts.netloc}"
    url = host_root + image_url
    with urllib.request.urlopen(url, timeout=120) as resp, open(out_path, "wb") as fh:
        fh.write(resp.read())
    print(f"saved watermarked image -> {out_path}", file=sys.stderr)


def cmd_health(args):
    status, data = _request("GET", f"{args.base}/health")
    return _print(status, data)


def cmd_embed(args):
    fields = {"text": args.text, "engine": args.engine, "certify": "true" if args.certify else "false"}
    status, data = _post_form(args.base, "embed", fields, {"file": args.image})
    rc = _print(status, data)
    if rc == 0 and args.out and data.get("data", {}).get("image_url"):
        _download(args.base, data["data"]["image_url"], args.out)
    return rc


def cmd_verify(args):
    status, data = _post_form(args.base, "verify", {"engine": args.engine}, {"image": args.image})
    return _print(status, data)


def main(argv=None):
    p = argparse.ArgumentParser(prog="invisiguard", description="InvisiGuard command-line client")
    p.add_argument("--base", default=DEFAULT_BASE, help=f"API base URL (default: {DEFAULT_BASE})")
    sub = p.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("health", help="check the API is up")
    sp.set_defaults(func=cmd_health)

    sp = sub.add_parser("embed", help="embed a watermark into an image")
    sp.add_argument("image", help="path to the image to protect")
    sp.add_argument("--text", required=True, help="watermark text")
    sp.add_argument("--engine", choices=["classic", "trustmark"], default="classic")
    sp.add_argument("--certify", action="store_true", help="also return the robustness report")
    sp.add_argument("--out", help="download the watermarked PNG to this path")
    sp.set_defaults(func=cmd_embed)

    sp = sub.add_parser("verify", help="blind-verify a suspect image")
    sp.add_argument("image", help="path to the suspect image")
    sp.add_argument("--engine", choices=["classic", "trustmark"], default="classic")
    sp.set_defaults(func=cmd_verify)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
