import json
from abides_markets.messages.order import MarketOrderMsg, LimitOrderMsg
from abides_markets.orders import MarketOrder, LimitOrder, Side

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
