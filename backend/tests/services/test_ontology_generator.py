import pytest
from unittest.mock import MagicMock
from app.services.ontology_generator import OntologyGenerator, ONTOLOGY_SYSTEM_PROMPT

def test_ontology_generator():
    mock_llm_client = MagicMock()
    # Mock the LLM returning a valid ontology JSON
    mock_llm_client.chat_json.return_value = {
        "entity_types": [
            {
                "name": "HedgeFund",
                "description": "A discretionary fund",
                "attributes": [{"name": "aum", "type": "text", "description": "AUM"}],
                "examples": ["Citadel"]
            }
        ],
        "edge_types": [
            {
                "name": "HOLDS_POSITION",
                "description": "Holding an asset",
                "source_targets": [{"source": "HedgeFund", "target": "Equity"}],
                "attributes": []
            }
        ],
        "analysis_summary": "Financial analysis."
    }
    
    generator = OntologyGenerator(llm_client=mock_llm_client)
    
    # Test generation
    text = ["Citadel holds NVDA"]
    requirement = "Simulate Citadel trading NVDA"
    
    result = generator.generate(text, requirement)
    
    # Assert LLM was called with the right prompt
    mock_llm_client.chat_json.assert_called_once()
    args, kwargs = mock_llm_client.chat_json.call_args
    messages = kwargs.get('messages', args[0] if args else [])
    
    assert messages[0]["role"] == "system"
    assert "financial market simulation" in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert text[0] in messages[1]["content"]
    assert requirement in messages[1]["content"]
    
    # Assert result parsing
    assert result["entity_types"][0]["name"] == "HedgeFund"
    assert result["edge_types"][0]["name"] == "HOLDS_POSITION"
