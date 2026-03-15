"""
Helpers for creating OpenAI clients that work in both api_key and codex modes.

Services that create their own OpenAI() client should use create_openai_client()
instead of instantiating OpenAI directly.
"""

from typing import Optional
from openai import OpenAI
from ..config import Config


def create_openai_client(
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> tuple[OpenAI, bool]:
    """
    Create an OpenAI client configured for the active auth mode.

    Returns (client, is_codex_mode) so callers know which API to use.
    """
    if (not api_key) and Config.LLM_AUTH_MODE == 'codex':
        from .codex_auth import get_credentials
        creds = get_credentials()
        client = OpenAI(
            api_key=creds["access_token"],
            base_url=creds["base_url"],
            default_headers={
                "ChatGPT-Account-Id": creds["account_id"],
            },
        )
        return client, True

    resolved_key = api_key or Config.get_llm_api_key()
    resolved_url = base_url or Config.LLM_BASE_URL
    client = OpenAI(api_key=resolved_key, base_url=resolved_url)
    return client, False
