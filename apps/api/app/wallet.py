"""Google Wallet loyalty passes.

One class per store (`{issuer}.sufra_loyalty`) describes the card design, and one
object per member card (`{issuer}.card_{id}`) holds the guest's live points. The
guest saves the pass through a signed "Add to Google Wallet" link, and later
stamp/redemption changes are pushed onto the saved object.

This module is deliberately primitive: it takes plain values, imports nothing
from the rest of the app, and reports itself disabled whenever the issuer id or
the service account key is missing, so loyalty keeps working unchanged.

In demo mode only accounts listed as test accounts (or admins/developers on the
issuer) can save a pass — see the Wallet console, not this code.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API_ROOT = "https://walletobjects.googleapis.com/walletobjects/v1"
SAVE_ROOT = "https://pay.google.com/gp/v/save/"

CLASS_SUFFIX = "sufra_loyalty"
LOGO_PATH = "sufra-logo.png"

_token_cache: dict = {"value": None, "expires_at": 0.0}


class WalletError(Exception):
    """Google rejected the call; the caller turns this into a 502."""


def _service_account() -> dict | None:
    raw = os.environ.get("GOOGLE_WALLET_SERVICE_ACCOUNT", "").strip()
    if not raw:
        return None
    try:
        info = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not info.get("client_email") or not info.get("private_key"):
        return None
    return info


def _logo_url() -> str:
    explicit = os.environ.get("GOOGLE_WALLET_LOGO_URL", "").strip()
    if explicit:
        return explicit
    # Google fetches the logo itself, so it needs a public URL. In the sandbox the
    # only public origin is the preview host that serves the web app's /public.
    suffix = os.environ.get("BASE44_PUBLIC_HOST_SUFFIX", "").strip()
    return f"https://3000-{suffix}/{LOGO_PATH}" if suffix else ""


def config() -> dict | None:
    """Everything the pass needs, or None when the integration is not set up."""
    issuer = os.environ.get("GOOGLE_WALLET_ISSUER_ID", "").strip()
    info = _service_account()
    logo = _logo_url()
    if not issuer or info is None or not logo:
        return None
    return {"issuer": issuer, "info": info, "logo": logo}


def enabled() -> bool:
    return config() is not None


def class_id(cfg: dict) -> str:
    return f"{cfg['issuer']}.{CLASS_SUFFIX}"


def object_id(cfg: dict, card_id: int) -> str:
    return f"{cfg['issuer']}.card_{card_id}"


def _access_token(cfg: dict) -> str:
    now = time.time()
    if _token_cache["value"] and _token_cache["expires_at"] > now + 60:
        return _token_cache["value"]

    info = cfg["info"]
    issued = int(now)
    assertion = jwt.encode(
        {
            "iss": info["client_email"],
            "scope": SCOPE,
            "aud": TOKEN_URL,
            "iat": issued,
            "exp": issued + 3600,
        },
        info["private_key"],
        algorithm="RS256",
    )
    body = urllib.parse.urlencode(
        {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion,
        }
    ).encode()
    request = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raise WalletError(f"Google refused the service account key ({error.code}).")
    except (urllib.error.URLError, TimeoutError) as error:
        raise WalletError(f"Could not reach Google: {error}")

    _token_cache["value"] = payload["access_token"]
    _token_cache["expires_at"] = now + int(payload.get("expires_in", 3600))
    return _token_cache["value"]


def _call(cfg: dict, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{API_ROOT}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {_access_token(cfg)}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return error.code, {"raw": raw}
    except (urllib.error.URLError, TimeoutError) as error:
        raise WalletError(f"Could not reach Google: {error}")


def _class_payload(cfg: dict, store_name: str, accent: str) -> dict:
    return {
        "id": class_id(cfg),
        "issuerName": store_name,
        "programName": store_name,
        "programLogo": {"sourceUri": {"uri": cfg["logo"]}},
        "hexBackgroundColor": accent or "#0A84FF",
        # DRAFT keeps the class unsubmitted: demo mode until publishing access.
        "reviewStatus": "DRAFT",
    }


def _object_payload(
    cfg: dict,
    *,
    card_id: int,
    customer_id: int,
    customer_name: str,
    points: int,
    stamps: int,
    target: int,
    reward: str,
) -> dict:
    return {
        "id": object_id(cfg, card_id),
        "classId": class_id(cfg),
        "state": "ACTIVE",
        "accountId": str(customer_id),
        "accountName": customer_name,
        "barcode": {
            "type": "QR_CODE",
            "value": f"sufra-{customer_id}",
            "alternateText": str(customer_id),
        },
        "loyaltyPoints": {"label": "POINTS", "balance": {"int": int(points)}},
        "textModulesData": [
            {"id": "stamps", "header": "STAMPS", "body": f"{stamps}/{target}"},
            {"id": "reward", "header": "REWARD", "body": reward},
        ],
    }


def ensure_class(cfg: dict, store_name: str, accent: str) -> None:
    """Create the store's pass class once; later calls are a cheap GET."""
    status, _ = _call(cfg, "GET", f"/loyaltyClass/{class_id(cfg)}")
    if status == 200:
        return
    status, payload = _call(
        cfg, "POST", "/loyaltyClass", _class_payload(cfg, store_name, accent)
    )
    if status >= 400:
        message = payload.get("error", {}).get("message") or payload
        raise WalletError(f"Google rejected the pass class: {message}")


def save_url(cfg: dict, **pass_data) -> str:
    """Signed "Add to Google Wallet" link for one member card.

    The object travels inside the token, so the guest's first save works even
    though nothing was stored on Google's side beforehand.
    """
    claims = {
        "iss": cfg["info"]["client_email"],
        "aud": "google",
        "typ": "savetowallet",
        "iat": int(time.time()),
        "payload": {"loyaltyObjects": [_object_payload(cfg, **pass_data)]},
    }
    token = jwt.encode(claims, cfg["info"]["private_key"], algorithm="RS256")
    return SAVE_ROOT + token


def push_object(cfg: dict, **pass_data) -> None:
    """Push the current points/stamps onto a pass the guest already saved.

    A guest who never saved the pass has no object on Google's side, so a 404 is
    the normal case, not an error.
    """
    payload = _object_payload(cfg, **pass_data)
    status, body = _call(cfg, "PATCH", f"/loyaltyObject/{payload['id']}", payload)
    if status == 404:
        return
    if status >= 400:
        message = body.get("error", {}).get("message") or body
        raise WalletError(f"Google rejected the pass update: {message}")
