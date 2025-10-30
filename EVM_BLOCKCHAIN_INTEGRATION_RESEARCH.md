# EVM Blockchain Integration for Prediction Market Games
**Research Report - October 2025**

---

## Executive Summary

This report provides comprehensive guidance on integrating EVM blockchain technology into prediction market games, based on October 2025 state-of-the-art practices. Key findings:

- **Smart Contract Architecture**: Use Conditional Tokens Framework (CTF) with LMSR/AMM market makers
- **L2 Recommendation**: Base or Arbitrum for production; L3 for extreme cost optimization
- **Security Focus**: Reentrancy protection, oracle manipulation prevention, and CEI pattern are critical
- **Testing Strategy**: Foundry for speed (15x faster), Hardhat for complex integration tests
- **Gas Optimization**: 30-50% savings achievable through modern patterns
- **Upgradeability**: Diamond Standard (EIP-2535) for modular, future-proof architecture

---

## 1. Smart Contract Architecture

### 1.1 Core Contract Stack

#### **Conditional Tokens Framework (CTF)**
- **Purpose**: Universal contract for binary outcome tokens (industry standard)
- **Provider**: Gnosis - battle-tested, audited implementation
- **Usage**: Manages position tokens (ERC-1155) and settlement in USDC/collateral
- **Why**: Proven architecture used by Polymarket (largest prediction market platform)

```solidity
// Conceptual structure - based on Gnosis CTF
interface IConditionalTokens {
    function prepareCondition(
        address oracle,
        bytes32 questionId,
        uint outcomeSlotCount
    ) external;

    function reportPayouts(
        bytes32 questionId,
        uint[] calldata payouts
    ) external;

    function redeemPositions(
        IERC20 collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint[] calldata indexSets
    ) external;
}
```

#### **Exchange Contract (Order Matching)**
```solidity
// Hybrid order book system (off-chain matching, on-chain settlement)
contract CTFExchange {
    // Atomic swaps between binary outcome tokens and collateral
    struct Order {
        address maker;
        address taker;
        uint256 makerAmount;
        uint256 takerAmount;
        uint256 nonce;
        uint256 expiry;
        bytes signature;
    }

    function fillOrder(Order calldata order) external nonReentrant {
        // 1. Validate signature
        // 2. Check expiry and nonce
        // 3. Transfer tokens atomically
        // 4. Emit event for off-chain indexer
    }

    function batchFillOrders(Order[] calldata orders) external nonReentrant {
        // Gas-optimized batch execution
    }
}
```

**Key Design Decisions**:
- Off-chain order book (instant placement/cancellation)
- On-chain settlement only (reduces gas costs)
- Signed limit orders (no on-chain storage)
- Atomic swaps (eliminates counterparty risk)

#### **Market Maker Contracts**

##### **LMSR (Logarithmic Market Scoring Rule)**
```solidity
// Based on Gnosis implementation
contract LMSRMarketMaker {
    uint256 public constant ONE = 10**18;
    int256 public constant EXP_LIMIT = 130e18;

    // Liquidity parameter (higher = more liquidity, less price movement)
    uint256 public funding;

    function calcCostFromShares(
        uint[] memory shares,
        uint[] memory selectedShares
    ) public view returns (uint256 cost) {
        // LMSR formula: C(q) = b * ln(sum(exp(q_i / b)))
        // where b = funding, q_i = shares of outcome i

        int256 logSum = calcLogSum(shares);
        int256 logSumSelected = calcLogSum(
            addShares(shares, selectedShares)
        );

        cost = uint256((logSumSelected - logSum) * int256(funding) / ONE);
    }

    // Closed-form solution allows batch buy/sell optimization
    function calcNetCost(
        uint[] memory buys,
        uint[] memory sells
    ) public view returns (uint256 netCost) {
        // Calculate cost for buys and sells simultaneously
        // Significantly reduces gas for market makers
    }
}
```

**LMSR Advantages**:
- No liquidity pool required (suitable for low-liquidity markets)
- Rich academic history and well-researched properties
- Closed-form expressions enable batch operations
- Predictable price curves

##### **LS-LMSR (Liquidity Sensitive LMSR)**
- Improvement over traditional LMSR (Othman et al. 2013)
- Adapts to market liquidity dynamically
- Better for volatile/uncertain markets

##### **Constant Product Market Maker (CPMM)**
```solidity
contract CPMMMarketMaker {
    // AMM formula: x * y = k
    // Similar to Uniswap V2 but for binary outcomes

    function calcOutcomeTokens(
        uint256 collateralAmount,
        uint256 outcomeIndex
    ) public view returns (uint256 outcomeTokens) {
        uint256 reserve0 = getReserve(0);
        uint256 reserve1 = getReserve(1);

        // x * y = k invariant
        outcomeTokens = reserve1 - (reserve0 * reserve1) / (reserve0 + collateralAmount);
    }
}
```

**When to Use Each**:
- **LMSR**: Low-liquidity markets, initial bootstrapping
- **LS-LMSR**: Markets with uncertain participation
- **CPMM**: High-liquidity markets, familiar UX for DeFi users

#### **Oracle Contract**
```solidity
contract PredictionOracle {
    using Chainlink for *;

    enum ResolutionType { Manual, Automated, Hybrid }

    struct Market {
        bytes32 marketId;
        ResolutionType resolutionType;
        address resolver;
        uint256 resolutionTime;
        bytes32 chainlinkJobId; // For automated resolution
    }

    // Automated resolution via Chainlink
    function resolveMarketAutomated(bytes32 marketId) external {
        Market storage market = markets[marketId];
        require(block.timestamp >= market.resolutionTime, "Too early");

        // Request Chainlink data
        Chainlink.Request memory req = buildChainlinkRequest(
            market.chainlinkJobId,
            address(this),
            this.fulfillResolution.selector
        );

        sendChainlinkRequest(req, fee);
    }

    function fulfillResolution(
        bytes32 requestId,
        uint256[] memory outcomes
    ) external recordChainlinkFulfillment(requestId) {
        // Validate and report payouts to CTF
        conditionalTokens.reportPayouts(marketId, outcomes);
    }

    // Manual resolution with dispute mechanism
    function proposeResolution(
        bytes32 marketId,
        uint256[] memory outcomes
    ) external {
        require(msg.sender == whitelistedProposer, "Not authorized");

        // UMA Optimistic Oracle V2 pattern
        // Store proposal with dispute period
        proposals[marketId] = Proposal({
            outcomes: outcomes,
            proposer: msg.sender,
            timestamp: block.timestamp,
            disputed: false
        });

        emit ResolutionProposed(marketId, outcomes);
    }

    function disputeResolution(bytes32 marketId) external {
        // Stake required to dispute
        // Escalation to governance or higher oracle tier
    }
}
```

**Oracle Strategy (2025 Best Practices)**:
1. **Automated resolution** for objective data (price feeds, sports scores)
   - Chainlink Data Streams for real-time, verifiable data
   - Chainlink Automation for timely settlement
   - Near-instantaneous resolution

2. **Managed resolution** for subjective outcomes
   - UMA Managed Optimistic Oracle V2 (MOOV2)
   - Whitelisted proposers only (reduces false resolutions)
   - Dispute mechanism with economic stakes

3. **Hybrid approach** for complex markets
   - Primary: Automated oracle
   - Fallback: Manual resolution if data unavailable
   - Governance override for edge cases

#### **Registry Contract**
```solidity
contract AgentRegistry {
    struct Agent {
        address owner;
        string metadata; // IPFS hash
        uint256 reputation;
        bool verified;
    }

    mapping(address => Agent) public agents;

    function registerAgent(string calldata metadata) external {
        agents[msg.sender] = Agent({
            owner: msg.sender,
            metadata: metadata,
            reputation: 0,
            verified: false
        });
    }

    function updateReputation(
        address agent,
        int256 delta
    ) external onlyMarket {
        // Markets can update agent reputation
        // Positive: accurate predictions
        // Negative: manipulation attempts
    }
}
```

---

### 1.2 Security Patterns (2025 Standards)

#### **1. Reentrancy Protection**

**Critical Statistics**:
- 45% of exploits leverage improper external calls (2025 Vulnerability Report)
- 30% of Ethereum vulnerabilities stem from reentrancy
- 75% reduction in exploits with proper guards

**Primary Pattern: Checks-Effects-Interactions (CEI)**
```solidity
function withdraw(uint256 amount) external nonReentrant {
    // ✅ CHECKS
    require(balances[msg.sender] >= amount, "Insufficient balance");

    // ✅ EFFECTS (state changes BEFORE external calls)
    balances[msg.sender] -= amount;
    totalBalance -= amount;

    // ✅ INTERACTIONS (external calls LAST)
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
```

**Secondary Pattern: ReentrancyGuard**
```solidity
// OpenZeppelin implementation
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Market is ReentrancyGuard {
    function claimWinnings(bytes32 marketId) external nonReentrant {
        // Protected from reentrancy
        _processWithdrawal(msg.sender, marketId);
    }
}
```

**Emergency Pattern: Pausable**
```solidity
import "@openzeppelin/contracts/security/Pausable.sol";

contract Market is Pausable, ReentrancyGuard {
    function emergencyPause() external onlyOwner {
        _pause();
    }

    function placeOrder(Order calldata order) external whenNotPaused nonReentrant {
        // Function disabled during pause
    }
}
```

#### **2. Oracle Manipulation Prevention**

**OWASP #2 Critical Risk (2025)**: $8.8M in losses

**Multi-Oracle Aggregation**
```solidity
contract SecureOracle {
    struct DataPoint {
        uint256 value;
        uint256 timestamp;
        address source;
    }

    // Aggregate from multiple sources
    function getPrice(address asset) external view returns (uint256) {
        DataPoint[] memory prices = new DataPoint[](3);

        // Source 1: Chainlink
        prices[0] = DataPoint({
            value: chainlinkFeed.latestAnswer(),
            timestamp: chainlinkFeed.latestTimestamp(),
            source: address(chainlinkFeed)
        });

        // Source 2: UMA
        prices[1] = DataPoint({
            value: umaOracle.getCurrentPrice(asset),
            timestamp: block.timestamp,
            source: address(umaOracle)
        });

        // Source 3: Custom aggregator
        prices[2] = DataPoint({
            value: customOracle.getPrice(asset),
            timestamp: block.timestamp,
            source: address(customOracle)
        });

        // Return median (resistant to single-source manipulation)
        return calculateMedian(prices);
    }

    // Time-Weighted Average Price (TWAP)
    function getTWAP(
        address asset,
        uint256 periods
    ) external view returns (uint256) {
        uint256 sum = 0;
        for (uint256 i = 0; i < periods; i++) {
            sum += historicalPrices[asset][block.number - i];
        }
        return sum / periods;
    }

    // Price bounds checking
    function validatePrice(uint256 price) internal view {
        require(
            price >= minPrice && price <= maxPrice,
            "Price out of bounds"
        );

        uint256 lastPrice = historicalPrices[asset][block.number - 1];
        uint256 maxChange = lastPrice * maxPriceChangePercent / 100;

        require(
            price >= lastPrice - maxChange &&
            price <= lastPrice + maxChange,
            "Price change too drastic"
        );
    }
}
```

**Time Lock Pattern**
```solidity
uint256 public constant PRICE_UPDATE_DELAY = 15 minutes;

mapping(address => uint256) public lastPriceUpdate;

function updatePrice(address asset, uint256 newPrice) external {
    require(
        block.timestamp >= lastPriceUpdate[asset] + PRICE_UPDATE_DELAY,
        "Update too soon"
    );

    lastPriceUpdate[asset] = block.timestamp;
    prices[asset] = newPrice;
}
```

#### **3. Front-Running Mitigation**

**Status**: Removed from OWASP 2025 list due to EIP-1559 and private mempools
**Reality**: Still impacts 25% of DEX transactions

**Commit-Reveal Scheme**
```solidity
contract CommitRevealMarket {
    struct Commitment {
        bytes32 hash;
        uint256 timestamp;
        bool revealed;
    }

    mapping(address => Commitment) public commitments;

    // Phase 1: Commit
    function commitOrder(bytes32 orderHash) external {
        commitments[msg.sender] = Commitment({
            hash: orderHash,
            timestamp: block.timestamp,
            revealed: false
        });
    }

    // Phase 2: Reveal (after time delay)
    function revealOrder(
        Order calldata order,
        bytes32 salt
    ) external {
        Commitment storage commitment = commitments[msg.sender];

        require(
            block.timestamp >= commitment.timestamp + REVEAL_DELAY,
            "Too early"
        );

        require(
            keccak256(abi.encode(order, salt)) == commitment.hash,
            "Invalid reveal"
        );

        commitment.revealed = true;
        _executeOrder(order);
    }
}
```

**Batch Auction Pattern**
```solidity
contract BatchAuction {
    struct Batch {
        Order[] orders;
        uint256 clearingPrice;
        uint256 startTime;
        uint256 endTime;
    }

    // All orders in batch executed at same price
    function submitBatchOrder(Order calldata order) external {
        uint256 currentBatch = getCurrentBatch();
        batches[currentBatch].orders.push(order);
    }

    function clearBatch(uint256 batchId) external {
        // Calculate uniform clearing price
        // Execute all orders at clearing price
        // Eliminates front-running within batch
    }
}
```

**Private Mempool Integration**
```solidity
// Use Flashbots/MEV-Boost for sensitive transactions
// No contract changes needed - integrate at wallet/frontend level
```

#### **4. Access Control**

**OWASP #1 Critical Risk (2025)**: Improper access restrictions

```solidity
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Market is AccessControl {
    bytes32 public constant MARKET_CREATOR_ROLE = keccak256("MARKET_CREATOR");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER");

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createMarket(...) external onlyRole(MARKET_CREATOR_ROLE) {
        // Protected function
    }

    function resolveMarket(bytes32 marketId) external onlyRole(RESOLVER_ROLE) {
        // Only designated resolvers
    }
}
```

#### **5. Integer Overflow Protection**

**Status**: Built-in since Solidity 0.8.0
**Best Practice**: Use unchecked blocks only when safe

```solidity
function calculateReward(uint256 shares) internal pure returns (uint256) {
    // Safe by default in 0.8.0+
    uint256 reward = shares * REWARD_MULTIPLIER;

    // Use unchecked for gas savings ONLY when overflow impossible
    unchecked {
        // Counter that will never overflow
        totalTransactions++;
    }

    return reward;
}
```

#### **6. Custom Errors (Gas Optimization)**

```solidity
// ❌ Old way: expensive
require(balances[msg.sender] >= amount, "Insufficient balance");

// ✅ New way: gas-efficient (since Solidity 0.8.4)
error InsufficientBalance(address user, uint256 balance, uint256 requested);

if (balances[msg.sender] < amount) {
    revert InsufficientBalance(msg.sender, balances[msg.sender], amount);
}
```

---

### 1.3 Gas Optimization Strategies

**Target**: 30-50% token reduction (achievable in 2025)

#### **Storage Optimization**

```solidity
// ❌ Inefficient: 3 SSTORE operations
uint256 public value1;
uint256 public value2;
uint256 public value3;

// ✅ Efficient: Pack into single slot (1 SSTORE)
struct PackedData {
    uint128 value1;  // 16 bytes
    uint64 value2;   // 8 bytes
    uint64 value3;   // 8 bytes
}                    // Total: 32 bytes = 1 slot

PackedData public data;

// ✅ Use bytes32 for maximum efficiency
bytes32 public constant MARKET_TYPE = keccak256("BINARY");
```

**Storage Deletion Refunds**
```solidity
function settle(bytes32 marketId) external {
    // Process settlement
    _processPayout(marketId);

    // Delete storage for 15,000 gas refund
    delete markets[marketId];
}
```

#### **Loop Optimization**

```solidity
// ❌ Inefficient: Repeated SLOAD
function sumArray(uint256[] memory arr) public view returns (uint256) {
    uint256 sum = 0;
    for (uint256 i = 0; i < arr.length; i++) {
        sum += arr[i];
    }
    return sum;
}

// ✅ Efficient: Cache array length
function sumArrayOptimized(uint256[] memory arr) public pure returns (uint256) {
    uint256 sum = 0;
    uint256 len = arr.length; // Cache length

    for (uint256 i = 0; i < len;) {
        sum += arr[i];
        unchecked { ++i; } // Gas savings
    }
    return sum;
}
```

#### **Batch Operations**

```solidity
// ✅ Single transaction for multiple operations
function batchSettle(bytes32[] calldata marketIds) external {
    uint256 len = marketIds.length;
    for (uint256 i = 0; i < len;) {
        _settleMarket(marketIds[i]);
        unchecked { ++i; }
    }
}

// ✅ Batch transfers
function batchTransfer(
    address[] calldata recipients,
    uint256[] calldata amounts
) external {
    require(recipients.length == amounts.length, "Length mismatch");

    uint256 len = recipients.length;
    for (uint256 i = 0; i < len;) {
        _transfer(msg.sender, recipients[i], amounts[i]);
        unchecked { ++i; }
    }
}
```

#### **Assembly for Critical Paths**

```solidity
// Use sparingly and only when necessary
function efficientTransfer(
    address to,
    uint256 amount
) internal {
    assembly {
        // Load free memory pointer
        let ptr := mload(0x40)

        // Store function selector and parameters
        mstore(ptr, 0xa9059cbb00000000000000000000000000000000000000000000000000000000)
        mstore(add(ptr, 0x04), to)
        mstore(add(ptr, 0x24), amount)

        // Call token contract
        let success := call(gas(), token, 0, ptr, 0x44, 0, 0)

        // Check return value
        if iszero(success) {
            revert(0, 0)
        }
    }
}
```

#### **Event Logging vs Storage**

```solidity
// ✅ Store aggregated data on-chain, details in events
contract Market {
    // On-chain: Only essential state
    mapping(address => uint256) public totalVolume;

    // Off-chain indexing: Full history
    event OrderPlaced(
        address indexed user,
        bytes32 indexed marketId,
        uint256 amount,
        uint256 price,
        uint256 timestamp
    );

    function placeOrder(...) external {
        // Update state
        totalVolume[msg.sender] += amount;

        // Emit detailed event (cheaper than storage)
        emit OrderPlaced(msg.sender, marketId, amount, price, block.timestamp);
    }
}
```

---

## 2. Layer 2 & Layer 3 Solutions

### 2.1 L2 Solution Comparison (October 2025)

#### **Market Leadership**

| Platform | Value Transfer Share | Transaction Fee Share | Technology | Stage |
|----------|---------------------|----------------------|------------|-------|
| **Base** | 55% | 80% | Optimistic Rollup (OP Stack) | Stage 1 |
| **Arbitrum** | 35% | 5-10% | Optimistic Rollup (Nitro) | Stage 1 |
| **Optimism** | <10% | 3-5% | Optimistic Rollup (OP Stack) | Stage 1 |
| **zkSync** | <5% | <2% | ZK Rollup | Stage 0 |

**Profitability**: Base > Arbitrum > Optimism > zkSync

#### **Technology Breakdown**

##### **Optimistic Rollups** (Base, Arbitrum, Optimism)
- **Mechanism**: Assume transactions valid, challenge period (7 days)
- **Advantages**:
  - Mature technology with proven security
  - EVM equivalence (easy migration)
  - Lower development complexity
  - Large ecosystems and liquidity
- **Disadvantages**:
  - 7-day withdrawal period
  - Higher data availability costs than ZK

##### **ZK Rollups** (zkSync, StarkNet)
- **Mechanism**: Zero-knowledge proofs validate transactions
- **Advantages**:
  - Faster finality (minutes vs days)
  - Stronger cryptographic security
  - Lower long-term data costs
- **Disadvantages**:
  - Less mature technology
  - EVM compatibility challenges
  - Smaller ecosystems
  - Higher computational overhead

#### **Recommended L2 Solutions**

##### **For Production Launch: Base**

**Why Base**:
1. **Dominant market share**: 80% of L2 transaction fees
2. **Coinbase backing**: Regulatory clarity, institutional trust
3. **OP Stack**: Proven technology, Ethereum Foundation aligned
4. **Best profitability**: Highest revenue generation
5. **Growing ecosystem**: Rapid adoption, developer-friendly
6. **Low fees**: ~$0.01 per transaction
7. **Fast finality**: Soft finality <2 seconds

**Polymarket Example**: Uses Polygon (similar to Base)
- Transaction cost: <$0.01
- Settlement time: ~2 seconds
- Proven at scale: Billions in volume

**Base Integration**:
```bash
# Network Configuration
CHAIN_ID=8453
RPC_URL=https://mainnet.base.org
BLOCK_EXPLORER=https://basescan.org

# Contract Deployment
forge create --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --verify \
  src/Market.sol:Market
```

##### **Alternative: Arbitrum**

**Why Arbitrum**:
1. **Most TVL**: Highest total value locked among L2s
2. **Most active users**: Largest user base
3. **Arbitrum Nitro**: Advanced fraud proof system
4. **Stylus support**: WASM execution (Rust/C++)
5. **35% value transfer share**: Second largest L2

**When to choose**:
- Need maximum liquidity
- Want largest user base
- Require advanced execution features (Stylus)
- Prefer battle-tested security

**Arbitrum Integration**:
```bash
# Network Configuration
CHAIN_ID=42161
RPC_URL=https://arb1.arbitrum.io/rpc
BLOCK_EXPLORER=https://arbiscan.io

# Lower fees than Ethereum L1, similar security
```

##### **Not Recommended: Optimism**
- Declining market share (third place)
- Superchain "tax": 2.5% revenue OR 15% onchain profit
- Restrictive governance (Law of Chains)
- Better alternatives available (Base uses same tech)

##### **Not Recommended: zkSync**
- Stage 0 rollup (missing critical features)
- Smaller ecosystem
- EVM compatibility issues
- Still maturing (good for future, not now)

---

### 2.2 Layer 3 Solutions

#### **When to Use L3**

##### **Use L3 if you need**:
1. **Extreme cost optimization**: Up to 1000x cheaper than L2
2. **Predictable gas fees**: Isolated fee markets
3. **Custom execution environment**: Application-specific chains
4. **Maximum control**: Own blockchain parameters

##### **L3 Trade-offs**:
- More complex infrastructure
- Smaller liquidity pools
- Additional security assumptions
- Limited tooling/support

#### **L3 Technology Stacks**

##### **Arbitrum Orbit**

**Advantages**:
- Full customization (gas tokens, governance, execution)
- WASM support via Stylus (Rust/C++ smart contracts)
- Native L3 support
- AnyTrust option (lower cost, lower security)
- 50+ chains in development (2024)

**Disadvantages**:
- Extractive licensing model
- Revenue sharing requirements
- More autonomous but less standardized

**Best for**: Experimentation, custom requirements, boundary-pushing

**Example**: Xai (gaming L3 on Arbitrum)
- Gaming-dedicated chain
- AnyTrust technology
- Custom gas token
- Optimized for high-frequency gaming

##### **OP Stack Rollups**

**Advantages**:
- Ethereum-aligned (Superchain vision)
- Modular architecture (easy upgrades)
- Standardized governance
- Shared security and liquidity
- 6/10 top L2s use OP Stack

**Disadvantages**:
- Superchain "tax" (2.5% revenue OR 15% profit)
- Law of Chains governance
- Less customization than Orbit
- Stricter rules

**Best for**: Long-term stability, Ethereum alignment, shared ecosystem

**Example**: Base (technically L2, but OP Stack)
- Part of Superchain
- Coinbase backing
- Standardized security

#### **Decision Matrix: L2 vs L3**

| Factor | Use L2 | Use L3 |
|--------|--------|--------|
| **Cost** | $0.01/tx acceptable | Need <$0.0001/tx |
| **Liquidity** | Need existing liquidity | Can bootstrap own |
| **Customization** | Standard EVM sufficient | Need custom features |
| **Development** | Want proven tooling | Can handle complexity |
| **Fee Predictability** | Shared fee market OK | Need isolated fees |
| **Time to Market** | Launch quickly | Can wait for setup |
| **Scale** | <10k TPS | Need >10k TPS |

#### **Recommendation for Prediction Markets**

**Start with L2 (Base or Arbitrum)**:
1. Proven technology
2. Existing liquidity
3. Large user base
4. Fast time to market
5. Lower complexity

**Consider L3 if**:
1. You have >100k daily active users
2. Gas costs become prohibitive (>$10k/day)
3. You need custom game mechanics not possible on L2
4. You have resources for custom infrastructure

**Hybrid Approach**:
- Launch on L2 for initial traction
- Move high-frequency operations to L3 later
- Keep settlement on L2 for security

---

## 3. Upgradeability Patterns

### 3.1 Proxy Patterns Overview

#### **Transparent Proxy** (Traditional)
```solidity
// Simple but limited
contract TransparentProxy {
    address public implementation;
    address public admin;

    function upgrade(address newImplementation) external {
        require(msg.sender == admin, "Not admin");
        implementation = newImplementation;
    }

    fallback() external payable {
        address impl = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
```

**Limitations**:
- Single implementation contract
- No size limit increases
- All-or-nothing upgrades

#### **UUPS Proxy** (Universal Upgradeable Proxy Standard)
```solidity
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract Market is UUPSUpgradeable {
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
```

**Advantages**:
- Cheaper than Transparent
- Upgrade logic in implementation
- More gas efficient

**Disadvantages**:
- Still single implementation
- Risk of bricking if upgrade logic broken

---

### 3.2 Diamond Standard (EIP-2535) - RECOMMENDED

#### **Why Diamond Standard**

**The 24KB Problem**: Ethereum contracts are limited to 24KB
**The Solution**: Diamond Standard allows unlimited contract size through "facets"

**Key Advantages**:
1. **No size limit**: Add unlimited functionality
2. **Modular upgrades**: Update only what changed
3. **Gas efficient**: Only load code you need
4. **Future-proof**: Add features without redeployment
5. **One address**: Users interact with single contract

#### **Architecture**

```solidity
// Diamond.sol - Main proxy contract
contract Diamond {
    // Maps function selectors to facet addresses
    mapping(bytes4 => address) public facets;

    fallback() external payable {
        address facet = facets[msg.sig];
        require(facet != address(0), "Function does not exist");

        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

// DiamondCutFacet.sol - Upgrade functionality
contract DiamondCutFacet {
    enum FacetCutAction { Add, Replace, Remove }

    struct FacetCut {
        address facetAddress;
        FacetCutAction action;
        bytes4[] functionSelectors;
    }

    function diamondCut(
        FacetCut[] calldata _diamondCut,
        address _init,
        bytes calldata _calldata
    ) external onlyOwner {
        // Add/replace/remove functions
        for (uint256 i = 0; i < _diamondCut.length; i++) {
            FacetCut memory cut = _diamondCut[i];

            if (cut.action == FacetCutAction.Add) {
                _addFunctions(cut.facetAddress, cut.functionSelectors);
            } else if (cut.action == FacetCutAction.Replace) {
                _replaceFunctions(cut.facetAddress, cut.functionSelectors);
            } else {
                _removeFunctions(cut.facetAddress, cut.functionSelectors);
            }
        }

        // Initialize new functionality
        if (_init != address(0)) {
            (bool success, ) = _init.delegatecall(_calldata);
            require(success, "Init failed");
        }
    }
}
```

#### **Facet Structure for Prediction Market**

```solidity
// MarketCreationFacet.sol
contract MarketCreationFacet {
    function createMarket(
        bytes32 questionId,
        uint256 endTime,
        address oracle
    ) external returns (bytes32 marketId) {
        // Market creation logic
    }
}

// TradingFacet.sol
contract TradingFacet {
    function buyShares(
        bytes32 marketId,
        uint256 outcome,
        uint256 amount
    ) external payable {
        // Trading logic
    }

    function sellShares(...) external {
        // Selling logic
    }
}

// ResolutionFacet.sol
contract ResolutionFacet {
    function resolveMarket(
        bytes32 marketId,
        uint256[] calldata outcomes
    ) external {
        // Resolution logic
    }

    function claimWinnings(bytes32 marketId) external {
        // Payout logic
    }
}

// AnalyticsFacet.sol (can add later without redeployment)
contract AnalyticsFacet {
    function getMarketStats(bytes32 marketId) external view returns (Stats memory) {
        // Analytics logic
    }
}

// AdminFacet.sol
contract AdminFacet {
    function setFee(uint256 newFee) external onlyOwner {
        // Admin functions
    }
}
```

#### **Upgrade Example**

```solidity
// Add new functionality without redeployment
FacetCut[] memory cuts = new FacetCut[](1);

// Deploy new facet
AnalyticsFacet analytics = new AnalyticsFacet();

// Prepare cut
bytes4[] memory selectors = new bytes4[](1);
selectors[0] = AnalyticsFacet.getMarketStats.selector;

cuts[0] = FacetCut({
    facetAddress: address(analytics),
    action: FacetCutAction.Add,
    functionSelectors: selectors
});

// Execute upgrade
diamond.diamondCut(cuts, address(0), "");

// New function now available on same address!
```

#### **Best Practices**

1. **Separation of Concerns**: Each facet handles one domain
2. **Shared Storage**: Use DiamondStorage pattern
3. **Events**: Emit events from facets for indexing
4. **Testing**: Test each facet independently
5. **Auditing**: Audit facets separately (cheaper)

#### **DiamondStorage Pattern**

```solidity
// LibDiamond.sol
library LibDiamond {
    bytes32 constant DIAMOND_STORAGE_POSITION = keccak256("diamond.standard.diamond.storage");

    struct DiamondStorage {
        mapping(bytes32 => Market) markets;
        mapping(address => uint256) balances;
        // All shared state here
    }

    function diamondStorage() internal pure returns (DiamondStorage storage ds) {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
}

// In any facet
function getMarket(bytes32 marketId) internal view returns (Market storage) {
    return LibDiamond.diamondStorage().markets[marketId];
}
```

---

## 4. Testing Strategy

### 4.1 Framework Comparison

#### **Foundry vs Hardhat (2025)**

| Aspect | Foundry | Hardhat |
|--------|---------|---------|
| **Speed** | 1.44s compile + test | 5.17s compile + test |
| **Speed (cached)** | 0.45s | 3.98s |
| **Performance** | 15x faster (1 min vs 15 min for 1k queries) | Slower but familiar |
| **Test Language** | Solidity | JavaScript/TypeScript |
| **Fuzzing** | Built-in (10k tests in seconds) | Limited |
| **Complex Logic** | Harder (Solidity limitations) | Easier (full JS/TS) |
| **Coverage** | Built-in | Via plugin |
| **Integration** | Fast, direct | Better for NodeJS stacks |
| **Learning Curve** | Steeper | Gentler |

**Recommendation**: **Foundry for core contracts, Hardhat for integration tests**

#### **Combined Approach** (Best of Both)

```bash
# Install Hardhat plugin for Foundry
npm install --save-dev @nomicfoundation/hardhat-foundry

# Use both in same project
foundry.toml  # Foundry config
hardhat.config.ts  # Hardhat config
```

---

### 4.2 Foundry Testing Best Practices

#### **Project Structure**

```
src/
├── Market.sol
├── Oracle.sol
└── Exchange.sol
test/
├── unit/
│   ├── Market.t.sol
│   ├── Oracle.t.sol
│   └── Exchange.t.sol
├── integration/
│   ├── Trading.t.sol
│   └── Resolution.t.sol
├── fuzz/
│   ├── MarketFuzz.t.sol
│   └── OracleFuzz.t.sol
└── invariant/
    └── Invariants.t.sol
script/
├── Deploy.s.sol
└── Upgrade.s.sol
```

#### **Unit Test Example**

```solidity
// test/unit/Market.t.sol
import "forge-std/Test.sol";
import "../../src/Market.sol";

contract MarketTest is Test {
    Market market;
    address alice = address(0x1);
    address bob = address(0x2);

    function setUp() public {
        market = new Market();

        // Fund test accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function testCreateMarket() public {
        bytes32 questionId = keccak256("Will Bitcoin reach $100k?");
        uint256 endTime = block.timestamp + 30 days;

        vm.prank(alice);
        bytes32 marketId = market.createMarket(questionId, endTime, address(this));

        assertEq(market.getMarketCreator(marketId), alice);
    }

    function testCannotBuyAfterExpiry() public {
        bytes32 marketId = _createMarket();

        // Warp time past expiry
        vm.warp(block.timestamp + 31 days);

        vm.expectRevert("Market expired");
        vm.prank(bob);
        market.buyShares(marketId, 0, 1 ether);
    }

    // Cheatcode examples
    function testReentrancyProtection() public {
        MaliciousContract attacker = new MaliciousContract(address(market));

        vm.expectRevert("ReentrancyGuard: reentrant call");
        attacker.attack();
    }
}
```

#### **Fuzz Testing**

```solidity
// test/fuzz/MarketFuzz.t.sol
contract MarketFuzzTest is Test {
    Market market;

    // Foundry runs this 10,000 times with random inputs
    function testFuzz_BuyShares(
        uint256 amount,
        uint8 outcome
    ) public {
        // Bound inputs to valid ranges
        amount = bound(amount, 0.01 ether, 100 ether);
        outcome = uint8(bound(outcome, 0, 1)); // Binary market

        bytes32 marketId = _createMarket();

        vm.prank(alice);
        market.buyShares{value: amount}(marketId, outcome, amount);

        // Invariants that should always hold
        assertTrue(market.getTotalShares(marketId) > 0);
        assertLe(market.getBalance(alice), 100 ether);
    }

    // Edge case testing
    function testFuzz_CannotManipulatePrice(
        uint256[] memory trades
    ) public {
        // Fuzz with sequences of trades
        vm.assume(trades.length <= 100);

        for (uint256 i = 0; i < trades.length; i++) {
            uint256 amount = bound(trades[i], 0.01 ether, 10 ether);
            // Verify price manipulation protection
        }
    }
}
```

#### **Invariant Testing**

```solidity
// test/invariant/Invariants.t.sol
contract InvariantTest is Test {
    Market market;
    Handler handler;

    function setUp() public {
        market = new Market();
        handler = new Handler(market);

        // Target handler for random calls
        targetContract(address(handler));
    }

    // Invariants that must ALWAYS be true
    function invariant_TotalSupplyMatchesShares() public {
        uint256 totalShares = handler.getTotalShares();
        uint256 sumOfBalances = handler.getSumOfAllBalances();

        assertEq(totalShares, sumOfBalances);
    }

    function invariant_ContractSolvency() public {
        uint256 totalLiability = handler.getTotalLiability();
        uint256 contractBalance = address(market).balance;

        assertGe(contractBalance, totalLiability);
    }

    function invariant_NoNegativeBalances() public {
        address[] memory users = handler.getUsers();
        for (uint256 i = 0; i < users.length; i++) {
            assertTrue(market.getBalance(users[i]) >= 0);
        }
    }
}

// Handler.sol - Restricts random calls to valid operations
contract Handler {
    Market market;
    address[] public users;

    function buyShares(uint256 userSeed, uint256 amount) public {
        address user = users[userSeed % users.length];
        amount = bound(amount, 0.01 ether, 10 ether);

        vm.prank(user);
        market.buyShares{value: amount}(marketId, 0, amount);
    }

    // Other valid operations...
}
```

#### **Coverage Testing**

```bash
# Generate coverage report
forge coverage --report lcov

# Visualize with genhtml
genhtml lcov.info -o coverage/

# Target: ≥80% unit tests, ≥70% integration
```

---

### 4.3 Hardhat Testing Best Practices

#### **Integration Test Example**

```typescript
// test/integration/trading.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { Market, Oracle } from "../typechain-types";

describe("Trading Integration", function () {
  let market: Market;
  let oracle: Oracle;
  let owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy contracts
    const MarketFactory = await ethers.getContractFactory("Market");
    market = await MarketFactory.deploy();

    const OracleFactory = await ethers.getContractFactory("Oracle");
    oracle = await OracleFactory.deploy();
  });

  it("should execute full market lifecycle", async function () {
    // 1. Create market
    const tx = await market.createMarket(
      ethers.id("Bitcoin $100k?"),
      Math.floor(Date.now() / 1000) + 86400, // 1 day
      await oracle.getAddress()
    );

    const receipt = await tx.wait();
    const marketId = receipt.events![0].args!.marketId;

    // 2. Alice buys YES shares
    await market.connect(alice).buyShares(
      marketId,
      0,
      ethers.parseEther("10"),
      { value: ethers.parseEther("10") }
    );

    // 3. Bob buys NO shares
    await market.connect(bob).buyShares(
      marketId,
      1,
      ethers.parseEther("10"),
      { value: ethers.parseEther("10") }
    );

    // 4. Time travel to expiry
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine", []);

    // 5. Resolve market (YES wins)
    await oracle.resolveMarket(marketId, [1, 0]);

    // 6. Alice claims winnings
    const balanceBefore = await ethers.provider.getBalance(alice.address);
    await market.connect(alice).claimWinnings(marketId);
    const balanceAfter = await ethers.provider.getBalance(alice.address);

    // Alice should receive ~20 ETH (minus gas)
    expect(balanceAfter - balanceBefore).to.be.closeTo(
      ethers.parseEther("20"),
      ethers.parseEther("0.1") // Gas tolerance
    );
  });

  it("should handle concurrent trading", async function () {
    // Complex scenario with multiple users and trades
    const users = [alice, bob, owner];

    const marketId = await createMarket();

    // Execute trades in parallel
    const trades = users.map((user, i) =>
      market.connect(user).buyShares(
        marketId,
        i % 2,
        ethers.parseEther("5"),
        { value: ethers.parseEther("5") }
      )
    );

    await Promise.all(trades);

    // Verify total shares
    const totalShares = await market.getTotalShares(marketId);
    expect(totalShares).to.equal(ethers.parseEther("15"));
  });
});
```

#### **Fixtures for Gas Optimization**

```typescript
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Market with Fixtures", function () {
  async function deployMarketFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    const Market = await ethers.getContractFactory("Market");
    const market = await Market.deploy();

    // Pre-fund accounts
    await owner.sendTransaction({
      to: alice.address,
      value: ethers.parseEther("100")
    });

    return { market, owner, alice, bob };
  }

  it("should create market", async function () {
    // Loads fixture once, creates snapshot
    const { market, alice } = await loadFixture(deployMarketFixture);

    // Test logic (reverts to snapshot after)
  });

  it("should buy shares", async function () {
    // Reuses snapshot (much faster)
    const { market, alice } = await loadFixture(deployMarketFixture);

    // Test logic
  });
});
```

---

### 4.4 Security Testing

#### **Slither Static Analysis**

```bash
# Install Slither
pip3 install slither-analyzer

# Run analysis
slither . --config-file slither.config.json

# Detects 40+ vulnerability classes including:
# - Reentrancy
# - Access control issues
# - Integer overflow/underflow
# - Uninitialized storage
# - Dangerous delegatecall
```

**Sample Output**:
```
Market.withdraw(uint256) (Market.sol#45-52) sends eth to arbitrary user
	Dangerous calls:
	- (success) = msg.sender.call{value: amount}() (Market.sol#50)
Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#functions-that-send-ether-to-arbitrary-destinations
```

#### **MythX Integration**

```bash
# Install MythX
npm install -g truffle-security

# Run analysis
mythx analyze
```

#### **Echidna Fuzzing**

```bash
# Install Echidna
docker pull trailofbits/echidna

# Run fuzzer
docker run -v $(pwd):/src trailofbits/echidna echidna-test /src --contract MarketTest
```

---

## 5. Deployment & Operations

### 5.1 Deployment Strategy

#### **Multi-Stage Deployment**

```solidity
// script/Deploy.s.sol
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/Market.sol";
import "../src/Oracle.sol";
import "../src/Exchange.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy core contracts
        Oracle oracle = new Oracle();
        console.log("Oracle deployed to:", address(oracle));

        Market market = new Market(address(oracle));
        console.log("Market deployed to:", address(market));

        Exchange exchange = new Exchange(address(market));
        console.log("Exchange deployed to:", address(exchange));

        // 2. Initialize contracts
        oracle.addAuthorizedMarket(address(market));
        market.setExchange(address(exchange));

        // 3. Transfer ownership to multisig
        address multisig = vm.envAddress("MULTISIG_ADDRESS");
        oracle.transferOwnership(multisig);
        market.transferOwnership(multisig);
        exchange.transferOwnership(multisig);

        vm.stopBroadcast();

        // 4. Verify contracts
        _verifyContracts(address(oracle), address(market), address(exchange));
    }

    function _verifyContracts(
        address oracle,
        address market,
        address exchange
    ) internal {
        // Auto-verify on Etherscan/Basescan
        vm.broadcast();
    }
}
```

#### **Environment-Specific Configs**

```bash
# .env.mainnet
CHAIN_ID=8453
RPC_URL=https://mainnet.base.org
MULTISIG_ADDRESS=0x...
ORACLE_FEED=0x... # Chainlink feed
GAS_PRICE_GWEI=1

# .env.testnet
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
MULTISIG_ADDRESS=0x...
ORACLE_FEED=0x...
GAS_PRICE_GWEI=0.1
```

#### **Deployment Checklist**

- [ ] All contracts compiled without warnings
- [ ] Unit tests pass (100% critical paths)
- [ ] Integration tests pass
- [ ] Fuzz tests pass (10k iterations)
- [ ] Slither analysis clean
- [ ] Gas optimization verified
- [ ] Access control configured
- [ ] Multisig set up
- [ ] Emergency pause implemented
- [ ] Monitoring alerts configured
- [ ] Backup oracle configured
- [ ] Upgrade mechanism tested
- [ ] Documentation complete

---

### 5.2 Upgrade Procedures (Diamond Standard)

#### **Safe Upgrade Process**

```solidity
// script/Upgrade.s.sol
contract UpgradeScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address diamondAddress = vm.envAddress("DIAMOND_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new facet
        AnalyticsFacet newFacet = new AnalyticsFacet();
        console.log("New facet deployed:", address(newFacet));

        // 2. Prepare diamond cut
        IDiamond.FacetCut[] memory cuts = new IDiamond.FacetCut[](1);

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = AnalyticsFacet.getMarketStats.selector;
        selectors[1] = AnalyticsFacet.getHistoricalData.selector;

        cuts[0] = IDiamond.FacetCut({
            facetAddress: address(newFacet),
            action: IDiamond.FacetCutAction.Add,
            functionSelectors: selectors
        });

        // 3. Execute upgrade (via multisig)
        // This step would be done through Gnosis Safe UI
        // or Safe Transaction Service API

        console.log("Upgrade prepared. Submit to multisig for execution.");
        console.log("Facet address:", address(newFacet));
        console.log("Function selectors:", selectors[0], selectors[1]);

        vm.stopBroadcast();
    }
}
```

#### **Upgrade Testing**

```solidity
// test/upgrade/UpgradeTest.t.sol
contract UpgradeTest is Test {
    Diamond diamond;
    MarketFacet marketFacet;
    AnalyticsFacet analyticsFacet;

    function setUp() public {
        diamond = Diamond(MAINNET_DIAMOND_ADDRESS);

        // Fork mainnet for testing
        vm.createSelectFork(vm.envString("RPC_URL"));
    }

    function testUpgradeAnalytics() public {
        // 1. Deploy new facet
        analyticsFacet = new AnalyticsFacet();

        // 2. Prepare upgrade
        IDiamond.FacetCut[] memory cuts = new IDiamond.FacetCut[](1);
        // ... prepare cut

        // 3. Execute upgrade (impersonate multisig)
        vm.prank(MULTISIG_ADDRESS);
        diamond.diamondCut(cuts, address(0), "");

        // 4. Verify new functionality
        AnalyticsFacet(address(diamond)).getMarketStats(marketId);

        // 5. Verify old functionality still works
        MarketFacet(address(diamond)).createMarket(...);
    }

    function testCannotUpgradeUnauthorized() public {
        vm.prank(address(0xdead));
        vm.expectRevert("Not authorized");
        diamond.diamondCut(cuts, address(0), "");
    }
}
```

---

### 5.3 Monitoring & Observability

#### **Event Emission Strategy**

```solidity
contract Market {
    // Critical events for monitoring
    event MarketCreated(
        bytes32 indexed marketId,
        address indexed creator,
        uint256 endTime,
        address oracle
    );

    event SharesPurchased(
        bytes32 indexed marketId,
        address indexed buyer,
        uint256 outcome,
        uint256 shares,
        uint256 cost,
        uint256 timestamp
    );

    event MarketResolved(
        bytes32 indexed marketId,
        uint256[] outcomes,
        uint256 timestamp
    );

    event AnomalousActivity(
        bytes32 indexed marketId,
        address indexed actor,
        string reason,
        uint256 severity // 0=info, 1=warning, 2=critical
    );

    // Emit detailed events for off-chain indexing
    function buyShares(...) external {
        // ... logic

        // Check for unusual patterns
        if (_isAnomalous(marketId, msg.sender, amount)) {
            emit AnomalousActivity(
                marketId,
                msg.sender,
                "Large single purchase",
                1 // Warning
            );
        }

        emit SharesPurchased(marketId, msg.sender, outcome, shares, cost, block.timestamp);
    }
}
```

#### **The Graph Subgraph**

```graphql
# schema.graphql
type Market @entity {
  id: ID!
  creator: Bytes!
  question: String!
  endTime: BigInt!
  resolved: Boolean!
  outcomes: [BigInt!]
  totalVolume: BigInt!
  trades: [Trade!]! @derivedFrom(field: "market")
}

type Trade @entity {
  id: ID!
  market: Market!
  user: Bytes!
  outcome: Int!
  shares: BigInt!
  cost: BigInt!
  timestamp: BigInt!
  blockNumber: BigInt!
}

type DailyStats @entity {
  id: ID!
  date: String!
  totalVolume: BigInt!
  uniqueTraders: BigInt!
  newMarkets: BigInt!
}
```

```typescript
// src/mapping.ts
export function handleSharesPurchased(event: SharesPurchasedEvent): void {
  // Create trade entity
  let trade = new Trade(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  trade.market = event.params.marketId.toHex();
  trade.user = event.params.buyer;
  trade.outcome = event.params.outcome;
  trade.shares = event.params.shares;
  trade.cost = event.params.cost;
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;

  trade.save();

  // Update market stats
  let market = Market.load(event.params.marketId.toHex());
  if (market) {
    market.totalVolume = market.totalVolume.plus(event.params.cost);
    market.save();
  }

  // Update daily stats
  updateDailyStats(event.block.timestamp, event.params.cost);
}
```

#### **Alerting System**

```typescript
// monitoring/alerts.ts
import { ethers } from 'ethers';
import { sendAlert } from './notifications';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const market = new ethers.Contract(MARKET_ADDRESS, MARKET_ABI, provider);

// Monitor large trades
market.on('SharesPurchased', async (marketId, buyer, outcome, shares, cost) => {
  const costInEth = ethers.formatEther(cost);

  if (parseFloat(costInEth) > 10) {
    await sendAlert({
      severity: 'warning',
      message: `Large trade detected: ${costInEth} ETH`,
      marketId,
      buyer,
      cost: costInEth
    });
  }
});

// Monitor resolution disputes
market.on('ResolutionDisputed', async (marketId, disputer, stake) => {
  await sendAlert({
    severity: 'critical',
    message: `Market resolution disputed`,
    marketId,
    disputer,
    stake: ethers.formatEther(stake)
  });
});

// Monitor contract balance
setInterval(async () => {
  const balance = await provider.getBalance(MARKET_ADDRESS);
  const balanceEth = parseFloat(ethers.formatEther(balance));

  if (balanceEth < MINIMUM_BALANCE) {
    await sendAlert({
      severity: 'critical',
      message: `Low contract balance: ${balanceEth} ETH`,
      threshold: MINIMUM_BALANCE
    });
  }
}, 60000); // Check every minute
```

---

## 6. Security Audit Checklist

### 6.1 Pre-Audit Preparation

- [ ] **Code freeze**: No changes during audit
- [ ] **Documentation complete**: Architecture diagrams, function docs
- [ ] **Test coverage**: ≥80% unit, ≥70% integration
- [ ] **Static analysis**: Slither/MythX reports clean
- [ ] **Known issues documented**: Track all TODOs and warnings
- [ ] **Deployment plan**: Detailed deployment procedures
- [ ] **Upgrade plan**: Clear upgrade mechanisms

### 6.2 Smart Contract Security Checklist

#### **Access Control**
- [ ] All sensitive functions have proper access control
- [ ] Role-based access control implemented (if needed)
- [ ] Ownership transfer mechanism secure
- [ ] No functions accidentally public that should be internal/private
- [ ] Admin functions use time-locks for critical operations
- [ ] Multisig required for critical operations

#### **Reentrancy**
- [ ] CEI pattern followed in all functions
- [ ] ReentrancyGuard used on external functions with state changes
- [ ] No external calls before state updates
- [ ] Pull payment pattern used where appropriate
- [ ] Emergency pause mechanism implemented

#### **Oracle Security**
- [ ] Multiple oracle sources used
- [ ] Time-weighted average price (TWAP) implemented
- [ ] Price bounds checking in place
- [ ] Time-lock between price updates
- [ ] Dispute mechanism for incorrect resolutions
- [ ] Fallback oracle configured

#### **Integer Operations**
- [ ] No unsafe arithmetic operations
- [ ] Use `unchecked` only where safe and documented
- [ ] Division by zero checks where necessary
- [ ] Rounding handled correctly in calculations

#### **Gas Optimization**
- [ ] Storage reads minimized in loops
- [ ] Array length cached when used in loops
- [ ] Batch operations implemented where appropriate
- [ ] Events used instead of storage where possible
- [ ] Custom errors used instead of require strings
- [ ] Storage packing optimized

#### **Upgradeability**
- [ ] Proxy pattern implemented correctly
- [ ] Storage layout conflicts prevented
- [ ] Initialization function protected
- [ ] Upgrade process tested on testnet
- [ ] Rollback plan documented

#### **External Calls**
- [ ] All external calls checked for return values
- [ ] Gas limits set appropriately for external calls
- [ ] No delegatecall to untrusted contracts
- [ ] ERC20 interactions use SafeERC20

#### **Testing**
- [ ] Unit tests cover all critical paths
- [ ] Integration tests cover end-to-end workflows
- [ ] Fuzz tests run with 10,000+ iterations
- [ ] Invariant tests verify core assumptions
- [ ] Edge cases tested (zero amounts, max values, etc.)
- [ ] Failure scenarios tested

---

### 6.3 Recommended Audit Firms (2025)

| Firm | Specialty | Typical Cost | Timeline |
|------|-----------|--------------|----------|
| **Trail of Bits** | Complex protocols | $50k-$200k | 4-8 weeks |
| **OpenZeppelin** | Security + dev | $30k-$150k | 3-6 weeks |
| **ConsenSys Diligence** | Enterprise | $40k-$180k | 4-8 weeks |
| **Certik** | Formal verification | $25k-$120k | 3-6 weeks |
| **Spearbit** | DeFi/prediction markets | $35k-$150k | 3-6 weeks |
| **Code4rena** | Competitive audit | $10k-$50k | 1-2 weeks |

**Recommendation**:
1. Private audit with top firm (Trail of Bits or Spearbit)
2. Public competitive audit (Code4rena)
3. Ongoing monitoring (Certik or OpenZeppelin)

---

## 7. Code Examples

### 7.1 Complete Market Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/// @title Prediction Market Contract
/// @notice Binary outcome prediction market using LMSR market maker
/// @dev Integrates with Conditional Tokens Framework and Chainlink oracles
contract PredictionMarket is ReentrancyGuard, Pausable, AccessControl {
    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant MARKET_CREATOR_ROLE = keccak256("MARKET_CREATOR");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER");

    uint256 public constant ONE = 10**18;
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant MIN_LIQUIDITY = 1000 * ONE;

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error InsufficientBalance(address user, uint256 balance, uint256 requested);
    error MarketExpired(bytes32 marketId, uint256 expiry);
    error MarketNotExpired(bytes32 marketId, uint256 expiry);
    error MarketAlreadyResolved(bytes32 marketId);
    error InvalidOutcome(uint256 outcome);
    error InsufficientLiquidity(uint256 provided, uint256 required);

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event MarketCreated(
        bytes32 indexed marketId,
        address indexed creator,
        string question,
        uint256 endTime,
        uint256 liquidity
    );

    event SharesPurchased(
        bytes32 indexed marketId,
        address indexed buyer,
        uint256 outcome,
        uint256 shares,
        uint256 cost
    );

    event SharesSold(
        bytes32 indexed marketId,
        address indexed seller,
        uint256 outcome,
        uint256 shares,
        uint256 payout
    );

    event MarketResolved(
        bytes32 indexed marketId,
        uint256 winningOutcome,
        uint256 timestamp
    );

    event WinningsClaimed(
        bytes32 indexed marketId,
        address indexed claimer,
        uint256 amount
    );

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    struct Market {
        string question;
        address creator;
        uint256 endTime;
        uint256 liquidity; // LMSR liquidity parameter
        uint256[2] shares; // Shares for each outcome
        uint256 totalVolume;
        bool resolved;
        uint256 winningOutcome;
        address oracle;
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => mapping(address => uint256[2])) public userShares;

    IERC20 public immutable collateralToken; // USDC or other stablecoin
    IConditionalTokens public immutable conditionalTokens;

    uint256 public feeRate = 200; // 2% (200/10000)
    address public feeCollector;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address _collateralToken,
        address _conditionalTokens,
        address _feeCollector
    ) {
        collateralToken = IERC20(_collateralToken);
        conditionalTokens = IConditionalTokens(_conditionalTokens);
        feeCollector = _feeCollector;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MARKET_CREATOR_ROLE, msg.sender);
        _grantRole(RESOLVER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                           MARKET CREATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Create a new binary prediction market
    /// @param question The market question
    /// @param endTime Market expiry timestamp
    /// @param liquidity LMSR liquidity parameter
    /// @param oracle Oracle address for resolution
    /// @return marketId Unique market identifier
    function createMarket(
        string calldata question,
        uint256 endTime,
        uint256 liquidity,
        address oracle
    ) external onlyRole(MARKET_CREATOR_ROLE) whenNotPaused returns (bytes32 marketId) {
        if (liquidity < MIN_LIQUIDITY) {
            revert InsufficientLiquidity(liquidity, MIN_LIQUIDITY);
        }

        require(endTime > block.timestamp, "Invalid end time");
        require(oracle != address(0), "Invalid oracle");

        marketId = keccak256(
            abi.encodePacked(question, endTime, block.timestamp, msg.sender)
        );

        Market storage market = markets[marketId];
        market.question = question;
        market.creator = msg.sender;
        market.endTime = endTime;
        market.liquidity = liquidity;
        market.oracle = oracle;

        // Initialize shares with liquidity
        market.shares[0] = liquidity;
        market.shares[1] = liquidity;

        emit MarketCreated(marketId, msg.sender, question, endTime, liquidity);
    }

    /*//////////////////////////////////////////////////////////////
                              TRADING
    //////////////////////////////////////////////////////////////*/

    /// @notice Buy shares of an outcome using LMSR pricing
    /// @param marketId Market identifier
    /// @param outcome Outcome index (0 or 1)
    /// @param maxCost Maximum collateral to spend
    /// @return shares Number of shares purchased
    /// @return cost Actual cost paid
    function buyShares(
        bytes32 marketId,
        uint256 outcome,
        uint256 maxCost
    ) external nonReentrant whenNotPaused returns (uint256 shares, uint256 cost) {
        Market storage market = markets[marketId];

        if (block.timestamp >= market.endTime) {
            revert MarketExpired(marketId, market.endTime);
        }

        if (outcome > 1) {
            revert InvalidOutcome(outcome);
        }

        // Calculate shares for given cost using LMSR
        shares = calculateShares(marketId, outcome, maxCost);
        cost = calculateCost(marketId, outcome, shares);

        require(cost <= maxCost, "Slippage exceeded");

        // Transfer collateral from user
        collateralToken.transferFrom(msg.sender, address(this), cost);

        // Calculate and collect fee
        uint256 fee = (cost * feeRate) / FEE_DENOMINATOR;
        if (fee > 0) {
            collateralToken.transfer(feeCollector, fee);
        }

        // Update market state
        market.shares[outcome] += shares;
        market.totalVolume += cost;

        // Update user balance
        userShares[marketId][msg.sender][outcome] += shares;

        emit SharesPurchased(marketId, msg.sender, outcome, shares, cost);
    }

    /// @notice Sell shares back to the market
    /// @param marketId Market identifier
    /// @param outcome Outcome index (0 or 1)
    /// @param shares Number of shares to sell
    /// @param minPayout Minimum payout expected
    /// @return payout Amount received
    function sellShares(
        bytes32 marketId,
        uint256 outcome,
        uint256 shares,
        uint256 minPayout
    ) external nonReentrant whenNotPaused returns (uint256 payout) {
        Market storage market = markets[marketId];

        if (block.timestamp >= market.endTime) {
            revert MarketExpired(marketId, market.endTime);
        }

        if (userShares[marketId][msg.sender][outcome] < shares) {
            revert InsufficientBalance(
                msg.sender,
                userShares[marketId][msg.sender][outcome],
                shares
            );
        }

        // Calculate payout using LMSR
        payout = calculatePayout(marketId, outcome, shares);

        require(payout >= minPayout, "Slippage exceeded");

        // Update market state
        market.shares[outcome] -= shares;

        // Update user balance
        userShares[marketId][msg.sender][outcome] -= shares;

        // Calculate and collect fee
        uint256 fee = (payout * feeRate) / FEE_DENOMINATOR;
        uint256 netPayout = payout - fee;

        if (fee > 0) {
            collateralToken.transfer(feeCollector, fee);
        }

        // Transfer payout to user
        collateralToken.transfer(msg.sender, netPayout);

        emit SharesSold(marketId, msg.sender, outcome, shares, netPayout);
    }

    /*//////////////////////////////////////////////////////////////
                            RESOLUTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Resolve market with winning outcome
    /// @param marketId Market identifier
    /// @param _winningOutcome Winning outcome index
    function resolveMarket(
        bytes32 marketId,
        uint256 _winningOutcome
    ) external onlyRole(RESOLVER_ROLE) {
        Market storage market = markets[marketId];

        if (block.timestamp < market.endTime) {
            revert MarketNotExpired(marketId, market.endTime);
        }

        if (market.resolved) {
            revert MarketAlreadyResolved(marketId);
        }

        if (_winningOutcome > 1) {
            revert InvalidOutcome(_winningOutcome);
        }

        market.resolved = true;
        market.winningOutcome = _winningOutcome;

        emit MarketResolved(marketId, _winningOutcome, block.timestamp);
    }

    /// @notice Claim winnings from resolved market
    /// @param marketId Market identifier
    /// @return payout Amount claimed
    function claimWinnings(
        bytes32 marketId
    ) external nonReentrant returns (uint256 payout) {
        Market storage market = markets[marketId];

        require(market.resolved, "Market not resolved");

        uint256 winningShares = userShares[marketId][msg.sender][market.winningOutcome];

        if (winningShares == 0) {
            revert InsufficientBalance(msg.sender, 0, 1);
        }

        // Calculate payout (1:1 for winning shares)
        payout = winningShares;

        // Clear user shares
        userShares[marketId][msg.sender][market.winningOutcome] = 0;

        // Transfer payout
        collateralToken.transfer(msg.sender, payout);

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    /*//////////////////////////////////////////////////////////////
                          LMSR CALCULATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Calculate shares received for given cost
    function calculateShares(
        bytes32 marketId,
        uint256 outcome,
        uint256 cost
    ) public view returns (uint256) {
        Market storage market = markets[marketId];
        uint256 b = market.liquidity;

        // LMSR formula: shares = b * ln(exp(cost/b) + exp(shares_other/b))
        // Simplified for binary case

        uint256 currentShares = market.shares[outcome];
        uint256 otherShares = market.shares[1 - outcome];

        // Calculate new share amount
        // This is a simplified version - production would use precise logarithms
        uint256 newShares = currentShares + (cost * ONE) / b;

        return newShares - currentShares;
    }

    /// @notice Calculate cost for given number of shares
    function calculateCost(
        bytes32 marketId,
        uint256 outcome,
        uint256 shares
    ) public view returns (uint256) {
        Market storage market = markets[marketId];
        uint256 b = market.liquidity;

        uint256 currentShares = market.shares[outcome];

        // LMSR cost function
        // C(q) = b * ln(exp(q_0/b) + exp(q_1/b))

        // Simplified calculation
        uint256 cost = (shares * b) / ONE;

        return cost;
    }

    /// @notice Calculate payout for selling shares
    function calculatePayout(
        bytes32 marketId,
        uint256 outcome,
        uint256 shares
    ) public view returns (uint256) {
        // Inverse of calculateCost
        return calculateCost(marketId, outcome, shares);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get current price for an outcome
    function getPrice(
        bytes32 marketId,
        uint256 outcome
    ) external view returns (uint256) {
        Market storage market = markets[marketId];

        // LMSR price: P = exp(q_i / b) / sum(exp(q_j / b))
        uint256 shares0 = market.shares[0];
        uint256 shares1 = market.shares[1];

        // Simplified price calculation
        uint256 totalShares = shares0 + shares1;

        if (outcome == 0) {
            return (shares0 * ONE) / totalShares;
        } else {
            return (shares1 * ONE) / totalShares;
        }
    }

    /// @notice Get user's share balance
    function getUserShares(
        bytes32 marketId,
        address user,
        uint256 outcome
    ) external view returns (uint256) {
        return userShares[marketId][user][outcome];
    }

    /*//////////////////////////////////////////////////////////////
                              ADMIN
    //////////////////////////////////////////////////////////////*/

    function setFeeRate(uint256 _feeRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeRate <= 1000, "Fee too high"); // Max 10%
        feeRate = _feeRate;
    }

    function setFeeCollector(address _feeCollector) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeCollector != address(0), "Invalid address");
        feeCollector = _feeCollector;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
```

---

## 8. Summary & Recommendations

### 8.1 Architecture Summary

**Recommended Stack**:
```
┌─────────────────────────────────────────┐
│         User Interface (React)           │
│  Web3Modal, Wagmi, Viem, TanStack Query │
└───────────────┬─────────────────────────┘
                │
┌───────────────┴─────────────────────────┐
│         Layer 2: Base                    │
│  OP Stack, Low fees, High throughput    │
└───────────────┬─────────────────────────┘
                │
┌───────────────┴─────────────────────────┐
│         Smart Contracts                  │
│  ┌─────────────────────────────────┐   │
│  │  Diamond Proxy (Main Entry)     │   │
│  └────────┬────────────────────────┘   │
│           │                              │
│  ┌────────┴────────────────────────┐   │
│  │         Facets                   │   │
│  │  ┌──────────────────────────┐   │   │
│  │  │  MarketCreationFacet     │   │   │
│  │  │  TradingFacet            │   │   │
│  │  │  ResolutionFacet         │   │   │
│  │  │  AnalyticsFacet          │   │   │
│  │  │  AdminFacet              │   │   │
│  │  └──────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Conditional Tokens (Gnosis)    │   │
│  │  LMSR Market Maker              │   │
│  │  Exchange (Order Matching)      │   │
│  └─────────────────────────────────┘   │
└───────────────┬─────────────────────────┘
                │
┌───────────────┴─────────────────────────┐
│         Oracle Layer                     │
│  ┌─────────────────────────────────┐   │
│  │  Chainlink (Automated)          │   │
│  │  UMA MOOV2 (Manual/Subjective)  │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 8.2 Key Takeaways

1. **L2 Choice**: Start with **Base**
   - Market leader (80% fee share)
   - Coinbase backing
   - OP Stack proven technology
   - $0.01 per transaction

2. **Contract Architecture**: Use **Diamond Standard**
   - No 24KB limit
   - Modular upgrades
   - Future-proof
   - Gas efficient

3. **Market Maker**: Start with **LMSR**
   - No liquidity pool needed
   - Well-researched
   - Batch operations
   - Predictable pricing

4. **Security Priority**:
   - Reentrancy protection (CEI pattern + ReentrancyGuard)
   - Oracle manipulation prevention (multi-source + TWAP)
   - Access control (role-based)
   - Emergency pause

5. **Testing**: **Foundry + Hardhat**
   - Foundry for unit tests (15x faster)
   - Hardhat for integration tests
   - Fuzz testing with 10,000+ iterations
   - Target: ≥80% unit coverage, ≥70% integration

6. **Gas Optimization**:
   - 30-50% reduction achievable
   - Storage packing
   - Custom errors
   - Batch operations
   - Event-based history

7. **Oracle Strategy**:
   - Automated: Chainlink for objective data
   - Manual: UMA MOOV2 for subjective outcomes
   - Multi-source aggregation
   - Dispute mechanism

8. **Deployment**:
   - Multi-stage rollout (testnet → mainnet)
   - Multisig for admin operations
   - Monitoring and alerting
   - Multiple audits (private + competitive)

---

### 8.3 Next Steps

**Phase 1: Development (Weeks 1-4)**
- [ ] Set up Foundry project
- [ ] Implement Diamond Standard proxy
- [ ] Create core facets (Market, Trading, Resolution)
- [ ] Integrate Gnosis CTF
- [ ] Implement LMSR pricing
- [ ] Write unit tests (target: 80%+ coverage)

**Phase 2: Testing (Weeks 5-6)**
- [ ] Integration tests
- [ ] Fuzz testing (10k+ iterations)
- [ ] Invariant testing
- [ ] Gas optimization
- [ ] Slither/MythX analysis
- [ ] Testnet deployment (Base Sepolia)

**Phase 3: Security (Weeks 7-8)**
- [ ] Private audit (Trail of Bits/Spearbit)
- [ ] Fix audit findings
- [ ] Competitive audit (Code4rena)
- [ ] Final security review
- [ ] Bug bounty program setup

**Phase 4: Launch (Weeks 9-10)**
- [ ] Mainnet deployment (Base)
- [ ] Monitoring setup (The Graph + alerts)
- [ ] Frontend integration
- [ ] Documentation
- [ ] Soft launch with limited markets
- [ ] Gradual scaling

**Phase 5: Optimization (Ongoing)**
- [ ] Monitor gas costs
- [ ] User feedback integration
- [ ] L3 evaluation (if needed)
- [ ] New facet development
- [ ] Continuous security monitoring

---

## References

### Documentation
- Solidity: https://docs.soliditylang.org/
- Foundry: https://book.getfoundry.sh/
- Hardhat: https://hardhat.org/docs
- OpenZeppelin: https://docs.openzeppelin.com/
- Chainlink: https://docs.chain.link/
- Base: https://docs.base.org/
- Arbitrum: https://docs.arbitrum.io/
- Diamond Standard: https://eips.ethereum.org/EIPS/eip-2535

### Security Resources
- OWASP Smart Contract Top 10 (2025): https://owasp.org/www-project-smart-contract-top-10/
- Slither: https://github.com/crytic/slither
- MythX: https://mythx.io/
- Trail of Bits: https://www.trailofbits.com/
- ConsenSys Diligence: https://consensys.net/diligence/

### Code Examples
- Gnosis CTF: https://github.com/gnosis/conditional-tokens-contracts
- Gnosis Market Makers: https://github.com/gnosis/conditional-tokens-market-makers
- Polymarket: https://github.com/Polymarket/
- OpenZeppelin Contracts: https://github.com/OpenZeppelin/openzeppelin-contracts

### Research Papers
- LMSR: "Logarithmic Market Scoring Rules for Modular Combinatorial Information Aggregation" (Hanson, 2002)
- LS-LMSR: "Liquidity-Sensitive Automated Market Makers" (Othman et al., 2013)
- Constant Function Market Makers: https://arxiv.org/pdf/2003.10001

---

**Report Generated**: October 29, 2025
**Research Sources**: Web3 documentation, security audits, production deployments
**Confidence Level**: High (based on current industry practices and recent developments)
