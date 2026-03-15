#!/usr/bin/env python3
"""
Codex OAuth Login Script

Authenticates with OpenAI via browser OAuth to use the ChatGPT
backend-api/codex endpoint through your subscription (Plus/Pro).

Usage:
    python3 backend/scripts/codex_login.py           # Login
    python3 backend/scripts/codex_login.py --status   # Check status
    python3 backend/scripts/codex_login.py --logout   # Remove credentials
"""

import argparse
import importlib.util
import sys
import os

# Import codex_auth directly by file path to avoid triggering
# backend/app/__init__.py (which requires Flask).
_codex_auth_path = os.path.join(os.path.dirname(__file__), "../app/utils/codex_auth.py")
_spec = importlib.util.spec_from_file_location("codex_auth", _codex_auth_path)
codex_auth = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(codex_auth)

login = codex_auth.login
logout = codex_auth.logout
is_logged_in = codex_auth.is_logged_in
get_credentials = codex_auth.get_credentials
AUTH_FILE = codex_auth.AUTH_FILE


def main():
    parser = argparse.ArgumentParser(description="Codex OAuth login for MiroFish")
    parser.add_argument("--status", action="store_true", help="Check login status")
    parser.add_argument("--logout", action="store_true", help="Remove stored credentials")
    args = parser.parse_args()

    if args.logout:
        logout()
        return

    if args.status:
        if is_logged_in():
            try:
                creds = get_credentials()
                token = creds["access_token"]
                masked = token[:12] + "..." + token[-4:] if len(token) > 16 else "***"
                print(f"Logged in via Codex OAuth")
                print(f"Account ID: {creds['account_id']}")
                print(f"Access token: {masked}")
                print(f"Base URL: {creds['base_url']}")
                print(f"Auth file: {AUTH_FILE}")
            except Exception as e:
                print(f"Auth file exists but may be invalid: {e}")
        else:
            print("Not logged in. Run without --status to login.")
        return

    print("=== MiroFish Codex OAuth Login ===")
    print("This will open your browser to sign in with your OpenAI/ChatGPT account.")
    print("Your ChatGPT subscription (Plus/Pro) will be used for API billing.\n")

    try:
        auth_data = login()
        account_id = auth_data["tokens"]["account_id"]
        print(f"\nSuccess! Account ID: {account_id}")
        print(f"\nTo use Codex auth, set in your .env:")
        print(f"  LLM_AUTH_MODE=codex")
    except Exception as e:
        print(f"\nLogin failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
