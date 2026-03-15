import pytest
from unittest.mock import MagicMock

# The abstract interface we are testing
class AbstractGraphDatabase:
    """
    Interface for graph database interactions. 
    Allows hot-swapping between Zep (Phase 1) and Neptune (Phase 2).
    """
    def add_node(self, entity_id: str, label: str, properties: dict):
        raise NotImplementedError

    def add_edge(self, source_id: str, target_id: str, relation: str, properties: dict):
        raise NotImplementedError

    def get_node(self, entity_id: str) -> dict:
        raise NotImplementedError

    def get_neighbors(self, entity_id: str, relation: str = None) -> list:
        raise NotImplementedError

# A concrete implementation wrapper for testing
class MockZepGraph(AbstractGraphDatabase):
    def __init__(self):
        self.nodes = {}
        self.edges = []

    def add_node(self, entity_id: str, label: str, properties: dict):
        self.nodes[entity_id] = {"label": label, "properties": properties}
        return entity_id

    def add_edge(self, source_id: str, target_id: str, relation: str, properties: dict = None):
        if properties is None:
            properties = {}
        self.edges.append({
            "source": source_id,
            "target": target_id,
            "relation": relation,
            "properties": properties
        })

    def get_node(self, entity_id: str) -> dict:
        return self.nodes.get(entity_id)

    def get_neighbors(self, entity_id: str, relation: str = None) -> list:
        neighbors = []
        for edge in self.edges:
            if edge["source"] == entity_id and (relation is None or edge["relation"] == relation):
                neighbors.append({
                    "node_id": edge["target"],
                    "edge": edge
                })
        return neighbors

def test_graph_interface_adds_financial_entities():
    db = MockZepGraph()
    
    # Add a Hedge Fund
    db.add_node("hf_1", "HedgeFund", {"name": "Citadel", "aum_billions": 60})
    
    # Add an Asset
    db.add_node("asset_1", "Equity", {"ticker": "NVDA", "sector": "Technology"})
    
    # Add an edge (Position)
    db.add_edge("hf_1", "asset_1", "HOLDS_POSITION", {"shares": 50000})
    
    # Verify retrieval
    node = db.get_node("hf_1")
    assert node is not None
    assert node["label"] == "HedgeFund"
    assert node["properties"]["name"] == "Citadel"

def test_graph_interface_traverses_relationships():
    db = MockZepGraph()
    
    db.add_node("hf_1", "HedgeFund", {"name": "Citadel"})
    db.add_node("asset_1", "Equity", {"ticker": "NVDA"})
    db.add_node("asset_2", "Equity", {"ticker": "TSMC"})
    
    db.add_edge("hf_1", "asset_1", "HOLDS_POSITION", {"shares": 50000})
    db.add_edge("hf_1", "asset_2", "HOLDS_POSITION", {"shares": 10000})
    
    # Agent needs to know what they hold to make trading decisions
    holdings = db.get_neighbors("hf_1", relation="HOLDS_POSITION")
    
    assert len(holdings) == 2
    target_ids = [h["node_id"] for h in holdings]
    assert "asset_1" in target_ids
    assert "asset_2" in target_ids
