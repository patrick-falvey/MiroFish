"""
LLM Client Wrapper
Unified interface using OpenAI format

Supports two auth modes:
  - api_key: standard OpenAI API key → Chat Completions on api.openai.com/v1
  - codex: ChatGPT OAuth token → Responses API on chatgpt.com/backend-api/codex
"""

import json
import re
from typing import Optional, Dict, Any, List
from openai import OpenAI, BadRequestError

from ..config import Config


class LLMClient:
    """LLM Client"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None
    ):
        self.model = model or Config.LLM_MODEL_NAME
        self._codex_mode = (not api_key) and Config.LLM_AUTH_MODE == 'codex'

        if self._codex_mode:
            from .codex_auth import get_credentials
            creds = get_credentials()
            self.api_key = creds["access_token"]
            self.base_url = creds["base_url"]
            self._codex_account_id = creds["account_id"]
            self.client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                default_headers={
                    "ChatGPT-Account-Id": self._codex_account_id,
                },
            )
        else:
            self.api_key = api_key or Config.get_llm_api_key()
            self.base_url = base_url or Config.LLM_BASE_URL
            self._codex_account_id = None
            self.client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
            )

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[Dict] = None
    ) -> str:
        """
        Send a chat request

        Args:
            messages: List of messages
            temperature: Temperature parameter
            max_tokens: Maximum number of tokens
            response_format: Response format (e.g., JSON mode)

        Returns:
            Model response text
        """
        if self._codex_mode:
            content = self._chat_codex(messages, temperature, max_tokens, response_format)
        else:
            content = self._chat_completions(messages, temperature, max_tokens, response_format)

        # Some models (e.g., MiniMax M2.5) include <think> reasoning content in the response, which needs to be removed
        content = re.sub(r'<think>[\s\S]*?</think>', '', content).strip()
        return content

    def _chat_completions(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict],
    ) -> str:
        """Standard Chat Completions API (api.openai.com/v1)."""
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if response_format:
            kwargs["response_format"] = response_format

        try:
            response = self.client.chat.completions.create(**kwargs)
        except BadRequestError as e:
            # GPT-5 series uses max_completion_tokens in Chat Completions;
            # legacy code passing max_tokens triggers an unsupported_parameter error.
            err_msg = str(e)
            if "max_tokens" in err_msg and "max_completion_tokens" in err_msg:
                retry_kwargs = dict(kwargs)
                retry_kwargs.pop("max_tokens", None)
                retry_kwargs["max_completion_tokens"] = max_tokens
                response = self.client.chat.completions.create(**retry_kwargs)
            else:
                raise

        return response.choices[0].message.content

    def _chat_codex(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict],
    ) -> str:
        """Codex Responses API (chatgpt.com/backend-api/codex)."""
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "input": messages,
            "temperature": temperature,
            "max_output_tokens": max_tokens,
            "store": False,
        }

        if response_format:
            # Responses API uses text.format instead of response_format
            kwargs["text"] = {"format": response_format}

        response = self.client.responses.create(**kwargs)
        return response.output_text

    def chat_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096
    ) -> Dict[str, Any]:
        """
        Send a chat request and return JSON

        Args:
            messages: List of messages
            temperature: Temperature parameter
            max_tokens: Maximum number of tokens

        Returns:
            Parsed JSON object
        """
        response = self.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"}
        )
        # Clean up markdown code block markers
        cleaned_response = response.strip()
        cleaned_response = re.sub(r'^```(?:json)?\s*\n?', '', cleaned_response, flags=re.IGNORECASE)
        cleaned_response = re.sub(r'\n?```\s*$', '', cleaned_response)
        cleaned_response = cleaned_response.strip()

        try:
            return json.loads(cleaned_response)
        except json.JSONDecodeError:
            raise ValueError(f"Invalid JSON format returned by LLM: {cleaned_response}")
