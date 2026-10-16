"""Read-only gated-weight access check. Never print tokens or signed redirects."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

MODEL = "facebook/dinov3-vitl16-pretrain-lvd1689m"
REVISION = "ea8dc2863c51be0a264bab82070e3e8836b02d51"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def access_check(token, opener=None):
    if not token or not re.fullmatch(r"hf_[A-Za-z0-9]+", token):
        raise ValueError("HF_TOKEN_MISSING_OR_INVALID_FORMAT")
    opener = opener or build_opener(NoRedirect())
    base = f"https://huggingface.co/{MODEL}/resolve/{REVISION}/"
    receipts = {}
    for name in ("config.json", "preprocessor_config.json", "model.safetensors"):
        # Only the known HF origin receives Authorization. Do not follow the
        # redirect to a CDN or download a multi-GB checkpoint during preflight.
        request = Request(base + name, method="HEAD", headers={
            "Authorization": "Bearer " + token,
            "User-Agent": "WORLDIFACT-HF-access-preflight",
        })
        try:
            response = opener.open(request, timeout=30)
        except HTTPError as error:
            if error.code not in (301, 302, 303, 307, 308):
                raise ValueError(f"HF_ACCESS_HTTP_{error.code}") from None
            response = error
        with response:
            headers = response.headers
            if headers.get("x-repo-commit") != REVISION:
                raise ValueError("HF_MODEL_REVISION_NOT_VERIFIED")
            etag = (headers.get("x-linked-etag") or headers.get("etag") or "").strip('"')
            size = headers.get("x-linked-size") or headers.get("content-length")
            if not re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", etag):
                raise ValueError("HF_FILE_IDENTITY_NOT_VERIFIED")
            if name == "model.safetensors" and (len(etag) != 64 or not size or int(size) < 1_000_000_000):
                raise ValueError("HF_VITL_WEIGHTS_NOT_VERIFIED")
            receipts[name] = {"etag": etag, "bytes": int(size) if size else None}
    return {
        "status": "GATED_FILE_ACCESS_VERIFIED",
        "model": MODEL,
        "revision": REVISION,
        "files": receipts,
        "weightsDownloaded": False,
        "cudaTested": False,
        "gpuStarted": False,
    }


def main():
    try:
        report = access_check(os.environ.get("HF_TOKEN", "").strip())
        output = Path("runpod-hf-access-proof.json")
        output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, separators=(",", ":")))
    except Exception as error:
        # Never expose exception bodies/URLs: errors can contain signed URLs.
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r"HF_[A-Z0-9_]+", str(error)) else "HF_ACCESS_CHECK_FAILED"
        print(code, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
