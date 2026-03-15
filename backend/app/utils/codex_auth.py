"""
OpenAI Codex OAuth Authentication

Implements the same OAuth 2.0 Authorization Code + PKCE flow used by the
official Codex CLI. Uses the access_token directly against the ChatGPT
backend-api/codex endpoint (the token lacks platform API scopes, so it
cannot be used with api.openai.com/v1).

Token storage: ~/.mirofish/codex_auth.json
"""

import base64
import hashlib
import json
import os
import secrets
import threading
import webbrowser
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional, Dict, Any
from urllib.parse import urlencode, urlparse, parse_qs

import requests

# --- Constants (from openai/codex source: codex-rs/core/src/auth.rs) ---
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
AUTH_BASE = "https://auth.openai.com"
AUTHORIZE_URL = f"{AUTH_BASE}/oauth/authorize"
TOKEN_URL = f"{AUTH_BASE}/oauth/token"
REDIRECT_PORT = 1455
REDIRECT_URI = f"http://localhost:{REDIRECT_PORT}/auth/callback"
SCOPES = "openid profile email offline_access"
TOKEN_REFRESH_DAYS = 8

# Codex API endpoint (NOT api.openai.com — the OAuth token lacks platform scopes)
CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"

# Storage location
AUTH_DIR = os.path.expanduser("~/.mirofish")
AUTH_FILE = os.path.join(AUTH_DIR, "codex_auth.json")


def _b64url_encode(data: bytes) -> str:
    """URL-safe base64 encode without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _generate_pkce() -> tuple[str, str]:
    """Generate PKCE code_verifier and code_challenge (S256)."""
    verifier_bytes = secrets.token_bytes(64)
    code_verifier = _b64url_encode(verifier_bytes)
    challenge_digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = _b64url_encode(challenge_digest)
    return code_verifier, code_challenge


def _decode_jwt_payload(token: str) -> Dict[str, Any]:
    """Decode the payload of a JWT without verification (we trust OpenAI's issuer)."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")
    payload = parts[1]
    # Add padding
    padding = 4 - len(payload) % 4
    if padding != 4:
        payload += "=" * padding
    return json.loads(base64.urlsafe_b64decode(payload))


def _load_stored_auth() -> Optional[Dict[str, Any]]:
    """Load stored auth data from disk."""
    if not os.path.exists(AUTH_FILE):
        return None
    with open(AUTH_FILE, "r") as f:
        return json.load(f)


def _save_auth(data: Dict[str, Any]) -> None:
    """Save auth data to disk."""
    os.makedirs(AUTH_DIR, exist_ok=True)
    with open(AUTH_FILE, "w") as f:
        json.dump(data, f, indent=2)
    # Restrict permissions to owner only
    os.chmod(AUTH_FILE, 0o600)


def _exchange_code_for_tokens(code: str, code_verifier: str) -> Dict[str, Any]:
    """Exchange authorization code for tokens."""
    resp = requests.post(TOKEN_URL, data={
        "client_id": CLIENT_ID,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier,
    })
    resp.raise_for_status()
    return resp.json()


def _refresh_tokens(refresh_token: str) -> Dict[str, Any]:
    """Refresh OAuth tokens using a refresh token."""
    resp = requests.post(TOKEN_URL, data={
        "client_id": CLIENT_ID,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })
    resp.raise_for_status()
    return resp.json()


class _OAuthCallbackHandler(BaseHTTPRequestHandler):
    """HTTP handler that captures the OAuth callback."""

    auth_code: Optional[str] = None
    error: Optional[str] = None
    expected_state: Optional[str] = None

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/auth/callback":
            params = parse_qs(parsed.query)
            # Validate state parameter to prevent CSRF
            returned_state = params.get("state", [None])[0]
            if returned_state != _OAuthCallbackHandler.expected_state:
                _OAuthCallbackHandler.error = "state_mismatch"
                self._respond(400, "Login failed: state parameter mismatch")
            elif "code" in params:
                _OAuthCallbackHandler.auth_code = params["code"][0]
                self._respond(200, "Login successful! You can close this tab and return to the terminal.")
            else:
                _OAuthCallbackHandler.error = params.get("error", ["unknown"])[0]
                self._respond(400, f"Login failed: {_OAuthCallbackHandler.error}")
        else:
            self._respond(404, "Not found")

    def _respond(self, status: int, message: str):
        self.send_response(status)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        html = f"<html><body><h2>{message}</h2></body></html>"
        self.wfile.write(html.encode())

    def log_message(self, format, *args):
        # Suppress default request logging
        pass


def login() -> Dict[str, Any]:
    """
    Run the full OAuth browser login flow.

    Opens the user's browser to OpenAI's auth page, waits for the callback,
    exchanges for tokens, and stores everything to disk.

    Returns the auth data dict.
    """
    code_verifier, code_challenge = _generate_pkce()
    state = secrets.token_urlsafe(32)

    # Build authorization URL
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "id_token_add_organizations": "true",
        "codex_cli_simplified_flow": "true",
    }
    auth_url = f"{AUTHORIZE_URL}?{urlencode(params)}"

    # Reset handler state
    _OAuthCallbackHandler.auth_code = None
    _OAuthCallbackHandler.error = None
    _OAuthCallbackHandler.expected_state = state

    # Start local server to receive callback
    server = HTTPServer(("localhost", REDIRECT_PORT), _OAuthCallbackHandler)
    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    print("Opening browser for OpenAI login...")
    print(f"If the browser doesn't open, visit:\n{auth_url}\n")
    webbrowser.open(auth_url)

    # Wait for callback (timeout after 120 seconds)
    server_thread.join(timeout=120)
    server.server_close()

    if _OAuthCallbackHandler.error:
        raise RuntimeError(f"OAuth login failed: {_OAuthCallbackHandler.error}")
    if not _OAuthCallbackHandler.auth_code:
        raise RuntimeError("OAuth login timed out — no callback received within 120 seconds")

    print("Received authorization code, exchanging for tokens...")
    tokens = _exchange_code_for_tokens(_OAuthCallbackHandler.auth_code, code_verifier)

    id_token = tokens["id_token"]
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # Extract account_id from id_token claims
    claims = _decode_jwt_payload(id_token)
    auth_claims = claims.get("https://api.openai.com/auth", {})
    account_id = auth_claims.get("chatgpt_account_id", "")

    auth_data = {
        "auth_mode": "codex",
        "tokens": {
            "id_token": id_token,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "account_id": account_id,
        },
        "last_refresh": datetime.now(timezone.utc).isoformat(),
    }
    _save_auth(auth_data)
    print(f"Codex authentication saved to {AUTH_FILE}")
    return auth_data


def refresh_if_needed(auth_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Check if stored tokens are stale and refresh if needed.

    Returns the (possibly refreshed) auth data.
    """
    if auth_data is None:
        auth_data = _load_stored_auth()
    if auth_data is None:
        raise RuntimeError(
            "No Codex auth found. Run 'python3 backend/scripts/codex_login.py' first."
        )

    last_refresh = datetime.fromisoformat(auth_data["last_refresh"])
    age_days = (datetime.now(timezone.utc) - last_refresh).days

    if age_days < TOKEN_REFRESH_DAYS:
        return auth_data

    print("Codex tokens are stale, refreshing...")
    old_refresh_token = auth_data["tokens"]["refresh_token"]

    new_tokens = _refresh_tokens(old_refresh_token)

    new_id_token = new_tokens["id_token"]
    claims = _decode_jwt_payload(new_id_token)
    auth_claims = claims.get("https://api.openai.com/auth", {})

    auth_data["tokens"] = {
        "id_token": new_id_token,
        "access_token": new_tokens["access_token"],
        "refresh_token": new_tokens.get("refresh_token", old_refresh_token),
        "account_id": auth_claims.get("chatgpt_account_id", auth_data["tokens"].get("account_id", "")),
    }
    auth_data["last_refresh"] = datetime.now(timezone.utc).isoformat()
    _save_auth(auth_data)
    print("Codex tokens refreshed successfully.")
    return auth_data


def get_credentials() -> Dict[str, str]:
    """
    Get valid Codex credentials (access_token + account_id).

    Automatically refreshes tokens if they are stale.
    Raises RuntimeError if not logged in.

    Returns dict with keys: access_token, account_id, base_url
    """
    auth_data = _load_stored_auth()
    if auth_data is None:
        raise RuntimeError(
            "No Codex auth found. Run 'python3 backend/scripts/codex_login.py' first."
        )
    auth_data = refresh_if_needed(auth_data)
    return {
        "access_token": auth_data["tokens"]["access_token"],
        "account_id": auth_data["tokens"]["account_id"],
        "base_url": CODEX_BASE_URL,
    }


def is_logged_in() -> bool:
    """Check if Codex auth credentials exist on disk."""
    return os.path.exists(AUTH_FILE)


def logout() -> None:
    """Remove stored Codex auth credentials."""
    if os.path.exists(AUTH_FILE):
        os.remove(AUTH_FILE)
        print(f"Removed {AUTH_FILE}")
    else:
        print("No Codex auth found.")
