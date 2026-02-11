# Babylon - Project Flowchart

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB["Web App<br/>(Next.js 16 / React 19)"]
        CLI["CLI<br/>(babylon commands)"]
        FARCASTER["Farcaster Mini App"]
    end

    subgraph "Auth & Access"
        PRIVY["Privy Auth"]
        SIWE["SIWE<br/>(Sign-In with Ethereum)"]
        NFT_GATE["NFT Gate<br/>(ProtoMonkeys)"]
    end

    subgraph "API Layer (Next.js API Routes)"
        API_USER["/api/users/*"]
        API_MARKET["/api/markets/*"]
        API_AGENT["/api/agents/*"]
        API_NFT["/api/nft/*"]
        API_CRON["/api/cron/*"]
    end

    subgraph "Game Engine (packages/engine)"
        GAME_TICK["GameTick"]
        GAME_LOOP["GameLoop"]
        GAME_WORLD["GameWorld"]
        FEED_GEN["FeedGenerator"]
        ARTICLE_GEN["ArticleGenerator"]
        MARKET_DECISION["MarketDecisionEngine"]
        NPC_INVEST["NPCInvestmentManager"]
        REPUTATION["ReputationService"]
    end

    subgraph "Core (packages/core)"
        PRED_MARKET["Prediction Markets"]
        PERPS["Perpetual Futures"]
        STORAGE["Storage Layer"]
    end

    subgraph "AI / Agents"
        AGENTS["AI Agents<br/>(packages/agents)"]
        LLM["LLM Providers<br/>(OpenAI / Groq / Anthropic)"]
        TRAINING["RL Training<br/>(packages/training)"]
        A2A["Agent-to-Agent<br/>(packages/a2a)"]
    end

    subgraph "Data Layer"
        DB[("PostgreSQL<br/>(Drizzle ORM)")]
        SSE["SSE<br/>(Real-time Updates)"]
    end

    subgraph "Blockchain (Base L2)"
        CONTRACTS["Diamond Proxy<br/>(EIP-2535)"]
        PRED_FACET["PredictionMarketFacet"]
        PERP_FACET["PerpetualMarketFacet"]
        LP_FACET["LiquidityPoolFacet"]
        ORACLE["OracleFacet"]
        GAME_ORACLE["GameOracleFacet"]
        REFERRAL["ReferralSystemFacet"]
        NFT_CONTRACT["ProtoMonkeysNFT<br/>(ERC-721)"]
    end

    %% Client connections
    WEB --> PRIVY
    WEB --> SIWE
    FARCASTER --> PRIVY
    PRIVY --> NFT_GATE
    WEB --> API_USER
    WEB --> API_MARKET
    WEB --> API_AGENT
    WEB --> API_NFT
    CLI --> API_CRON

    %% API to Engine
    API_CRON --> GAME_TICK
    API_MARKET --> PRED_MARKET
    API_MARKET --> PERPS
    API_AGENT --> AGENTS

    %% Engine internals
    GAME_TICK --> GAME_LOOP
    GAME_LOOP --> GAME_WORLD
    GAME_TICK --> FEED_GEN
    GAME_TICK --> ARTICLE_GEN
    GAME_TICK --> MARKET_DECISION
    GAME_TICK --> NPC_INVEST
    GAME_TICK --> REPUTATION

    %% AI connections
    FEED_GEN --> LLM
    ARTICLE_GEN --> LLM
    MARKET_DECISION --> AGENTS
    AGENTS --> LLM
    AGENTS --> A2A
    TRAINING --> AGENTS

    %% Data connections
    GAME_TICK --> DB
    API_USER --> DB
    API_MARKET --> DB
    API_AGENT --> DB
    DB --> SSE
    SSE --> WEB

    %% Blockchain connections
    API_MARKET --> CONTRACTS
    NPC_INVEST --> CONTRACTS
    CONTRACTS --> PRED_FACET
    CONTRACTS --> PERP_FACET
    CONTRACTS --> LP_FACET
    CONTRACTS --> ORACLE
    CONTRACTS --> GAME_ORACLE
    CONTRACTS --> REFERRAL
    NFT_GATE --> NFT_CONTRACT

    %% Core connections
    PRED_MARKET --> STORAGE
    PERPS --> STORAGE
    STORAGE --> DB
```

## Game Tick Flow (Every 60 Seconds)

```mermaid
flowchart TD
    START(["Cron Trigger<br/>(Vercel Cron / Local Simulator)"]) --> TICK_API["/api/cron/game-tick"]
    TICK_API --> EXEC["executeGameTick()"]

    EXEC --> BOOTSTRAP{"Game<br/>bootstrapped?"}
    BOOTSTRAP -- No --> INIT["Bootstrap Game<br/>(seed data, init state)"]
    INIT --> CONTENT
    BOOTSTRAP -- Yes --> CONTENT

    CONTENT["Generate Content"]
    CONTENT --> POSTS["Generate Posts<br/>(FeedGenerator + LLM)"]
    CONTENT --> ARTICLES["Generate Articles<br/>(ArticleGenerator + LLM)"]
    CONTENT --> EVENTS["Generate Events"]

    POSTS --> MARKET_UPD
    ARTICLES --> MARKET_UPD
    EVENTS --> MARKET_UPD

    MARKET_UPD["Update Markets"]
    MARKET_UPD --> PRICE["Recalculate Prices"]
    MARKET_UPD --> EXPIRE{"Expired<br/>markets?"}
    EXPIRE -- Yes --> RESOLVE["Resolve via Oracle"]
    EXPIRE -- No --> NPC

    PRICE --> NPC
    RESOLVE --> NPC

    NPC["Execute NPC Actions"]
    NPC --> NPC_TRADE["NPC Trading<br/>(MarketDecisionEngine)"]
    NPC --> NPC_POST["NPC Social Posts"]
    NPC --> NPC_INTERACT["NPC Interactions"]

    NPC_TRADE --> REP
    NPC_POST --> REP
    NPC_INTERACT --> REP

    REP["Update Reputation Scores"]
    REP --> DB_WRITE[("Write to Database")]
    DB_WRITE --> NOTIFY["Push SSE Updates<br/>to Connected Clients"]
    NOTIFY --> LOOKAHEAD{"Need<br/>lookahead?"}
    LOOKAHEAD -- Yes --> GEN_AHEAD["Generate Ahead<br/>(pre-compute next tick)"]
    LOOKAHEAD -- No --> DONE(["Tick Complete"])
    GEN_AHEAD --> DONE
```

## User Trading Flow

```mermaid
flowchart LR
    USER(["User"]) --> UI["Web App UI"]
    UI --> AUTH{"Authenticated?"}
    AUTH -- No --> LOGIN["Privy / SIWE Login"]
    LOGIN --> NFT_CHECK{"Holds<br/>ProtoMonkeys<br/>NFT?"}
    NFT_CHECK -- No --> MINT["Mint NFT"]
    NFT_CHECK -- Yes --> TRADE
    MINT --> TRADE
    AUTH -- Yes --> TRADE

    TRADE["Select Market"]
    TRADE --> TYPE{"Market Type"}

    TYPE -- Prediction --> PRED["Choose YES / NO"]
    TYPE -- Perpetual --> PERP["Choose LONG / SHORT"]

    PRED --> SHARES["Set Share Amount"]
    PERP --> SIZE["Set Position Size"]

    SHARES --> TX["Submit Transaction"]
    SIZE --> TX

    TX --> CONTRACT["Smart Contract<br/>(Base L2)"]
    CONTRACT --> EXEC_TRADE["Execute On-Chain"]
    EXEC_TRADE --> DB_UPD[("Update Database<br/>(positions, trades)")]
    DB_UPD --> SSE_PUSH["SSE Push Update"]
    SSE_PUSH --> UI_UPD["Real-time UI Update"]
```

## NPC Decision-Making Flow

```mermaid
flowchart TD
    TICK(["Game Tick"]) --> NPC_MGR["NPCInvestmentManager"]
    NPC_MGR --> LOAD["Load NPC Profiles<br/>& Portfolios"]
    LOAD --> EACH["For Each Active NPC"]

    EACH --> ANALYZE["Analyze Current Markets"]
    ANALYZE --> ASSESS["Assess Risk Tolerance<br/>(per NPC personality)"]
    ASSESS --> DECISION["MarketDecisionEngine"]

    DECISION --> LLM_CALL["LLM Reasoning<br/>(OpenAI / Groq)"]
    LLM_CALL --> ACTION{"Decision"}

    ACTION -- Buy --> BUY["Place Buy Order"]
    ACTION -- Sell --> SELL["Place Sell Order"]
    ACTION -- Hold --> HOLD["No Action"]
    ACTION -- Post --> POST["Generate Social Post"]

    BUY --> EXECUTE["Execute via Engine"]
    SELL --> EXECUTE

    EXECUTE --> UPDATE_DB[("Update Database")]
    POST --> UPDATE_DB
    HOLD --> NEXT

    UPDATE_DB --> NEXT["Next NPC"]
    NEXT --> EACH
```

## Content Generation Pipeline

```mermaid
flowchart TD
    TRIGGER(["Game Tick"]) --> SCHEDULE["Check Content Schedule"]

    SCHEDULE --> FEED{"Feed content<br/>needed?"}
    SCHEDULE --> NEWS{"News article<br/>needed?"}

    FEED -- Yes --> FEED_GEN["FeedGenerator"]
    FEED_GEN --> CONTEXT_F["Gather Context<br/>(market data, events, NPC state)"]
    CONTEXT_F --> PROMPT_F["Build LLM Prompt"]
    PROMPT_F --> LLM_F["LLM Call"]
    LLM_F --> PARSE_F["Parse & Format Post"]
    PARSE_F --> STORE_F[("Store in posts table")]

    NEWS -- Yes --> ART_GEN["ArticleGenerator"]
    ART_GEN --> CONTEXT_A["Gather Context<br/>(market trends, resolutions, events)"]
    CONTEXT_A --> PROMPT_A["Build LLM Prompt"]
    PROMPT_A --> LLM_A["LLM Call"]
    LLM_A --> PARSE_A["Parse & Format Article"]
    PARSE_A --> STORE_A[("Store in narrative table")]

    STORE_F --> NOTIFY["Push via SSE"]
    STORE_A --> NOTIFY
    NOTIFY --> CLIENTS(["Connected Clients"])
```

## Monorepo Package Dependency Graph

```mermaid
graph BT
    SHARED["packages/shared<br/>(types, constants, utils)"]

    DB["packages/db<br/>(schema, migrations)"]
    CORE["packages/core<br/>(markets, storage)"]
    API["packages/api<br/>(middleware, auth)"]
    AGENTS["packages/agents<br/>(AI agents)"]
    ENGINE["packages/engine<br/>(game logic)"]
    CONTRACTS["packages/contracts<br/>(Solidity)"]
    A2A["packages/a2a<br/>(agent-to-agent)"]
    MCP["packages/mcp<br/>(MCP server)"]
    TRAINING["packages/training<br/>(RL pipelines)"]
    TESTING["packages/testing<br/>(test utils)"]

    WEB["apps/web<br/>(Next.js)"]
    CLI["apps/cli"]
    DOCS["apps/docs"]

    DB --> SHARED
    CORE --> SHARED
    CORE --> DB
    API --> SHARED
    API --> DB
    AGENTS --> SHARED
    AGENTS --> DB
    AGENTS --> CORE
    ENGINE --> SHARED
    ENGINE --> DB
    ENGINE --> CORE
    ENGINE --> AGENTS
    A2A --> SHARED
    MCP --> SHARED
    MCP --> DB
    TRAINING --> SHARED
    TRAINING --> AGENTS
    TESTING --> SHARED
    TESTING --> DB

    WEB --> SHARED
    WEB --> DB
    WEB --> CORE
    WEB --> API
    WEB --> ENGINE
    WEB --> AGENTS
    WEB --> CONTRACTS

    CLI --> SHARED
    CLI --> DB
    CLI --> ENGINE
    CLI --> CONTRACTS
```

## Smart Contract Architecture (Diamond Pattern)

```mermaid
graph TD
    USER(["User / NPC"]) --> DIAMOND["Diamond Proxy<br/>(EIP-2535)"]

    DIAMOND --> PRED["PredictionMarketFacet<br/>• createMarket()<br/>• buyShares()<br/>• sellShares()<br/>• resolveMarket()"]

    DIAMOND --> PERP["PerpetualMarketFacet<br/>• openPosition()<br/>• closePosition()<br/>• updateFunding()"]

    DIAMOND --> LP["LiquidityPoolFacet<br/>• addLiquidity()<br/>• removeLiquidity()<br/>• getPoolState()"]

    DIAMOND --> ORACLE["OracleFacet<br/>• updatePrice()<br/>• getLatestPrice()"]

    DIAMOND --> GAME_O["GameOracleFacet<br/>• resolveEvent()<br/>• submitOutcome()"]

    DIAMOND --> REF["ReferralSystemFacet<br/>• registerReferral()<br/>• claimRewards()"]

    DIAMOND --> STORAGE["DiamondStorage<br/>(shared state)"]

    NFT["ProtoMonkeysNFT<br/>(ERC-721)<br/>• mint()<br/>• verify()"] -.-> DIAMOND

    PRED --> STORAGE
    PERP --> STORAGE
    LP --> STORAGE
    ORACLE --> STORAGE
    GAME_O --> STORAGE
    REF --> STORAGE
```
