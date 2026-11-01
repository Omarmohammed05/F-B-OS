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

import base64
import binascii
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
LOGO_PATH = "sufra-wallet-badge.png"
# Pattern art for the pass face (a 1032x336 band) and the details view (a square
# ornament tile), served from the web app's public folder.
HERO_PATH = "sufra-wallet-hero.png"
PATTERN_PATH = "sufra-wallet-pattern.png"

# Premium gold field for the pass header; the ornament badge and the Arabic
# modules sit on it.
GOLD = "#A8842F"

_token_cache: dict = {"value": None, "expires_at": 0.0}


class WalletError(Exception):
    """Google rejected the call; the caller turns this into a 502."""


def _service_account() -> dict | None:
    """The key file, however it survived the trip through an env var.

    Accepted as raw JSON, as one base64 line of the same JSON (an env file cannot
    mangle a single line), or as JSON an env file wrapped in quotes.
    """
    raw = os.environ.get("GOOGLE_WALLET_SERVICE_ACCOUNT", "").strip()
    if not raw:
        return None

    candidates: list[str] = [raw]
    try:
        candidates.append(base64.b64decode(raw, validate=True).decode())
    except (binascii.Error, ValueError, UnicodeDecodeError):
        pass

    info = None
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except json.JSONDecodeError:
                continue
        if isinstance(parsed, dict):
            info = parsed
            break

    if info is None or not info.get("client_email") or not info.get("private_key"):
        return None
    return info


def _asset_url(name: str) -> str:
    # Google fetches pass images itself, so they need a public URL. In the sandbox
    # the only public origin is the preview host that serves the web app's /public.
    suffix = os.environ.get("BASE44_PUBLIC_HOST_SUFFIX", "").strip()
    return f"https://3000-{suffix}/{name}" if suffix else ""


def _logo_url() -> str:
    explicit = os.environ.get("GOOGLE_WALLET_LOGO_URL", "").strip()
    return explicit or _asset_url(LOGO_PATH)


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


def problem() -> str | None:
    """One line naming what is missing, for the startup log. Never the value."""
    if not os.environ.get("GOOGLE_WALLET_ISSUER_ID", "").strip():
        return "GOOGLE_WALLET_ISSUER_ID is empty"
    if _service_account() is None:
        return (
            "GOOGLE_WALLET_SERVICE_ACCOUNT is not the service account key JSON "
            "(an email address or another value was supplied)"
        )
    if not _logo_url():
        return "no public logo (set GOOGLE_WALLET_LOGO_URL or BASE44_PUBLIC_HOST_SUFFIX)"
    return None


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


def _class_design(cfg: dict, store_name: str) -> dict:
    """The part of the class this module owns: gold field, pattern art, Arabic type.

    Kept apart from the creation payload so a later PATCH can restyle an existing
    class without touching its review status.
    """
    design = {
        "issuerName": store_name,
        "programName": store_name,
        "programLogo": {"sourceUri": {"uri": cfg["logo"]}},
        "hexBackgroundColor": GOLD,
    }

    hero = _asset_url(HERO_PATH)
    if hero:
        design["heroImage"] = {
            "sourceUri": {"uri": hero},
            "contentDescription": {
                "defaultValue": {"language": "ar", "value": "نقش هندسي ذهبي"}
            },
        }

    pattern = _asset_url(PATTERN_PATH)
    if pattern:
        design["imageModulesData"] = [
            {
                "id": "ornament",
                "mainImage": {
                    "sourceUri": {"uri": pattern},
                    "contentDescription": {
                        "defaultValue": {"language": "ar", "value": "زخرفة خاتم"}
                    },
                },
            }
        ]

    return design


def _object_payload(
    cfg: dict,
    *,
    card_id: int,
    customer_token: str,
    customer_name: str,
    points: int,
    stamps: int,
    target: int,
    reward: str,
) -> dict:
    # The pass carries an opaque 32-hex handle, never the customer's row id: a
    # printed barcode must not enumerate the guest book. It also carries no
    # phone number or email — a pass is a public object on the guest's phone.
    return {
        "id": object_id(cfg, card_id),
        "classId": class_id(cfg),
        "state": "ACTIVE",
        "accountId": customer_token,
        "accountName": customer_name,
        "barcode": {
            "type": "QR_CODE",
            "value": f"sufra-{customer_token}",
            "alternateText": customer_token[:8].upper(),
        },
        "loyaltyPoints": {"label": "نقاط", "balance": {"int": int(points)}},
        "textModulesData": [
            {"id": "stamps", "header": "الأختام", "body": f"{stamps}/{target}"},
            {"id": "reward", "header": "المكافأة", "body": reward},
        ],
    }


def _submit_class(cfg: dict) -> None:
    """Submit the class for review.

    A draft class takes no objects — Google answers "Wallet Object Class ... not
    approved" and the guest's save fails with a generic error. Submitting is a
    reviewStatus change to UNDER_REVIEW; an issuer in test mode is approved
    immediately, a live one waits for Google's review.
    """
    status, body = _call(
        cfg,
        "PATCH",
        f"/loyaltyClass/{class_id(cfg)}",
        {"reviewStatus": "UNDER_REVIEW"},
    )
    if status >= 400:
        message = body.get("error", {}).get("message") or body
        raise WalletError(f"Google rejected the class submission: {message}")


def _image_uri(holder: dict | None) -> str | None:
    return ((holder or {}).get("sourceUri") or {}).get("uri")


def _design_is_current(body: dict, design: dict) -> bool:
    """Whether Google already carries exactly this design."""
    have_bg = (body.get("hexBackgroundColor") or "").lower()
    if have_bg != design["hexBackgroundColor"].lower():
        return False
    for field in ("issuerName", "programName"):
        if body.get(field) != design[field]:
            return False
    for field in ("programLogo", "heroImage"):
        if _image_uri(body.get(field)) != _image_uri(design.get(field)):
            return False

    def module_uris(mods: list) -> list:
        return [_image_uri(module.get("mainImage")) for module in mods]

    return module_uris(body.get("imageModulesData") or []) == module_uris(
        design.get("imageModulesData") or []
    )


def ensure_class(cfg: dict, store_name: str) -> None:
    """Create the store's class if needed, give it the design, and make it saveable.

    Google refuses a design PATCH on an approved class unless the same call sends
    it back for review, so a shipped restyle is applied the next time a guest asks
    for a save link: the class only goes through review when the design actually
    changed, and a test-mode issuer is re-approved immediately.
    """
    status, body = _call(cfg, "GET", f"/loyaltyClass/{class_id(cfg)}")
    design = _class_design(cfg, store_name)

    if status != 200:
        status, body = _call(
            cfg,
            "POST",
            "/loyaltyClass",
            {"id": class_id(cfg), **design, "reviewStatus": "DRAFT"},
        )
        if status >= 400:
            message = body.get("error", {}).get("message") or body
            raise WalletError(f"Google rejected the pass class: {message}")
        _submit_class(cfg)
        return

    if _design_is_current(body, design) and body.get("reviewStatus") != "draft":
        return

    status, payload = _call(
        cfg,
        "PATCH",
        f"/loyaltyClass/{class_id(cfg)}",
        {**design, "reviewStatus": "UNDER_REVIEW"},
    )
    if status >= 400:
        message = payload.get("error", {}).get("message") or payload
        raise WalletError(f"Google rejected the pass design: {message}")


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
