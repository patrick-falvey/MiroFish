import duckdb
import json
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class MarketDataStore:
    """
    Live market data aggregator. 
    Uses DuckDB to store high-frequency ABIDES ticks in-memory (or on fast local disk)
    so the FastAPI server can serve OHLCV candles to the React UI instantly upon page refresh.
    """
    
    def __init__(self, db_path: str = ":memory:"):
        """Initialize the DuckDB connection and create schemas if they don't exist."""
        self.db_path = db_path
        self.conn = duckdb.connect(database=db_path)
        self._initialize_schema()

    def _initialize_schema(self):
        """Create the necessary tables for tracking simulation ticks."""
        # We store prices as floats for easy aggregation.
        # In a strict production system, Decimal or scaled Ints are preferred, 
        # but DuckDB handles floats well enough for UI aggregation.
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS market_ticks (
                simulation_id VARCHAR,
                symbol VARCHAR,
                timestamp_str VARCHAR,
                price DOUBLE,
                volume INTEGER,
                bid DOUBLE,
                ask DOUBLE
            )
        """)
        
        # Create an index for fast querying by simulation and symbol
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_sim_sym ON market_ticks(simulation_id, symbol)
        """)

    def insert_tick(self, simulation_id: str, tick: Dict[str, Any]):
        """
        Inserts a single tick into the hot-state database.
        Typically called by the MarketDataBroadcaster.
        """
        try:
            self.conn.execute("""
                INSERT INTO market_ticks 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                simulation_id,
                tick.get('symbol', 'UNKNOWN'),
                tick.get('timestamp', ''),
                tick.get('price', 0.0),
                tick.get('volume', 0),
                tick.get('bid', 0.0),
                tick.get('ask', 0.0)
            ))
        except Exception as e:
            logger.error(f"Failed to insert tick into DuckDB: {str(e)}")

    def get_market_data(self, simulation_id: str, symbol: str, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Retrieves all ticks for a specific simulation and symbol.
        Returns a list of dictionaries matching the MarketDataTick React interface.
        """
        try:
            # We fetch exactly what the React UI MarketDataTick interface expects
            result = self.conn.execute("""
                SELECT 
                    symbol, 
                    timestamp_str as timestamp, 
                    price, 
                    volume, 
                    bid, 
                    ask
                FROM market_ticks
                WHERE simulation_id = ? AND symbol = ?
                ORDER BY timestamp_str ASC
                LIMIT ?
            """, (simulation_id, symbol, limit)).fetchall()
            
            # Map tuples to dictionaries
            ticks = []
            for row in result:
                ticks.append({
                    "symbol": row[0],
                    "timestamp": row[1],
                    "price": row[2],
                    "volume": row[3],
                    "bid": row[4],
                    "ask": row[5]
                })
            return ticks
        except Exception as e:
            logger.error(f"Failed to query market data from DuckDB: {str(e)}")
            return []

    def close(self):
        """Close the database connection."""
        if self.conn:
            self.conn.close()
