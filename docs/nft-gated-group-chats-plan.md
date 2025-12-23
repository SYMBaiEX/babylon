# NFT/ERC721 Gated Group Chats - Implementation Plan

## 1. Goal & Requirements

### What We're Building
Enable group chat creators to restrict access to users who hold specific ERC721 NFTs. This allows creation of exclusive communities for token holders.

### Why
- Enable NFT communities to have private spaces
- Create value for NFT holders
- Support token-gated experiences
- Align with web3 community patterns

### User Stories
1. **As a group chat creator**: I want to require users to hold a specific NFT to join my group chat
2. **As a user**: I want to see which group chats require NFTs before attempting to join
3. **As a user**: I want clear error messages if I don't own the required NFT
4. **As a user**: I want my NFT ownership verified on-chain when joining

---

## 2. Current State Analysis

### Existing Infrastructure ✅

**Database:**
- `users.walletAddress` - User wallet addresses stored (unique, nullable)
- `chats` table - Group chat storage
- `groupChatMemberships` - Membership tracking
- Drizzle ORM with migration support

**Blockchain Infrastructure:**
- Viem library for on-chain calls (`createPublicClient`, `readContract`)
- Multi-chain support: Base (8453), Base Sepolia (84532), Local (31337)
- RPC URL management via `getCurrentRpcUrl()` from `@babylon/shared`
- ERC721 ABI functions available: `balanceOf(address)`, `ownerOf(uint256)`
- Existing pattern: `ReputationService.getOnChainReputation()` shows how to query contracts

**Caching:**
- Redis + in-memory cache via `@babylon/api/cache-service`
- `getCacheOrFetch()` pattern for cache-aside
- TTL management and cache invalidation

**Group Chat System:**
- `POST /api/chats` - Create chats (via `ChatCreateSchema`)
- `POST /api/groups` - Create user groups with associated chats
- `POST /api/chats/[id]/participants` - Add participants
- `GroupChatService` - NPC group chat logic
- Access control via `GroupChatService.isInChat()`

**Frontend:**
- `CreateGroupModal` component for group creation
- Chat list UI with filtering
- Privy authentication with wallet support

### What's Missing ❌
- NFT requirement fields in `chats` table
- NFT ownership verification service
- Access control checks for NFT requirements
- Frontend UI for NFT gating
- Multi-chain NFT verification (currently only Base-focused)

---

## 3. Constraints & Dependencies

### Technical Constraints

1. **Chain Selection**
   - **Question**: Which chain(s) should we support for NFT verification?
   - **Current**: System primarily uses Base (8453/84532)
   - **Options**:
     - Base only (simplest, aligns with current infrastructure)
     - Base + Ethereum (broader NFT ecosystem)
     - Multi-chain with chain selection per chat
   - **Recommendation**: Start with Base only, add chain field for future expansion

2. **Wallet Address Resolution**
   - Users may have multiple wallets (Privy smart wallet, embedded wallet, external)
   - Current: `users.walletAddress` is single address
   - Need to verify which wallet(s) to check
   - **Decision**: Check `users.walletAddress` primarily, but consider allowing users to specify wallet

3. **RPC Rate Limits**
   - On-chain calls are expensive (time + rate limits)
   - Need caching strategy
   - **Solution**: Cache ownership checks with appropriate TTL (5-15 minutes)

4. **Contract Validation**
   - Need to verify contract is valid ERC721
   - Handle non-existent contracts gracefully
   - **Solution**: Try-catch with clear error messages

### Business Constraints

1. **User Experience**
   - Verification should be fast (< 2 seconds)
   - Clear error messages
   - Don't block UI during verification

2. **Security**
   - On-chain verification is source of truth
   - Don't trust client-side checks
   - Verify on every join attempt (or cache with short TTL)

3. **Backward Compatibility**
   - Existing group chats must continue working
   - All new fields must be nullable/optional

---

## 4. Architecture & Data Flow

### Database Schema Changes

**Add to `chats` table:**
```typescript
{
  requiredNftContractAddress: text('requiredNftContractAddress').nullable(),
  requiredNftTokenId: integer('requiredNftTokenId').nullable(), // null = any token from collection
  requiredNftChainId: integer('requiredNftChainId').nullable(), // null = current chain (Base)
  nftGated: boolean('nftGated').notNull().default(false), // computed: !!(requiredNftContractAddress)
}
```

**Indexes:**
- `Chat_nftGated_idx` on `nftGated` (for filtering gated chats)
- `Chat_requiredNftContractAddress_idx` on `requiredNftContractAddress` (for queries)

**Migration:**
- Add columns with `nullable()` and `default(false)` for backward compatibility
- Set `nftGated = true` where `requiredNftContractAddress IS NOT NULL`

### Service Layer: NFT Verification Service

**New file: `packages/api/src/services/nft-verification-service.ts`**

```typescript
export class NFTVerificationService {
  /**
   * Verify user owns NFT from contract
   * @param walletAddress - User's wallet address
   * @param contractAddress - ERC721 contract address
   * @param tokenId - Optional specific token ID (null = any token)
   * @param chainId - Optional chain ID (defaults to current chain)
   * @returns true if user owns the NFT
   */
  static async verifyOwnership(
    walletAddress: string,
    contractAddress: string,
    tokenId: number | null,
    chainId?: number
  ): Promise<boolean>

  /**
   * Get user's token IDs from a collection
   * @param walletAddress - User's wallet address
   * @param contractAddress - ERC721 contract address
   * @param chainId - Optional chain ID
   * @returns Array of token IDs owned by user
   */
  static async getUserTokenIds(
    walletAddress: string,
    contractAddress: string,
    chainId?: number
  ): Promise<number[]>
}
```

**Implementation Details:**
- Use `createPublicClient` with viem (same pattern as `ReputationService`)
- For contract-level gating (tokenId = null): Call `balanceOf(walletAddress) > 0`
- For token-specific gating: Call `ownerOf(tokenId)` and compare with walletAddress
- Cache results: `nft:ownership:{chainId}:{contractAddress}:{walletAddress}:{tokenId}`
- Cache TTL: 5 minutes (balance can change, but not frequently)
- Handle errors: Invalid contract, RPC failures, non-ERC721 contracts

### Access Control Updates

**Update `GroupChatService.isInChat()` or create new method:**
```typescript
static async canJoinChat(
  userId: string,
  chatId: string
): Promise<{ canJoin: boolean; reason?: string }>
```

**Flow:**
1. Check if chat has NFT requirement (`nftGated = true`)
2. If yes:
   - Get user's wallet address from DB
   - If no wallet: return `{ canJoin: false, reason: 'Wallet required' }`
   - Verify NFT ownership via `NFTVerificationService`
   - Return result
3. If no NFT requirement: Use existing membership logic

**Update message sending:**
- `POST /api/chats/[id]/message` - Check NFT ownership before allowing message
- Cache check results to avoid repeated RPC calls during active chat

### API Changes

**1. `POST /api/chats` - Create Chat**
- Extend `ChatCreateSchema`:
  ```typescript
  {
    // ... existing fields
    requiredNftContractAddress?: string,
    requiredNftTokenId?: number | null,
    requiredNftChainId?: number | null,
  }
  ```
- Validate:
  - Contract address format (0x...)
  - If `requiredNftTokenId` provided, `requiredNftContractAddress` required
  - Chain ID must be supported (Base, Base Sepolia, or current chain)
- Set `nftGated = true` if contract address provided

**2. `POST /api/groups` - Create Group (with chat)**
- Same NFT fields as above
- Pass through to chat creation

**3. `GET /api/chats/[id]` - Get Chat Details**
- Include NFT requirement info in response:
  ```typescript
  {
    // ... existing fields
    nftRequirement?: {
      contractAddress: string,
      tokenId: number | null,
      chainId: number,
      chainName: string,
    }
  }
  ```

**4. `POST /api/chats/[id]/participants` - Add Participants**
- Before adding, check NFT ownership for each user
- Return clear errors: `NFT_REQUIRED`, `NFT_NOT_OWNED`, `WALLET_REQUIRED`

**5. New: `GET /api/chats/[id]/nft-verification` - Check User's NFT Status**
- Returns: `{ ownsNft: boolean, tokenIds: number[] }`
- Useful for frontend to show status before join attempt

### Frontend Changes

**1. Group Creation Form (`CreateGroupModal.tsx`)**
- Add optional "NFT Gating" section:
  - Toggle: "Require NFT to join"
  - Contract address input (with validation)
  - Token ID input (optional, for specific token gating)
  - Chain selector (Base, Base Sepolia) - default to current chain
  - Preview: "Users must hold NFT from [contract] to join"
- Show NFT badge/icon when gated

**2. Chat List (`ChatList.tsx`)**
- Show NFT badge/icon next to gated chats
- Tooltip: "NFT required: [contract name/address]"

**3. Chat Details/Join Flow**
- Show NFT requirement prominently
- "Verify NFT" button that calls verification API
- Show status: "You own this NFT ✓" or "NFT required to join"
- Disable join button if NFT not owned

**4. Error Messages**
- Clear messaging: "This group requires holding NFT [contract]"
- Link to OpenSea/BaseScan for viewing NFT
- "Connect wallet" prompt if no wallet

---

## 5. Edge Cases & Risks

### Edge Cases

1. **User transfers NFT after joining**
   - **Risk**: User joins, then transfers NFT, but remains in chat
   - **Mitigation**: 
     - Option A: Periodic verification (expensive, complex)
     - Option B: Verify on message send (cached, less expensive)
     - **Recommendation**: Option B - verify on message send with caching

2. **User has multiple wallets**
   - **Risk**: User owns NFT in wallet A, but wallet B is in DB
   - **Mitigation**: 
     - Check `users.walletAddress` (primary)
     - Future: Allow users to link multiple wallets
     - **Recommendation**: Start with single wallet, document limitation

3. **Contract doesn't exist or isn't ERC721**
   - **Risk**: Invalid contract address breaks verification
   - **Mitigation**: 
     - Try-catch around contract calls
     - Validate contract address format
     - Return clear error: "Invalid contract address"
     - **Recommendation**: Validate format, handle errors gracefully

4. **RPC failures/timeouts**
   - **Risk**: Network issues prevent verification
   - **Mitigation**:
     - Timeout: 10 seconds (same as Linear client)
     - Retry logic: 1 retry with exponential backoff
     - Fallback: Show "Unable to verify, please try again"
     - **Recommendation**: Fail gracefully, don't block user

5. **NFT on different chain than expected**
   - **Risk**: User creates chat requiring NFT on Ethereum, but system checks Base
   - **Mitigation**: 
     - Store `requiredNftChainId` in chat
     - Use correct RPC for that chain
     - **Recommendation**: Support chain selection, default to current chain

6. **User without wallet tries to join**
   - **Risk**: User hasn't connected wallet
   - **Mitigation**: 
     - Check `users.walletAddress` exists
     - Return error: "Wallet required. Please connect your wallet."
     - **Recommendation**: Clear error message with action

7. **Cache invalidation on NFT transfer**
   - **Risk**: Cached ownership becomes stale
   - **Mitigation**:
     - Short TTL (5 minutes)
     - Cache key includes timestamp/block number
     - **Recommendation**: 5-minute TTL is reasonable balance

8. **Contract-level vs token-specific gating**
   - **Risk**: Confusion about which mode is active
   - **Mitigation**:
     - Clear UI distinction
     - `tokenId = null` = any token from collection
     - `tokenId = number` = specific token required
     - **Recommendation**: Clear labels in UI

### Security Risks

1. **Client-side verification bypass**
   - **Risk**: User modifies frontend to bypass check
   - **Mitigation**: All verification server-side only
   - **Status**: ✅ Handled - verification in API layer

2. **Replay attacks**
   - **Risk**: User verifies once, then joins multiple times
   - **Mitigation**: Verify on each join attempt (cached)
   - **Status**: ✅ Handled - verification on join

3. **Invalid contract addresses**
   - **Risk**: Malicious contract addresses
   - **Mitigation**: Validate format, handle errors
   - **Status**: ✅ Handled - validation + error handling

---

## 6. Implementation Phases

### Phase 1: Database & Core Service (Foundation)
1. Create database migration
2. Update `chats` schema in Drizzle
3. Create `NFTVerificationService` with basic verification
4. Add caching layer
5. Unit tests for verification service

### Phase 2: Access Control (Backend)
1. Update `GroupChatService.canJoinChat()`
2. Update `POST /api/chats/[id]/participants` to check NFT
3. Update `POST /api/chats/[id]/message` to verify on send (cached)
4. Add `GET /api/chats/[id]/nft-verification` endpoint
5. Integration tests

### Phase 3: API Updates (Backend)
1. Extend `ChatCreateSchema` with NFT fields
2. Update `POST /api/chats` to accept NFT fields
3. Update `POST /api/groups` to accept NFT fields
4. Update `GET /api/chats/[id]` to return NFT requirement
5. API tests

### Phase 4: Frontend (UI)
1. Update `CreateGroupModal` with NFT gating fields
2. Add NFT badge to chat list
3. Add NFT verification UI to chat details
4. Error message components
5. E2E tests

### Phase 5: Polish & Testing
1. Error handling improvements
2. Performance optimization
3. Documentation
4. User testing feedback

---

## 7. Unknowns & Questions

### Questions for Product/Design

1. **Chain Support**: Should we support Ethereum mainnet NFTs, or start Base-only?
   - **Recommendation**: Start Base-only, add chain field for future expansion

2. **Token Transfer Handling**: Should users be removed if they transfer NFT?
   - **Recommendation**: No automatic removal, but verify on message send (cached)

3. **Multiple Wallets**: Should users be able to link multiple wallets?
   - **Recommendation**: Phase 2 feature, start with single wallet

4. **UI/UX**: How prominent should NFT requirement be?
   - **Recommendation**: Badge in list, prominent in details, clear in join flow

5. **Cache TTL**: How long to cache ownership checks?
   - **Recommendation**: 5 minutes (balance between freshness and performance)

### Technical Unknowns

1. **ERC721 Enumeration**: Do we need `tokenOfOwnerByIndex` for listing user's tokens?
   - **Answer**: Only if we want to show which tokens user owns. For verification, `balanceOf` + `ownerOf` is sufficient.

2. **Multi-chain RPC**: How to handle RPC URLs for different chains?
   - **Answer**: Use `getCurrentRpcUrl()` pattern, extend to support chain parameter

3. **Contract Validation**: Should we validate contract is ERC721 before allowing gating?
   - **Answer**: Try-catch is sufficient, but could add `supportsInterface(0x80ac58cd)` check

4. **Performance**: How many RPC calls per verification?
   - **Answer**: 1 call (`balanceOf` or `ownerOf`), cached for 5 minutes

---

## 8. Success Criteria

### Functional
- ✅ Users can create NFT-gated group chats
- ✅ Users without NFT cannot join
- ✅ Users with NFT can join
- ✅ NFT requirement visible in UI
- ✅ Clear error messages

### Performance
- ✅ Verification completes in < 2 seconds (cached)
- ✅ Cache hit rate > 80% for active chats
- ✅ RPC failures don't block UI

### Security
- ✅ All verification server-side
- ✅ No client-side bypass possible
- ✅ Invalid contracts handled gracefully

### User Experience
- ✅ Clear indication of NFT requirement
- ✅ Easy verification flow
- ✅ Helpful error messages with actions

---

## 9. Dependencies

### External
- Viem (already installed)
- Redis (already configured)
- RPC providers (already configured)

### Internal
- `@babylon/db` - Database schema
- `@babylon/api` - API layer, caching
- `@babylon/shared` - Validation schemas, config
- `apps/web` - Frontend components

### No New Dependencies Required ✅

---

## 10. Testing Strategy

### Unit Tests
- `NFTVerificationService.verifyOwnership()` - Various scenarios
- `NFTVerificationService.getUserTokenIds()` - Token enumeration
- Cache behavior
- Error handling

### Integration Tests
- Create NFT-gated chat
- Join with/without NFT
- Message sending with NFT check
- Cache invalidation

### E2E Tests (Synpress)
- User creates NFT-gated chat
- User without NFT tries to join (blocked)
- User with NFT joins successfully
- User sends message (verification cached)

---

## 11. Rollout Plan

### Phase 1: Backend Only (No UI)
- Deploy database migration
- Deploy verification service
- Test via API directly
- Monitor RPC usage

### Phase 2: API Updates
- Deploy API changes
- Test with Postman/curl
- Monitor error rates

### Phase 3: Frontend (Beta)
- Deploy to staging
- Test with real NFTs
- Gather feedback

### Phase 4: Production
- Deploy to production
- Monitor metrics
- Iterate based on usage

---

## 12. Open Questions for Review

1. **Chain Support**: Start Base-only or support Ethereum from day 1?
2. **Token Transfer**: Remove users who transfer NFT, or just verify on send?
3. **Multiple Wallets**: Support multiple wallets per user initially?
4. **Cache TTL**: 5 minutes acceptable, or need different strategy?
5. **UI Priority**: How prominent should NFT requirement be in UI?
6. **Error Messages**: What exact wording for various error cases?

---

## Next Steps

1. **Review this plan** - Address open questions
2. **Clarify requirements** - Get answers to questions above
3. **Start Phase 1** - Database migration + core service
4. **Iterate** - Build incrementally, test frequently

