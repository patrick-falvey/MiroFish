import pytest
import json
from abides_markets.messages.order import MarketOrderMsg, LimitOrderMsg
from abides_markets.orders import MarketOrder, LimitOrder, Side

# This is a placeholder for the actual translator we will build
def translate_llm_intent_to_abides(agent_id: int, current_time: int, llm_json_str: str) -> list:
    """
    Translates a JSON intent string from the LLM into a list of ABIDES order messages.
    """
    try:
        intent = json.loads(llm_json_str)
    except json.JSONDecodeError:
        return []

    action = intent.get("action")
    symbol = intent.get("symbol")
    quantity = intent.get("quantity", 0)
    order_type = intent.get("order_type", "MARKET")
    limit_price = intent.get("limit_price")

    if not action or not symbol or quantity <= 0:
        return []

    is_buy = action.upper() == "BUY"
    is_market = order_type.upper() == "MARKET"
    
    side = Side.BID if is_buy else Side.ASK

    # Validation
    if not is_market and limit_price is None:
        return []

    if is_market:
        order = MarketOrder(
            agent_id=agent_id,
            time_placed=current_time,
            symbol=symbol,
            quantity=quantity,
            side=side
        )
        msg = MarketOrderMsg(order)
        return [msg]
    else:
        # Note: ABIDES limit_price is typically represented in cents (integer) to avoid float precision issues.
        # We will cast the float limit_price to an int (cents) for the simulator.
        order = LimitOrder(
            agent_id=agent_id,
            time_placed=current_time,
            symbol=symbol,
            quantity=quantity,
            side=side,
            limit_price=int(limit_price * 100) 
        )
        msg = LimitOrderMsg(order)
        return [msg]

def test_translate_market_buy():
    llm_output = '{"action": "BUY", "symbol": "NVDA", "quantity": 100, "order_type": "MARKET"}'
    
    messages = translate_llm_intent_to_abides(agent_id=1, current_time=1000, llm_json_str=llm_output)
    
    assert len(messages) == 1
    msg = messages[0]
    assert isinstance(msg, MarketOrderMsg)
    assert msg.order.agent_id == 1
    assert msg.order.symbol == "NVDA"
    assert msg.order.side == Side.BID
    assert msg.order.quantity == 100

def test_translate_limit_sell():
    llm_output = '{"action": "SELL", "symbol": "TSMC", "quantity": 500, "order_type": "LIMIT", "limit_price": 145.50}'
    
    messages = translate_llm_intent_to_abides(agent_id=2, current_time=1000, llm_json_str=llm_output)
    
    assert len(messages) == 1
    msg = messages[0]
    assert isinstance(msg, LimitOrderMsg)
    assert msg.order.agent_id == 2
    assert msg.order.symbol == "TSMC"
    assert msg.order.side == Side.ASK
    assert msg.order.quantity == 500
    assert msg.order.limit_price == 14550 # 145.50 * 100 cents

def test_translate_invalid_json():
    llm_output = 'I think I want to buy NVDA because of the news.'
    messages = translate_llm_intent_to_abides(agent_id=3, current_time=1000, llm_json_str=llm_output)
    assert len(messages) == 0

def test_translate_missing_fields():
    # Missing quantity
    llm_output = '{"action": "BUY", "symbol": "NVDA"}'
    messages = translate_llm_intent_to_abides(agent_id=4, current_time=1000, llm_json_str=llm_output)
    assert len(messages) == 0

def test_translate_limit_order_missing_price():
    # Limit order must have a price
    llm_output = '{"action": "BUY", "symbol": "NVDA", "quantity": 100, "order_type": "LIMIT"}'
    messages = translate_llm_intent_to_abides(agent_id=5, current_time=1000, llm_json_str=llm_output)
    assert len(messages) == 0
