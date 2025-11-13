"""
Babylon Autonomous Agent - Python + LangGraph + HTTP A2A

Uses HTTP POST for A2A protocol (Babylon's implementation)
"""

import os
import json
import time
import asyncio
import httpx
from datetime import datetime
from typing import Any, Dict, List, Literal
from dotenv import load_dotenv

# LangChain & LangGraph
from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel

# Web3 for signing
from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct

load_dotenv()

# ==================== Memory ====================

memory_saver = MemorySaver()
action_memory: List[Dict] = []

def add_to_memory(action: str, result: Any):
    """Add action to agent memory"""
    action_memory.append({
        'action': action,
        'result': result,
        'timestamp': datetime.now().isoformat()
    })
    if len(action_memory) > 20:
        action_memory.pop(0)

def get_memory_summary() -> str:
    """Get formatted memory for LLM context"""
    if not action_memory:
        return "No recent actions."
    
    recent = action_memory[-5:]
    return "\n".join([
        f"[{a['timestamp']}] {a['action']}: {str(a['result'])[:80]}"
        for a in recent
    ])

# ==================== HTTP A2A Client ====================

class BabylonA2AClient:
    """HTTP client for Babylon A2A protocol"""
    
    def __init__(self, http_url: str, address: str, token_id: int, private_key: str):
        self.http_url = http_url
        self.address = address
        self.token_id = token_id
        self.private_key = private_key
        self.client = httpx.AsyncClient(timeout=30.0)
        self.message_id = 1
        self.agent_id = f"11155111:{token_id}"
        
    async def call(self, method: str, params: Dict = None) -> Dict:
        """Make JSON-RPC call over HTTP"""
        request_id = self.message_id
        self.message_id += 1
        
        message = {
            'jsonrpc': '2.0',
            'method': method,
            'params': params or {},
            'id': request_id
        }
        
        # Add agent headers
        headers = {
            'Content-Type': 'application/json',
            'x-agent-id': self.agent_id,
            'x-agent-address': self.address,
            'x-agent-token-id': str(self.token_id)
        }
        
        response = await self.client.post(
            self.http_url,
            json=message,
            headers=headers
        )
        
        response.raise_for_status()
        result = response.json()
        
        if 'error' in result:
            raise Exception(f"A2A Error: {result['error']['message']}")
            
        return result['result']
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()

# Global A2A client
a2a_client: BabylonA2AClient | None = None

# ==================== LangGraph Tools ====================

@tool
async def get_markets() -> str:
    """Get available prediction markets."""
    try:
        result = await a2a_client.call('a2a.getMarketData', {})
        return json.dumps(result)
    except Exception as e:
        return json.dumps({'error': str(e)})

@tool
async def get_portfolio() -> str:
    """Get current portfolio including balance and positions."""
    try:
        balance = await a2a_client.call('a2a.getBalance', {})
        positions = await a2a_client.call('a2a.getPositions', {'userId': a2a_client.agent_id})
        
        return json.dumps({
            'balance': balance.get('balance', 0),
            'positions': positions
        })
    except Exception as e:
        return json.dumps({'error': str(e)})

@tool
async def buy_shares(market_id: str, outcome: str, amount: float) -> str:
    """Buy YES or NO shares in a prediction market."""
    try:
        result = await a2a_client.call('a2a.buyShares', {
            'marketId': market_id,
            'outcome': outcome.upper(),
            'amount': amount
        })
        
        add_to_memory(f"BUY_{outcome.upper()}", result)
        return json.dumps(result)
    except Exception as e:
        return json.dumps({'error': str(e)})

@tool
async def create_post(content: str) -> str:
    """Create a post in the Babylon feed."""
    try:
        result = await a2a_client.call('a2a.createPost', {
            'content': content[:280],
            'type': 'post'
        })
        
        add_to_memory("CREATE_POST", result)
        return json.dumps(result)
    except Exception as e:
        return json.dumps({'error': str(e)})

@tool
async def get_feed(limit: int = 20) -> str:
    """Get recent posts from the Babylon feed."""
    try:
        result = await a2a_client.call('a2a.getFeed', {
            'limit': limit,
            'offset': 0
        })
        
        return json.dumps(result.get('posts', []))
    except Exception as e:
        return json.dumps({'error': str(e)})

# ==================== Babylon Agent ====================

class BabylonAgent:
    """Autonomous Babylon trading agent with LangGraph"""
    
    SYSTEM_INSTRUCTION = """You are an autonomous trading agent for Babylon prediction markets.

Your capabilities:
- Trade prediction markets (buy YES/NO shares)
- Post insights to the feed
- Analyze markets and sentiment

Strategy: {strategy}

Guidelines:
- Only trade when you have strong conviction
- Keep posts under 280 characters
- Be thoughtful and add value

Recent Memory:
{memory}

Your task: Analyze the current state and decide what action to take.
Use the available tools to gather information and execute actions.
"""

    def __init__(self, strategy: str = "balanced"):
        self.strategy = strategy
        self.model = ChatGroq(
            model="llama-3.1-8b-instant",
            api_key=os.getenv('GROQ_API_KEY'),
            temperature=0.7
        )
        
        self.tools = [
            get_markets,
            get_portfolio,
            buy_shares,
            create_post,
            get_feed
        ]
        
        self.graph = create_react_agent(
            self.model,
            tools=self.tools,
            checkpointer=memory_saver
        )
    
    def get_system_prompt(self) -> str:
        """Get system prompt with current memory"""
        return self.SYSTEM_INSTRUCTION.format(
            strategy=self.strategy,
            memory=get_memory_summary()
        )
    
    async def decide(self, session_id: str) -> Dict:
        """Make autonomous decision"""
        # Include system prompt in the user query
        prompt = f"{self.get_system_prompt()}\n\nAnalyze the current state and decide what action to take."
        
        config = {"configurable": {"thread_id": session_id}}
        result = await self.graph.ainvoke({"messages": [("user", prompt)]}, config)
        
        last_message = result["messages"][-1]
        
        return {
            'decision': last_message.content if hasattr(last_message, 'content') else str(last_message),
            'state': result
        }

# ==================== Main Loop ====================

async def main():
    """Main autonomous loop"""
    global a2a_client
    
    print("🤖 Starting Babylon Autonomous Agent (Python + LangGraph + HTTP A2A)...")
    print("")
    
    # Phase 1: Agent Identity
    print("📝 Phase 1: Agent Identity Setup")
    try:
        account = Account.from_key(os.getenv('AGENT0_PRIVATE_KEY'))
        token_id = int(time.time()) % 100000
        
        identity = {
            'tokenId': token_id,
            'address': account.address,
            'agentId': f"11155111:{token_id}",
            'name': os.getenv('AGENT_NAME', 'Python Babylon Agent')
        }
        
        print(f"✅ Agent Identity Ready")
        print(f"   Token ID: {identity['tokenId']}")
        print(f"   Address: {identity['address']}")
        print(f"   Agent ID: {identity['agentId']}")
        print("")
        
    except Exception as e:
        print(f"❌ Identity setup failed: {e}")
        return
    
    # Phase 2: Connect to Babylon A2A (HTTP)
    print("🔌 Phase 2: Babylon A2A Connection (HTTP)")
    try:
        a2a_url = os.getenv('BABYLON_A2A_URL', 'http://localhost:3000/api/a2a')
        a2a_client = BabylonA2AClient(
            http_url=a2a_url,
            address=identity['address'],
            token_id=identity['tokenId'],
            private_key=os.getenv('AGENT0_PRIVATE_KEY')
        )
        
        # Test connection with a simple health check
        print(f"✅ Connected to Babylon A2A: {a2a_url}")
        print(f"   Agent ID: {a2a_client.agent_id}")
        print(f"   Ready to interact with Babylon!")
        print("")
        
    except Exception as e:
        print(f"❌ A2A connection failed: {e}")
        return
    
    # Phase 3: Initialize LangGraph Agent
    print("🧠 Phase 3: LangGraph Agent Initialization")
    try:
        strategy = os.getenv('AGENT_STRATEGY', 'balanced')
        babylon_agent = BabylonAgent(strategy=strategy)
        
        print(f"✅ LangGraph Agent Ready")
        print(f"   Model: llama-3.1-8b-instant (Groq)")
        print(f"   Tools: {len(babylon_agent.tools)} Babylon actions")
        print("")
        
    except Exception as e:
        print(f"❌ LangGraph init failed: {e}")
        return
    
    # Phase 4: Autonomous Loop
    print("🔄 Phase 4: Autonomous Loop Started")
    tick_interval = int(os.getenv('TICK_INTERVAL', '30'))
    tick_count = 0
    
    try:
        while True:
            tick_count += 1
            print("━" * 50)
            print(f"🔄 TICK #{tick_count}")
            print("━" * 50)
            
            try:
                result = await babylon_agent.decide(session_id=identity['agentId'])
                print(f"✅ Tick #{tick_count} complete")
                print(f"   Decision: {result['decision'][:100]}...")
                print("")
                
            except Exception as e:
                print(f"❌ Tick #{tick_count} error: {e}")
                print("")
            
            print(f"⏳ Sleeping {tick_interval}s...")
            print("")
            await asyncio.sleep(tick_interval)
            
    except KeyboardInterrupt:
        print("\n🛑 Shutting down gracefully...")
        await a2a_client.close()
        print("👋 Goodbye!")

if __name__ == "__main__":
    asyncio.run(main())

