# NFT Drop Implementation Plan (BAB-66)

**Related Issues**: 
- [BAB-66 - NFT Drop Technical Setup](https://linear.app/eliza-labs/issue/BAB-66/nft-drop-technical-setup-mainnet-ethereum)
- [BAB-85 - NFT Gallery Page](https://linear.app/eliza-labs/issue/BAB-85/nft-gallery-page-display-collection-with-metadata-and-stories)

**Created**: 2026-01-11  
**Status**: Planning Phase  

---

## Executive Summary

This plan covers the end-to-end implementation of the **ProtoMonkeys NFT Drop** on **Ethereum**:
- **ERC-721 smart contract** with allowlist-gated minting via ECDSA signatures
- **Backend API** for eligibility verification, signature generation, and on-chain mint confirmation
- **Frontend integration** with existing `useNftMint` hook and Privy smart wallets
- **Comprehensive testing** including Foundry contract tests and Synpress e2e tests
- **Deployment automation** via existing CLI tooling

**Key Constraint**: The user has explicitly requested "100% functionality with NO issues" and "do not simplify anything or stub it."

---

## Table of Contents

1. [Requirements & Constraints](#1-requirements--constraints)
2. [Architecture Overview](#2-architecture-overview)
3. [Smart Contract Design](#3-smart-contract-design)
4. [Backend Implementation](#4-backend-implementation)
5. [Frontend Implementation](#5-frontend-implementation)
6. [Database Schema](#6-database-schema)
7. [Deployment Strategy](#7-deployment-strategy)
8. [Testing Strategy](#8-testing-strategy)
9. [Environment Variables](#9-environment-variables)
10. [Implementation Phases](#10-implementation-phases)
11. [Risks & Mitigations](#11-risks--mitigations)
12. [Clarifying Questions](#12-clarifying-questions)

---

## 1. Requirements & Constraints

### 1.1 Functional Requirements

| Requirement | Description |
|-------------|-------------|
| **ERC-721 Standard** | Fully compliant ERC-721 with metadata extension |
| **Ethereum** | Deploy to Ethereum mainnet (chain ID 1) |
| **Max Supply** | 100 NFTs (token IDs 1-100) |
| **Eligibility Gating** | Only top 100 leaderboard users (from `nftSnapshot` table) can mint |
| **One Mint Per Wallet** | Each eligible wallet can only mint once |
| **Random Assignment** | Token ID assigned randomly from available pool |
| **Gasless Minting** | Users mint via Privy smart wallets (gasless UX) |
| **Placeholder Metadata** | Initial deployment uses placeholder images/metadata |

### 1.2 Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| **Security** | ECDSA signature verification for allowlist; no direct allowlist storage on-chain |
| **Gas Efficiency** | Optimized storage patterns; single mint function |
| **Upgradeability** | NOT upgradeable (simple, auditable contract) |
| **Decentralization** | Metadata via IPFS/Arweave (future); API endpoint initially |

### 1.3 Technical Constraints (from AGENTS.md)

- Bun + TypeScript ESM
- No `any`; avoid `unknown`
- Apps thin (validate → call service → map errors)
- Domain logic in `packages/` (framework-agnostic)
- Quality gate: `bun run typecheck && bun run lint && bun run build && tests`
- Git branch: `staging`, prefixed commits (`feat:`, `fix:`, `chore:`)

### 1.4 Existing Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| Hardhat/Foundry config | `packages/contracts/` | ✅ Exists |
| Deploy CLI | `apps/cli/src/commands/deploy.ts` | ✅ Exists |
| Database schema | `packages/db/src/schema/nft.ts` | ✅ Exists |
| NFT hooks | `apps/web/src/hooks/useNftMint.ts` | ✅ Exists |
| Synpress setup | `packages/testing/synpress/` | ✅ Exists |
| Smart wallet hook | `apps/web/src/hooks/useSmartWallet.ts` | ✅ Exists |
| NFT verification service | `packages/api/src/services/nft-verification-service.ts` | ✅ Exists |

---

## 2. Architecture Overview

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
│  ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────────────┐  │
│  │  /nft page       │  │  useNftMint hook  │  │  useSmartWallet hook     │  │
│  │  - Eligibility   │──│  - Prepare mint   │──│  - Send gasless tx       │  │
│  │  - Mint button   │  │  - Confirm mint   │  │  - Privy smart wallet    │  │
│  └──────────────────┘  └───────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Next.js API)                           │
│  ┌────────────────────────┐  ┌────────────────────────────────────────────┐ │
│  │ /api/nft/eligibility   │  │ /api/nft/mint/prepare                      │ │
│  │ - Check nftSnapshot    │  │ - Verify eligibility                       │ │
│  │ - Return rank/status   │  │ - Generate ECDSA signature                 │ │
│  └────────────────────────┘  │ - Return signature + deadline + tx data    │ │
│                              └────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ /api/nft/mint/confirm                                                  │ │
│  │ - Receive txHash + walletAddress                                       │ │
│  │ - Verify on-chain Transfer event via viem                              │ │
│  │ - Extract actual tokenId from event logs                               │ │
│  │ - Update nftOwnership + nftClaims tables                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ /api/nft/metadata/[tokenId]                                            │ │
│  │ - Serve ERC-721 JSON metadata                                          │ │
│  │ - Read from nftCollection table                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SMART CONTRACT (Ethereum)                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  ProtoMonkeysNFT.sol (ERC-721)                                         │ │
│  │                                                                         │ │
│  │  State:                                                                │ │
│  │  - MAX_SUPPLY = 100                                                    │ │
│  │  - signer (address) - backend's signing address                        │ │
│  │  - hasMinted (mapping address => bool)                                 │ │
│  │  - usedNonces (mapping bytes32 => bool)                                │ │
│  │  - availableTokenIds (uint256[] or bitmap)                             │ │
│  │  - baseURI (string)                                                    │ │
│  │                                                                         │ │
│  │  Functions:                                                            │ │
│  │  - mint(address to, uint256 deadline, bytes32 nonce, bytes signature)  │ │
│  │    - Verify signature from trusted signer                              │ │
│  │    - Check deadline not expired                                        │ │
│  │    - Check nonce not used                                              │ │
│  │    - Check hasMinted[to] == false                                      │ │
│  │    - Pick random tokenId from available pool                           │ │
│  │    - Mint to `to` address                                              │ │
│  │                                                                         │ │
│  │  - setBaseURI(string) - owner only                                     │ │
│  │  - setSigner(address) - owner only                                     │ │
│  │  - tokenURI(uint256) - returns baseURI + tokenId                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE (PostgreSQL)                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  nftCollection  │  │  nftOwnership   │  │  nftClaims                  │  │
│  │  - 100 NFTs     │  │  - Current      │  │  - Original mint records    │  │
│  │  - metadata     │  │    owners       │  │  - txHash, tokenId          │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  nftSnapshot (eligibility)                                              ││
│  │  - walletAddress, rank, points, snapshotAt                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Mint Flow Sequence

```
User                    Frontend                Backend                 Contract
 │                         │                       │                       │
 │  Click "Mint NFT"       │                       │                       │
 │────────────────────────>│                       │                       │
 │                         │  GET /eligibility     │                       │
 │                         │──────────────────────>│                       │
 │                         │  { eligible: true }   │                       │
 │                         │<──────────────────────│                       │
 │                         │                       │                       │
 │                         │  POST /mint/prepare   │                       │
 │                         │  { walletAddress }    │                       │
 │                         │──────────────────────>│                       │
 │                         │                       │ Generate signature    │
 │                         │                       │ (deadline, nonce)     │
 │                         │  { signature, nonce,  │                       │
 │                         │    deadline, txData } │                       │
 │                         │<──────────────────────│                       │
 │                         │                       │                       │
 │  Confirm in wallet      │                       │                       │
 │<────────────────────────│                       │                       │
 │  (Smart wallet signs)   │                       │                       │
 │────────────────────────>│                       │                       │
 │                         │  sendSmartWalletTx()  │                       │
 │                         │───────────────────────────────────────────────>│
 │                         │                       │       mint()          │
 │                         │                       │  - Verify signature   │
 │                         │                       │  - Check deadline     │
 │                         │                       │  - Pick random token  │
 │                         │                       │  - Mint & Transfer    │
 │                         │  txHash               │                       │
 │                         │<──────────────────────────────────────────────│
 │                         │                       │                       │
 │                         │  POST /mint/confirm   │                       │
 │                         │  { txHash, wallet }   │                       │
 │                         │──────────────────────>│                       │
 │                         │                       │  getTransactionReceipt│
 │                         │                       │──────────────────────>│
 │                         │                       │  Parse Transfer event │
 │                         │                       │  Extract tokenId      │
 │                         │                       │<──────────────────────│
 │                         │                       │                       │
 │                         │                       │  Update DB:           │
 │                         │                       │  - nftOwnership       │
 │                         │                       │  - nftClaims          │
 │                         │                       │                       │
 │                         │  { tokenId, nftData } │                       │
 │                         │<──────────────────────│                       │
 │  Show reveal animation  │                       │                       │
 │<────────────────────────│                       │                       │
```

---

## 3. Smart Contract Design

### 3.1 Contract: `ProtoMonkeysNFT.sol`

**Location**: `packages/contracts/src/nft/ProtoMonkeysNFT.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title ProtoMonkeysNFT
 * @notice ERC-721 NFT collection with signature-gated minting for Babylon's top 100 users
 * @dev Uses ECDSA signatures for off-chain eligibility verification
 */
contract ProtoMonkeysNFT is ERC721, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    uint256 public constant MAX_SUPPLY = 100;
    
    /// @notice Address authorized to sign mint messages
    address public signer;
    
    /// @notice Base URI for token metadata
    string public baseURI;
    
    /// @notice Tracks which addresses have already minted
    mapping(address => bool) public hasMinted;
    
    /// @notice Tracks which nonces have been used (prevents replay)
    mapping(bytes32 => bool) public usedNonces;
    
    /// @notice Array of available token IDs (1-100, shrinks as minted)
    uint256[] private _availableTokenIds;
    
    /// @notice Total number of tokens minted
    uint256 public totalMinted;

    // Events
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event BaseURIUpdated(string oldBaseURI, string newBaseURI);
    
    // Errors
    error InvalidSignature();
    error DeadlineExpired();
    error NonceAlreadyUsed();
    error AlreadyMinted();
    error SoldOut();
    error InvalidSigner();

    constructor(
        address _signer,
        string memory _baseTokenURI
    ) ERC721("ProtoMonkeys", "PROTO") Ownable(msg.sender) {
        if (_signer == address(0)) revert InvalidSigner();
        
        signer = _signer;
        baseURI = _baseTokenURI;
        
        // Initialize available token IDs (1-100)
        for (uint256 i = 1; i <= MAX_SUPPLY; i++) {
            _availableTokenIds.push(i);
        }
    }

    /**
     * @notice Mint an NFT with a valid signature from the authorized signer
     * @param to Address to mint the NFT to
     * @param deadline Timestamp after which the signature is invalid
     * @param nonce Unique nonce to prevent replay attacks
     * @param signature ECDSA signature from the authorized signer
     */
    function mint(
        address to,
        uint256 deadline,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        // Verify deadline
        if (block.timestamp > deadline) revert DeadlineExpired();
        
        // Verify nonce not used
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        
        // Verify not already minted
        if (hasMinted[to]) revert AlreadyMinted();
        
        // Verify supply available
        if (_availableTokenIds.length == 0) revert SoldOut();
        
        // Verify signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(to, deadline, nonce, block.chainid, address(this))
        );
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address recoveredSigner = ethSignedMessageHash.recover(signature);
        
        if (recoveredSigner != signer) revert InvalidSignature();
        
        // Mark nonce as used
        usedNonces[nonce] = true;
        
        // Mark address as minted
        hasMinted[to] = true;
        
        // Pick random token ID from available pool
        uint256 randomIndex = uint256(
            keccak256(abi.encodePacked(block.timestamp, block.prevrandao, to, totalMinted))
        ) % _availableTokenIds.length;
        
        uint256 tokenId = _availableTokenIds[randomIndex];
        
        // Remove from available pool (swap and pop)
        _availableTokenIds[randomIndex] = _availableTokenIds[_availableTokenIds.length - 1];
        _availableTokenIds.pop();
        
        // Mint
        totalMinted++;
        _safeMint(to, tokenId);
    }

    /**
     * @notice Update the authorized signer address
     * @param newSigner New signer address
     */
    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidSigner();
        emit SignerUpdated(signer, newSigner);
        signer = newSigner;
    }

    /**
     * @notice Update the base URI for token metadata
     * @param newBaseURI New base URI
     */
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        emit BaseURIUpdated(baseURI, newBaseURI);
        baseURI = newBaseURI;
    }

    /**
     * @notice Returns the number of tokens still available to mint
     */
    function availableSupply() external view returns (uint256) {
        return _availableTokenIds.length;
    }

    /**
     * @notice Override to return custom base URI
     */
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }
}
```

### 3.2 Contract Tests

**Location**: `packages/contracts/test/ProtoMonkeysNFT.t.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/nft/ProtoMonkeysNFT.sol";

contract ProtoMonkeysNFTTest is Test {
    ProtoMonkeysNFT public nft;
    
    address public owner = address(1);
    address public signer;
    uint256 public signerPrivateKey = 0xA11CE;
    address public user1 = address(3);
    address public user2 = address(4);
    
    string public baseURI = "https://babylon.market/api/nft/metadata/";

    function setUp() public {
        signer = vm.addr(signerPrivateKey);
        vm.prank(owner);
        nft = new ProtoMonkeysNFT(signer, baseURI);
    }

    // === Deployment Tests ===
    
    function test_deployment_setsCorrectName() public view {
        assertEq(nft.name(), "ProtoMonkeys");
    }

    function test_deployment_setsCorrectSymbol() public view {
        assertEq(nft.symbol(), "PROTO");
    }

    function test_deployment_setsCorrectSigner() public view {
        assertEq(nft.signer(), signer);
    }

    function test_deployment_setsCorrectBaseURI() public view {
        assertEq(nft.baseURI(), baseURI);
    }

    function test_deployment_initializes100AvailableTokens() public view {
        assertEq(nft.availableSupply(), 100);
    }

    function test_deployment_revertsWithZeroSigner() public {
        vm.expectRevert(ProtoMonkeysNFT.InvalidSigner.selector);
        new ProtoMonkeysNFT(address(0), baseURI);
    }

    // === Minting Tests ===

    function test_mint_successfulMint() public {
        (bytes32 nonce, uint256 deadline, bytes memory signature) = _createSignature(user1);
        
        vm.prank(user1);
        nft.mint(user1, deadline, nonce, signature);
        
        assertEq(nft.balanceOf(user1), 1);
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.availableSupply(), 99);
        assertTrue(nft.hasMinted(user1));
    }

    function test_mint_anyoneCanCallWithValidSignature() public {
        (bytes32 nonce, uint256 deadline, bytes memory signature) = _createSignature(user1);
        
        // user2 calls mint for user1
        vm.prank(user2);
        nft.mint(user1, deadline, nonce, signature);
        
        assertEq(nft.balanceOf(user1), 1);
    }

    function test_mint_revertsIfAlreadyMinted() public {
        (bytes32 nonce1, uint256 deadline1, bytes memory sig1) = _createSignature(user1);
        vm.prank(user1);
        nft.mint(user1, deadline1, nonce1, sig1);
        
        (bytes32 nonce2, uint256 deadline2, bytes memory sig2) = _createSignatureWithNonce(user1, bytes32(uint256(2)));
        vm.expectRevert(ProtoMonkeysNFT.AlreadyMinted.selector);
        vm.prank(user1);
        nft.mint(user1, deadline2, nonce2, sig2);
    }

    function test_mint_revertsIfDeadlineExpired() public {
        uint256 expiredDeadline = block.timestamp - 1;
        bytes32 nonce = bytes32(uint256(1));
        bytes memory signature = _sign(user1, expiredDeadline, nonce);
        
        vm.expectRevert(ProtoMonkeysNFT.DeadlineExpired.selector);
        nft.mint(user1, expiredDeadline, nonce, signature);
    }

    function test_mint_revertsIfNonceAlreadyUsed() public {
        bytes32 nonce = bytes32(uint256(1));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(user1, deadline, nonce);
        
        nft.mint(user1, deadline, nonce, signature);
        
        // Try to use same nonce for different user
        bytes memory signature2 = _sign(user2, deadline, nonce);
        vm.expectRevert(ProtoMonkeysNFT.NonceAlreadyUsed.selector);
        nft.mint(user2, deadline, nonce, signature2);
    }

    function test_mint_revertsIfInvalidSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 nonce = bytes32(uint256(1));
        
        // Sign for user1 but try to mint for user2
        bytes memory wrongSignature = _sign(user1, deadline, nonce);
        
        vm.expectRevert(ProtoMonkeysNFT.InvalidSignature.selector);
        nft.mint(user2, deadline, nonce, wrongSignature);
    }

    function test_mint_revertsWhenSoldOut() public {
        // Mint all 100
        for (uint256 i = 0; i < 100; i++) {
            address minter = address(uint160(100 + i));
            (bytes32 nonce, uint256 deadline, bytes memory sig) = _createSignature(minter);
            nft.mint(minter, deadline, nonce, sig);
        }
        
        address extraMinter = address(200);
        (bytes32 nonce, uint256 deadline, bytes memory sig) = _createSignature(extraMinter);
        
        vm.expectRevert(ProtoMonkeysNFT.SoldOut.selector);
        nft.mint(extraMinter, deadline, nonce, sig);
    }

    function test_mint_assignsTokenIdsBetween1And100() public {
        for (uint256 i = 0; i < 10; i++) {
            address minter = address(uint160(100 + i));
            (bytes32 nonce, uint256 deadline, bytes memory sig) = _createSignature(minter);
            nft.mint(minter, deadline, nonce, sig);
            
            // Find the token ID owned by minter
            uint256 tokenId;
            for (uint256 t = 1; t <= 100; t++) {
                try nft.ownerOf(t) returns (address tokenOwner) {
                    if (tokenOwner == minter) {
                        tokenId = t;
                        break;
                    }
                } catch {}
            }
            
            assertTrue(tokenId >= 1 && tokenId <= 100, "Token ID out of range");
        }
    }

    // === Owner Functions ===

    function test_setSigner_onlyOwner() public {
        address newSigner = address(10);
        
        vm.prank(user1);
        vm.expectRevert();
        nft.setSigner(newSigner);
        
        vm.prank(owner);
        nft.setSigner(newSigner);
        assertEq(nft.signer(), newSigner);
    }

    function test_setSigner_revertsWithZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(ProtoMonkeysNFT.InvalidSigner.selector);
        nft.setSigner(address(0));
    }

    function test_setBaseURI_onlyOwner() public {
        string memory newURI = "https://new.uri/";
        
        vm.prank(user1);
        vm.expectRevert();
        nft.setBaseURI(newURI);
        
        vm.prank(owner);
        nft.setBaseURI(newURI);
        assertEq(nft.baseURI(), newURI);
    }

    function test_tokenURI_returnsCorrectURI() public {
        (bytes32 nonce, uint256 deadline, bytes memory sig) = _createSignature(user1);
        nft.mint(user1, deadline, nonce, sig);
        
        // Get the minted token ID
        uint256 tokenId;
        for (uint256 t = 1; t <= 100; t++) {
            try nft.ownerOf(t) returns (address tokenOwner) {
                if (tokenOwner == user1) {
                    tokenId = t;
                    break;
                }
            } catch {}
        }
        
        string memory expectedURI = string(abi.encodePacked(baseURI, vm.toString(tokenId)));
        assertEq(nft.tokenURI(tokenId), expectedURI);
    }

    // === Helper Functions ===

    function _createSignature(address to) internal returns (bytes32 nonce, uint256 deadline, bytes memory signature) {
        nonce = bytes32(uint256(uint160(to)));
        deadline = block.timestamp + 1 hours;
        signature = _sign(to, deadline, nonce);
    }

    function _createSignatureWithNonce(address to, bytes32 _nonce) internal view returns (bytes32 nonce, uint256 deadline, bytes memory signature) {
        nonce = _nonce;
        deadline = block.timestamp + 1 hours;
        signature = _sign(to, deadline, nonce);
    }

    function _sign(address to, uint256 deadline, bytes32 nonce) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(to, deadline, nonce, block.chainid, address(nft))
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, ethSignedMessageHash);
        return abi.encodePacked(r, s, v);
    }
}
```

### 3.3 Deployment Script

**Location**: `packages/contracts/script/DeployProtoMonkeysNFT.s.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/nft/ProtoMonkeysNFT.sol";

contract DeployProtoMonkeysNFT is Script {
    function run() external {
        // Read from environment
        address signer = vm.envAddress("NFT_SIGNER_ADDRESS");
        string memory baseURI = vm.envString("NFT_BASE_URI");
        
        vm.startBroadcast();
        
        ProtoMonkeysNFT nft = new ProtoMonkeysNFT(signer, baseURI);
        
        vm.stopBroadcast();
        
        console.log("ProtoMonkeysNFT deployed to:", address(nft));
        console.log("Signer:", signer);
        console.log("Base URI:", baseURI);
    }
}
```

---

## 4. Backend Implementation

### 4.1 New Service: `nft-mint-service.ts`

**Location**: `packages/api/src/services/nft-mint-service.ts`

```typescript
import { db } from '@babylon/db';
import { nftSnapshot, nftClaims, nftOwnership, nftCollection, users } from '@babylon/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { createPublicClient, http, parseAbiItem, type Hex } from 'viem';
import { base, baseSepolia, hardhat } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Types
interface EligibilityResult {
  eligible: boolean;
  snapshotRank?: number;
  snapshotPoints?: number;
  snapshotTakenAt?: Date;
  hasMinted: boolean;
  mintedNft?: {
    tokenId: number;
    name: string;
    thumbnailUrl: string;
    txHash: string;
  };
  reason?: 'not_in_top_100' | 'already_minted';
  currentRank?: number;
}

interface PrepareResult {
  contractAddress: Hex;
  chainId: number;
  to: Hex;
  deadline: number;
  nonce: Hex;
  signature: Hex;
  encodedData: Hex;
}

interface ConfirmResult {
  success: boolean;
  tokenId: number;
  nft: {
    tokenId: number;
    name: string;
    imageUrl: string;
    storyTitle: string | null;
  };
}

// Chain configuration
const CHAINS = {
  1: mainnet,
  11155111: sepolia,
  31337: hardhat,
} as const;

function getChain(chainId: number) {
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);
  return chain;
}

function getClient(chainId: number) {
  const chain = getChain(chainId);
  return createPublicClient({
    chain,
    transport: http(),
  });
}

/**
 * Check if a user is eligible to mint
 */
export async function checkEligibility(userId: string): Promise<EligibilityResult> {
  // Get user's wallet address
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { walletAddress: true },
  });

  if (!user?.walletAddress) {
    return { eligible: false, hasMinted: false, reason: 'not_in_top_100' };
  }

  // Check snapshot eligibility
  const snapshot = await db.query.nftSnapshot.findFirst({
    where: eq(nftSnapshot.walletAddress, user.walletAddress.toLowerCase()),
  });

  if (!snapshot) {
    return { eligible: false, hasMinted: false, reason: 'not_in_top_100' };
  }

  // Check if already minted
  const existingClaim = await db.query.nftClaims.findFirst({
    where: eq(nftClaims.claimerAddress, user.walletAddress.toLowerCase()),
  });

  if (existingClaim) {
    const nft = await db.query.nftCollection.findFirst({
      where: eq(nftCollection.tokenId, existingClaim.tokenId),
    });

    return {
      eligible: true,
      snapshotRank: snapshot.rank,
      snapshotPoints: snapshot.points,
      snapshotTakenAt: snapshot.snapshotAt,
      hasMinted: true,
      mintedNft: nft ? {
        tokenId: nft.tokenId,
        name: nft.name,
        thumbnailUrl: nft.thumbnailUrl ?? nft.imageUrl,
        txHash: existingClaim.txHash,
      } : undefined,
    };
  }

  return {
    eligible: true,
    snapshotRank: snapshot.rank,
    snapshotPoints: snapshot.points,
    snapshotTakenAt: snapshot.snapshotAt,
    hasMinted: false,
  };
}

/**
 * Prepare mint transaction with signature
 */
export async function prepareMint(
  userId: string,
  walletAddress: Hex
): Promise<PrepareResult> {
  // Verify eligibility
  const eligibility = await checkEligibility(userId);
  if (!eligibility.eligible) {
    throw new Error('User not eligible to mint');
  }
  if (eligibility.hasMinted) {
    throw new Error('User has already minted');
  }

  const contractAddress = process.env.NFT_CONTRACT_ADDRESS as Hex;
  const chainId = Number(process.env.NFT_CHAIN_ID);
  const signerPrivateKey = process.env.NFT_SIGNER_PRIVATE_KEY as Hex;

  if (!contractAddress || !chainId || !signerPrivateKey) {
    throw new Error('NFT contract configuration missing');
  }

  // Generate nonce and deadline
  const nonce = `0x${Buffer.from(crypto.randomUUID().replace(/-/g, ''), 'hex').toString('hex').padStart(64, '0')}` as Hex;
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  // Create signature
  const account = privateKeyToAccount(signerPrivateKey);
  
  // Construct message hash (must match contract)
  const messageHash = await createMessageHash(
    walletAddress,
    deadline,
    nonce,
    chainId,
    contractAddress
  );

  const signature = await account.signMessage({
    message: { raw: messageHash },
  });

  // Encode mint function call
  const encodedData = encodeMintCall(walletAddress, deadline, nonce, signature);

  return {
    contractAddress,
    chainId,
    to: walletAddress,
    deadline,
    nonce,
    signature,
    encodedData,
  };
}

/**
 * Confirm mint by verifying on-chain transaction
 */
export async function confirmMint(
  userId: string,
  txHash: Hex,
  walletAddress: Hex
): Promise<ConfirmResult> {
  const chainId = Number(process.env.NFT_CHAIN_ID);
  const contractAddress = process.env.NFT_CONTRACT_ADDRESS as Hex;

  const client = getClient(chainId);

  // Get transaction receipt
  const receipt = await client.getTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error('Transaction failed');
  }

  // Parse Transfer event to get tokenId
  const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');
  
  let mintedTokenId: number | null = null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
    
    try {
      // Check if this is a Transfer event from address(0) (mint)
      if (
        log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && // Transfer event signature
        log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000' && // from = address(0)
        log.topics[2]?.toLowerCase().includes(walletAddress.slice(2).toLowerCase()) // to = walletAddress
      ) {
        mintedTokenId = Number(BigInt(log.topics[3] as Hex));
        break;
      }
    } catch {
      continue;
    }
  }

  if (mintedTokenId === null) {
    throw new Error('Could not find mint Transfer event in transaction');
  }

  // Get user info
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  // Get snapshot info for this user
  const snapshot = await db.query.nftSnapshot.findFirst({
    where: eq(nftSnapshot.walletAddress, walletAddress.toLowerCase()),
  });

  // Record the claim
  await db.insert(nftClaims).values({
    tokenId: mintedTokenId,
    claimerUserId: userId,
    claimerAddress: walletAddress.toLowerCase(),
    claimedAt: new Date(),
    txHash,
    snapshotRank: snapshot?.rank ?? null,
    snapshotPoints: snapshot?.points ?? null,
  });

  // Update ownership
  await db.insert(nftOwnership).values({
    tokenId: mintedTokenId,
    ownerAddress: walletAddress.toLowerCase(),
    userId: userId,
    acquiredAt: new Date(),
    txHash,
    blockNumber: Number(receipt.blockNumber),
  }).onConflictDoUpdate({
    target: [nftOwnership.tokenId],
    set: {
      ownerAddress: walletAddress.toLowerCase(),
      userId: userId,
      acquiredAt: new Date(),
      txHash,
      blockNumber: Number(receipt.blockNumber),
      updatedAt: new Date(),
    },
  });

  // Get NFT metadata
  const nft = await db.query.nftCollection.findFirst({
    where: eq(nftCollection.tokenId, mintedTokenId),
  });

  if (!nft) {
    throw new Error(`NFT metadata not found for token ${mintedTokenId}`);
  }

  return {
    success: true,
    tokenId: mintedTokenId,
    nft: {
      tokenId: nft.tokenId,
      name: nft.name,
      imageUrl: nft.imageUrl,
      storyTitle: nft.storyTitle,
    },
  };
}

// Helper functions
async function createMessageHash(
  to: Hex,
  deadline: number,
  nonce: Hex,
  chainId: number,
  contractAddress: Hex
): Promise<Hex> {
  const { keccak256, encodePacked } = await import('viem');
  return keccak256(
    encodePacked(
      ['address', 'uint256', 'bytes32', 'uint256', 'address'],
      [to, BigInt(deadline), nonce, BigInt(chainId), contractAddress]
    )
  );
}

function encodeMintCall(
  to: Hex,
  deadline: number,
  nonce: Hex,
  signature: Hex
): Hex {
  const { encodeFunctionData } = require('viem');
  
  const abi = [{
    name: 'mint',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  }] as const;

  return encodeFunctionData({
    abi,
    functionName: 'mint',
    args: [to, BigInt(deadline), nonce, signature],
  });
}
```

### 4.2 Updated API Routes

#### `/api/nft/mint/prepare/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prepareMint } from '@babylon/api/services/nft-mint-service';
import type { Hex } from 'viem';

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const walletAddress = body.walletAddress as Hex;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      );
    }

    const result = await prepareMint(user.id, walletAddress);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

#### `/api/nft/mint/confirm/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { confirmMint } from '@babylon/api/services/nft-mint-service';
import type { Hex } from 'viem';

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { txHash, walletAddress } = body as {
      txHash: Hex;
      walletAddress: Hex;
    };

    if (!txHash || !walletAddress) {
      return NextResponse.json(
        { error: 'txHash and walletAddress are required' },
        { status: 400 }
      );
    }

    const result = await confirmMint(user.id, txHash, walletAddress);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

#### `/api/nft/metadata/[tokenId]/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@babylon/db';
import { nftCollection } from '@babylon/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { tokenId: string } }
) {
  const tokenId = parseInt(params.tokenId, 10);

  if (isNaN(tokenId) || tokenId < 1 || tokenId > 100) {
    return NextResponse.json({ error: 'Invalid token ID' }, { status: 400 });
  }

  const nft = await db.query.nftCollection.findFirst({
    where: eq(nftCollection.tokenId, tokenId),
  });

  if (!nft) {
    return NextResponse.json({ error: 'NFT not found' }, { status: 404 });
  }

  // ERC-721 metadata standard
  const metadata = {
    name: nft.name,
    description: nft.description ?? `ProtoMonkeys #${tokenId}`,
    image: nft.imageUrl,
    external_url: `https://babylon.market/nft/${tokenId}`,
    attributes: nft.attributes ?? [],
    properties: {
      story: nft.storyTitle ? {
        title: nft.storyTitle,
        content: nft.storyContent,
      } : undefined,
    },
  };

  return NextResponse.json(metadata, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

---

## 5. Frontend Implementation

### 5.1 Updated `useNftMint.ts`

The existing hook needs updates to:
1. Use the new signature-based mint flow
2. Use `viem.encodeFunctionData` instead of manual encoding
3. Handle the new response structure

**Key Changes**:

```typescript
// In useNftMint.ts - update the mint function

const mint = useCallback(async () => {
  if (!smartWalletAddress) {
    throw new Error('Wallet not connected');
  }

  setStatus('preparing');

  // 1. Prepare mint (get signature)
  const prepareRes = await fetch('/api/nft/mint/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: smartWalletAddress }),
  });

  if (!prepareRes.ok) {
    const error = await prepareRes.json();
    throw new Error(error.error || 'Failed to prepare mint');
  }

  const { data: prepareData } = await prepareRes.json();

  setStatus('minting');

  // 2. Send transaction via smart wallet
  const txHash = await sendSmartWalletTransaction({
    to: prepareData.contractAddress,
    data: prepareData.encodedData,
    value: 0n,
    chainId: prepareData.chainId,
  });

  setStatus('confirming');

  // 3. Confirm mint
  const confirmRes = await fetch('/api/nft/mint/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txHash,
      walletAddress: smartWalletAddress,
    }),
  });

  if (!confirmRes.ok) {
    const error = await confirmRes.json();
    throw new Error(error.error || 'Failed to confirm mint');
  }

  const { data: confirmData } = await confirmRes.json();

  setStatus('success');
  setMintedNft(confirmData.nft);

  return confirmData;
}, [smartWalletAddress, sendSmartWalletTransaction]);
```

### 5.2 NFT ABI

**Location**: `packages/shared/src/contracts/abis.ts`

```typescript
export const PROTO_MONKEYS_NFT_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'hasMinted',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'totalMinted',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'availableSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const;
```

---

## 6. Database Schema

The existing schema in `packages/db/src/schema/nft.ts` is mostly sufficient. Key tables:

| Table | Purpose |
|-------|---------|
| `nftCollection` | Stores metadata for all 100 NFTs |
| `nftOwnership` | Tracks current owner of each NFT |
| `nftClaims` | Records original mint transactions |
| `nftSnapshot` | Eligibility list (top 100 wallets) |

**Minor Updates Needed**:

1. Ensure `nftClaims` has `snapshotRank` and `snapshotPoints` columns
2. Ensure `nftOwnership` has `blockNumber` for ordering transfers
3. Update `nftCollection.chainId` default to `1` (Ethereum mainnet)

---

## 7. Deployment Strategy

### 7.1 Deployment Environments

| Environment | Chain | Chain ID | Purpose |
|-------------|-------|----------|---------|
| Local | Hardhat | 31337 | Development & testing |
| Testnet | Sepolia | 11155111 | Staging environment |
| Production | Ethereum Mainnet | 1 | Live deployment |

### 7.2 CLI Integration

Update `apps/cli/src/commands/deploy.ts` to add NFT deployment:

```typescript
// Add to deploy command
if (args.contract === 'nft' || args.contract === 'all') {
  await deployNft(network);
}

async function deployNft(network: string) {
  const script = 'script/DeployProtoMonkeysNFT.s.sol:DeployProtoMonkeysNFT';
  
  // Run forge script
  await execa('forge', [
    'script', script,
    '--rpc-url', getRpcUrl(network),
    '--broadcast',
    '--verify',
  ], { cwd: 'packages/contracts' });
  
  // Save deployment address
  // Update public-config.json
}
```

### 7.3 Deployment Checklist

- [ ] Generate signer keypair for backend
- [ ] Set `NFT_SIGNER_ADDRESS` in deployment env
- [ ] Set `NFT_BASE_URI` to `https://babylon.market/api/nft/metadata/`
- [ ] Deploy contract
- [ ] Verify contract on Etherscan
- [ ] Update `public-config.json` with contract address
- [ ] Update `.env.example`
- [ ] Seed `nftCollection` with 100 placeholder NFTs
- [ ] Create `nftSnapshot` from leaderboard

---

## 8. Testing Strategy

### 8.1 Contract Tests (Foundry)

**Location**: `packages/contracts/test/ProtoMonkeysNFT.t.sol`

Coverage requirements:
- [x] Deployment configuration
- [x] Successful minting with valid signature
- [x] Rejection of invalid signatures
- [x] Rejection of expired deadlines
- [x] Rejection of used nonces
- [x] Rejection of double mints
- [x] Sold out handling
- [x] Owner functions (setSigner, setBaseURI)
- [x] Token ID range validation (1-100)

Run: `cd packages/contracts && forge test --match-contract ProtoMonkeysNFT`

### 8.2 Backend Integration Tests

**Location**: `packages/testing/integration/nft-mint.integration.test.ts`

```typescript
describe('NFT Mint Service', () => {
  describe('checkEligibility', () => {
    it('returns eligible=true for users in nftSnapshot');
    it('returns eligible=false for users not in nftSnapshot');
    it('returns hasMinted=true if user already claimed');
  });

  describe('prepareMint', () => {
    it('generates valid signature for eligible user');
    it('throws for ineligible user');
    it('throws for user who already minted');
  });

  describe('confirmMint', () => {
    it('parses Transfer event and extracts tokenId');
    it('creates nftClaims record');
    it('creates/updates nftOwnership record');
    it('throws for failed transaction');
    it('throws for transaction without mint event');
  });
});
```

### 8.3 Synpress E2E Tests

**Location**: `packages/testing/synpress/11-nft-mint.synpress.spec.ts`

```typescript
import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';

const test = testWithSynpress(metaMaskFixtures);

test.describe('NFT Mint Flow', () => {
  test.beforeEach(async ({ page, metamask }) => {
    // Login with wallet via Privy
    await loginWithWallet(page, metamask);
    
    // Ensure user is in nftSnapshot (test setup)
    await seedEligibleUser(page);
  });

  test('eligible user can mint NFT', async ({ page, metamask }) => {
    // Navigate to NFT page
    await page.goto('/nft');
    
    // Verify eligibility banner shows
    await expect(page.getByText('You\'re eligible to mint')).toBeVisible();
    
    // Click mint button
    await page.getByRole('button', { name: /mint/i }).click();
    
    // Confirm transaction in MetaMask
    await metamask.confirmTransaction();
    
    // Wait for reveal animation
    await expect(page.getByText('You received:')).toBeVisible({ timeout: 30000 });
    
    // Verify NFT shows in user's collection
    await expect(page.getByText('You own')).toBeVisible();
  });

  test('ineligible user sees correct message', async ({ page }) => {
    // Clear user from snapshot
    await removeUserFromSnapshot(page);
    
    await page.goto('/nft');
    
    await expect(page.getByText('not in the Top 100')).toBeVisible();
    await expect(page.getByRole('button', { name: /mint/i })).not.toBeVisible();
  });

  test('user cannot mint twice', async ({ page, metamask }) => {
    // First mint
    await page.goto('/nft');
    await page.getByRole('button', { name: /mint/i }).click();
    await metamask.confirmTransaction();
    await expect(page.getByText('You received:')).toBeVisible({ timeout: 30000 });
    
    // Refresh page
    await page.reload();
    
    // Should show already minted state
    await expect(page.getByText('You own')).toBeVisible();
    await expect(page.getByRole('button', { name: /mint/i })).not.toBeVisible();
  });
});
```

### 8.4 Test Data Setup

Create test helpers for seeding data:

```typescript
// packages/testing/helpers/nft-test-setup.ts

export async function seedNftCollection(db: Database) {
  for (let i = 1; i <= 100; i++) {
    await db.insert(nftCollection).values({
      tokenId: i,
      name: `ProtoMonkey #${i}`,
      description: `Test NFT ${i}`,
      imageUrl: `https://picsum.photos/seed/${i}/512/512`,
      contractAddress: process.env.NFT_CONTRACT_ADDRESS!,
      chainId: 31337, // Hardhat
    });
  }
}

export async function seedEligibleUser(db: Database, walletAddress: string) {
  await db.insert(nftSnapshot).values({
    walletAddress: walletAddress.toLowerCase(),
    rank: 1,
    points: 10000,
    snapshotAt: new Date(),
  });
}
```

---

## 9. Environment Variables

### 9.1 Required Variables

```bash
# .env.example additions

# NFT Contract Configuration
NFT_CONTRACT_ADDRESS=0x...          # Deployed ProtoMonkeysNFT address
NFT_CHAIN_ID=1                      # Ethereum mainnet (11155111 for Sepolia, 31337 for local)
NFT_SIGNER_PRIVATE_KEY=0x...        # Private key for signing mint messages (NEVER COMMIT)
NFT_SIGNER_ADDRESS=0x...            # Public address of signer (derived from private key)
NFT_BASE_URI=https://babylon.market/api/nft/metadata/  # Base URI for token metadata
```

### 9.2 Per-Environment Values

| Variable | Local | Testnet | Production |
|----------|-------|---------|------------|
| `NFT_CHAIN_ID` | 31337 | 11155111 | 1 |
| `NFT_CONTRACT_ADDRESS` | (deploy local) | (deploy testnet) | (deploy mainnet) |
| `NFT_BASE_URI` | `http://localhost:3000/api/nft/metadata/` | `https://staging.babylon.market/api/nft/metadata/` | `https://babylon.market/api/nft/metadata/` |

---

## 10. Implementation Phases

### Phase 1: Smart Contract (2-3 days)
- [ ] Create `ProtoMonkeysNFT.sol`
- [ ] Write comprehensive Foundry tests
- [ ] Create deployment script
- [ ] Deploy to local Hardhat
- [ ] Verify all tests pass

### Phase 2: Backend Services (2-3 days)
- [ ] Create `nft-mint-service.ts`
- [ ] Update `/api/nft/mint/prepare`
- [ ] Update `/api/nft/mint/confirm`
- [ ] Create `/api/nft/metadata/[tokenId]`
- [ ] Write integration tests
- [ ] Update `.env.example`

### Phase 3: Frontend Integration (1-2 days)
- [ ] Update `useNftMint` hook
- [ ] Add NFT ABI to shared package
- [ ] Test mint flow locally
- [ ] Verify reveal animation works

### Phase 4: E2E Testing (2-3 days)
- [ ] Create Synpress test file
- [ ] Create test data helpers
- [ ] Write full mint flow test
- [ ] Write edge case tests
- [ ] Run full test suite

### Phase 5: Deployment (1-2 days)
- [ ] Deploy to Sepolia testnet
- [ ] Run full test suite on testnet
- [ ] Deploy to Ethereum mainnet
- [ ] Verify contract on Etherscan
- [ ] Update `public-config.json`
- [ ] Seed `nftCollection` with real metadata
- [ ] Create `nftSnapshot` from leaderboard

**Total: 8-13 days**

---

## 11. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Signature replay attack** | Low | High | Nonces tracked on-chain; deadline expiry |
| **Frontend wallet mismatch** | Medium | Medium | Verify `users.walletAddress` === smart wallet |
| **IPFS unavailability** | Medium | Low | Fallback to API-served metadata initially |
| **Gas price spikes** | Low | Medium | Gasless via Privy smart wallets |
| **Random token bias** | Low | Low | Use block.prevrandao + multiple entropy sources |
| **Database sync issues** | Medium | Medium | On-chain confirmation before DB update |

---

## 12. Clarifying Questions

Before implementation begins, please confirm:

1. **Deployment Network Priority**: Should we deploy to Sepolia first for testing, or go directly to Ethereum mainnet?

2. **Metadata Hosting**: For the initial launch, is API-served metadata acceptable (`/api/nft/metadata/[tokenId]`), or do we need IPFS/Arweave immediately?

3. **Signer Key Management**: How should the `NFT_SIGNER_PRIVATE_KEY` be managed? Options:
   - Environment variable (current plan)
   - AWS Secrets Manager / Vault
   - Hardware security module (HSM)

4. **Snapshot Timing**: When will the `nftSnapshot` be populated? Is there an existing script/process, or do we need to create one?

5. **Image Assets**: Are the 100 placeholder images ready, or should we generate them programmatically (e.g., from `picsum.photos`)?

6. **Gas Sponsorship**: Confirm Privy smart wallets handle gas sponsorship automatically, or do we need additional setup?

---

## Appendix A: File Locations Summary

| Component | Path |
|-----------|------|
| Smart Contract | `packages/contracts/src/nft/ProtoMonkeysNFT.sol` |
| Contract Tests | `packages/contracts/test/ProtoMonkeysNFT.t.sol` |
| Deploy Script | `packages/contracts/script/DeployProtoMonkeysNFT.s.sol` |
| Mint Service | `packages/api/src/services/nft-mint-service.ts` |
| API Routes | `apps/web/src/app/api/nft/mint/*/route.ts` |
| Metadata API | `apps/web/src/app/api/nft/metadata/[tokenId]/route.ts` |
| Frontend Hook | `apps/web/src/hooks/useNftMint.ts` |
| NFT ABI | `packages/shared/src/contracts/abis.ts` |
| Synpress Tests | `packages/testing/synpress/11-nft-mint.synpress.spec.ts` |
| Integration Tests | `packages/testing/integration/nft-mint.integration.test.ts` |
| DB Schema | `packages/db/src/schema/nft.ts` |

---

## Appendix B: Environment Variables (.env.example additions)

Add the following to your `.env.example`:

```bash
# ============================================================================
# NFT Drop Configuration (ProtoMonkeys)
# ============================================================================
# NFT Contract Address (deployed ProtoMonkeysNFT)
# Local: Set after running `forge script DeployProtoMonkeysNFTLocal`
# Testnet: Set after deploying to Sepolia
# Mainnet: Set after deploying to Ethereum
NFT_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# Chain ID for NFT contract
# 31337 = Local Hardhat/Anvil
# 11155111 = Sepolia Testnet
# 1 = Ethereum Mainnet
NFT_CHAIN_ID=31337

# NFT Signer Private Key (NEVER COMMIT!)
# Used by backend to generate mint signatures
# Must correspond to the `signer` address set in the contract
NFT_SIGNER_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000

# NFT Signer Address (public key derived from NFT_SIGNER_PRIVATE_KEY)
# Used during contract deployment
NFT_SIGNER_ADDRESS=0x0000000000000000000000000000000000000000

# Base URI for token metadata
# Points to the metadata API endpoint
NFT_BASE_URI=https://babylon.market/api/nft/metadata/
```

---

## Appendix C: Deployment Commands

### Local Development

```bash
# 1. Start Hardhat node
cd packages/contracts
bun hardhat:node

# 2. Deploy NFT contract (new terminal)
cd packages/contracts
NFT_SIGNER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
NFT_BASE_URI=http://localhost:3000/api/nft/metadata/ \
forge script script/DeployProtoMonkeysNFT.s.sol:DeployProtoMonkeysNFTLocal \
  --rpc-url http://localhost:8545 \
  --broadcast

# 3. Set environment variables
export NFT_CONTRACT_ADDRESS=<deployed_address>
export NFT_CHAIN_ID=31337
export NFT_SIGNER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 4. Seed NFT collection (100 placeholder NFTs)
bun run scripts/seed-nft-collection.ts

# 5. Seed nftSnapshot (for testing)
# Add test wallet to nftSnapshot table with rank 1-100
```

### Sepolia Testnet

```bash
cd packages/contracts

# Deploy with your private key
forge script script/DeployProtoMonkeysNFT.s.sol:DeployProtoMonkeysNFT \
  --rpc-url https://sepolia.base.org \
  --broadcast \
  --verify \
  -vvvv

# Verify contract
forge verify-contract <CONTRACT_ADDRESS> src/nft/ProtoMonkeysNFT.sol:ProtoMonkeysNFT \
  --chain-id 11155111 \
  --constructor-args $(cast abi-encode "constructor(address,string)" $NFT_SIGNER_ADDRESS $NFT_BASE_URI)
```

### Ethereum Mainnet

```bash
cd packages/contracts

# Deploy to mainnet (be careful!)
forge script script/DeployProtoMonkeysNFT.s.sol:DeployProtoMonkeysNFT \
  --rpc-url https://mainnet.base.org \
  --broadcast \
  --verify \
  -vvvv
```

---

## Appendix D: Test Commands

```bash
# Contract tests (Foundry)
cd packages/contracts
forge test --match-contract ProtoMonkeysNFT -vvv

# Integration tests
cd packages/testing
bun test integration/nft-mint.integration.test.ts --preload ./integration/preload.ts

# Unit tests
bun test unit/nft-mint-flow.test.ts

# Synpress E2E tests (requires Hardhat + web app running)
bunx synpress run --config synpress.config.ts --grep "NFT Mint"

# Full test suite
bun run test
```

---

*Document Version: 1.1*  
*Created: 2026-01-11*  
*Updated: 2026-01-11*
