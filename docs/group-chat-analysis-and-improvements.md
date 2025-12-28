# Group Chat Functionality Analysis & Game Logic Improvements

## Current Group Chat System Overview

### 1. **Core Mechanics**

#### Group Chat Types
- **NPC-Owned Chats**: NPCs create and manage their own groups ("Inner Circle")
- **User-Created Chats**: Players can create groups and invite others
- **NFT-Gated Chats**: NEW - Groups requiring specific NFT ownership (BAB-63)

#### Key Services
1. **`GroupChatService`** (`packages/engine/src/services/group-chat-service.ts`)
   - Manages invitations and membership lifecycle
   - Handles quality-based sweeps (removals)
   - Tracks engagement metrics

2. **`NPCGroupDynamicsService`** (`packages/engine/src/services/npc-group-dynamics-service.ts`)
   - NPCs form new groups based on relationships
   - NPCs join/leave groups dynamically
   - NPCs post messages with insider information
   - Runs continuously on game ticks

3. **`AutonomousGroupChatService`** (`packages/agents/src/autonomous/AutonomousGroupChatService.ts`)
   - User agents participate in group chats
   - Responds when mentioned or after inactivity
   - Uses LLM for contextual responses

---

## 2. **Current Group Chat Flow**

### A. **Invitation System**
```
Player Engagement → Follow NPC → Quality Interactions → Invite Calculation → Group Invite
```

**Requirements for Invite:**
- Followed by NPC for 24+ hours
- 5+ quality replies since follow
- Average quality score ≥ 75%
- Not already in a chat with that NPC

**Probability Calculation:**
- Base: 10%
- Max: 60%
- Owned chat weight: 70%
- Member chat weight: 30%
- Factors: Quality (60%) + Engagement (40%)

### B. **Message Generation (NPCs)**

**Tick-Based Posting:**
- 25% chance per active group per tick
- Random NPC selected from group members
- Uses LLM with rich context:
  - World events
  - Market conditions
  - Character relationships
  - Previous conversation history
  - Current positions & insider knowledge

**Message Types:**
- **Insider trading info**: "Just went long $50k on [ticker] before news drops"
- **Strategic coordination**: "Coordinating short attack on [rival's company]?"
- **Confidential data**: "Our Q3 numbers are terrible - not public yet"
- **Gossip**: About people outside the group
- **Contradictions**: Truth vs public statements

### C. **Sweep (Removal) System**

**Base kick probability**: 0.00007 per tick

**Removal Triggers:**
- **Inactivity**: No messages for 5+ days
- **Over-posting**: >10 messages in 24h (spam)
- **Low quality**: Average quality <0.7
- **Sweet spot**: 1-3 messages per 24h is ideal

**Grace Period:** 1 day (1440 ticks) before any removal consideration

---

## 3. **ASYMMETRIC INFORMATION Mechanic**

**This is the CORE game mechanic:**

### Public Feed vs Private Chats
| Public Feed | Private Group Chats |
|------------|---------------------|
| What NPCs want market to think | What NPCs actually know/plan |
| Curated statements | Strategic insider info |
| May be misleading | Real positions & trades |
| Sentiment manipulation | Coordination & alpha |

### Example Flow:
1. **Public**: "TeslAI looks promising! 🚀"
2. **Private**: "Between us, TeslAI is screwed. I'm shorting $100k."
3. **Result**: Players in the group get alpha, others get misled

---

## 4. **Current Issues & Limitations**

### A. **Cadence Problems**
- ✅ **Fixed**: Probabilistic posting (25% per tick)
- ✅ **Fixed**: Day-based activity variation
- ⚠️ **Issue**: No time-based throttling (could spam if unlucky)
- ⚠️ **Issue**: No conversation threading/continuity tracking

### B. **Context Quality**
- ✅ **Good**: Rich world context
- ✅ **Good**: Previous message history
- ⚠️ **Issue**: No long-term memory (only last 10 messages)
- ⚠️ **Issue**: Conversations can repeat themes

### C. **Engagement Issues**
- ⚠️ **Issue**: Players may not realize value of group chats
- ⚠️ **Issue**: No notification when insider info is shared
- ⚠️ **Issue**: Hard to discover which groups have best alpha

### D. **Game Balance**
- ⚠️ **Issue**: Group chat advantage not balanced vs public-only players
- ⚠️ **Issue**: No cost/risk for accessing insider info
- ⚠️ **Issue**: NFT-gated chats create pay-to-win if not balanced

---

## 5. **Proposed Improvements**

### Priority 1: HIGH IMPACT

#### 1.1 **Conversation Threading & Memory**
**Problem**: Conversations lack continuity, repeat topics

**Solution**:
```typescript
interface ConversationThread {
  id: string;
  chatId: string;
  theme: string; // "TeslAI manipulation", "FDA insider info"
  startedAt: Date;
  lastMessageAt: Date;
  participants: string[];
  keyPoints: string[]; // "Agreed to coordinate short", "Shared Q3 numbers"
  resolved: boolean;
}
```

**Benefits**:
- NPCs build on previous conversations
- "Remember when we discussed X?" references
- Evolving relationships and strategies
- No repetitive topics

**Implementation**:
- Store conversation threads in DB
- Pass thread history to LLM prompts
- Mark threads as "resolved" when outcome happens
- Generate new threads based on world events

---

#### 1.2 **Alpha Quality Scoring**
**Problem**: Players can't tell which groups have best insider info

**Solution**:
```typescript
interface AlphaScore {
  chatId: string;
  period: '24h' | '7d' | '30d';
  
  // Metrics
  insiderInfoShared: number; // Count of actionable tips
  predictionAccuracy: number; // % of tips that were correct
  earlyWarnings: number; // Tips before public knowledge
  marketImpact: number; // Avg price movement after tips
  
  // Derived score
  alphaScore: number; // 0-100
  rank: number; // Ranking among all chats
}
```

**Display to Players**:
- "🔥 High Alpha" badge on chat list
- "This group's tips have 73% accuracy"
- "Members earned avg +$12k this week from tips"

**Benefits**:
- Players value group membership more
- Competitive dynamics between groups
- Incentive to engage with quality

---

#### 1.3 **Time-Based Throttling**
**Problem**: No explicit rate limiting, could spam

**Solution**:
```typescript
const THROTTLE_RULES = {
  minMinutesBetweenMessages: 15, // Per chat
  maxMessagesPerHour: 4, // Per chat
  cooldownAfterBurst: 60, // Minutes after 3 rapid messages
};
```

**Benefits**:
- More natural conversation pace
- Prevents spam even with bad RNG
- Builds anticipation for next message

---

### Priority 2: MEDIUM IMPACT

#### 2.1 **Insider Info Notifications**
**Problem**: Players miss valuable tips

**Solution**:
- Detect "high-value" messages using LLM classification
- Send push notification: "🔥 Insider tip in [Group Name]"
- Highlight message in UI with special badge
- Track if player acted on tip (for learning)

**Classification**:
```typescript
interface InsiderTipClassification {
  isInsiderInfo: boolean;
  confidence: number;
  category: 'trade_signal' | 'market_intel' | 'company_data' | 'coordination';
  urgency: 'immediate' | 'soon' | 'fyi';
  tickers: string[];
  action: 'buy' | 'sell' | 'watch' | null;
}
```

---

#### 2.2 **Group Chat Discovery**
**Problem**: Hard to find valuable groups

**Solution**:
- **"Trending Groups"** widget showing active chats
- **"Alpha Leaderboard"** showing top-performing groups
- **"Invite Marketplace"** where players can request invites
- **Group Previews**: Show last 3 messages (blurred) to non-members

---

#### 2.3 **Relationship-Based Dynamics**
**Problem**: Group formation is somewhat random

**Solution**: Enhance `NPCGroupDynamicsCalculations` with:
```typescript
interface RelationshipFactors {
  // Current
  affiliationMatch: number; // Same org/faction
  rivalryScore: number; // Enemies don't group
  
  // NEW
  tradingAlignment: number; // Similar positions
  informationValue: number; // Complementary insider knowledge
  trustLevel: number; // Built over time through interactions
  mutualBenefit: number; // Both gain from coordination
}
```

**Benefits**:
- More realistic group formation
- Strategic alliances emerge naturally
- Betrayals become possible (trust breaks)

---

### Priority 3: GAME BALANCE

#### 3.1 **Information Decay**
**Problem**: Insider info has no time value

**Solution**:
```typescript
interface InsiderInfoLifecycle {
  sharedAt: Date;
  expiresAt: Date; // When info becomes public
  halfLife: number; // Minutes until value drops 50%
  
  value: {
    immediate: number; // Act now: 100%
    after1h: number; // 75%
    after4h: number; // 40%
    after24h: number; // 10%
  };
}
```

**Display**:
- "⏰ Urgent - Act within 1h for max value"
- "Value decaying: 67% remaining"

**Benefits**:
- Rewards active players
- Creates urgency
- Balances against public-only players

---

#### 3.2 **Risk/Cost for Insider Trading**
**Problem**: No downside to acting on insider info

**Solution**:
```typescript
interface InsiderTradingRisk {
  // Detection system
  suspicionLevel: number; // 0-100
  triggers: [
    'large_trade_after_group_message',
    'multiple_users_same_group_same_trade',
    'trade_before_public_announcement'
  ];
  
  // Consequences
  penalties: {
    reputationLoss: number;
    tradingFees: number; // Higher fees if suspicious
    groupKick: boolean; // NPCs kick sus traders
    marketImpact: number; // Slippage increases
  };
}
```

**Benefits**:
- Balances insider trading advantage
- Creates strategic decisions (act vs wait)
- Adds realism
- Prevents obvious exploitation

---

#### 3.3 **NFT-Gated Chat Balance**
**Problem**: Could become pay-to-win

**Solution**:
1. **Free Alpha Groups**: Ensure quality free groups exist
2. **NFT Group Limits**: Cap alpha score of NFT groups
3. **Rotation**: NFT groups rotate focus (not always best)
4. **Skill Factor**: Still need to interpret info correctly

**Metrics to Track**:
- Win rate: NFT holders vs non-holders
- ROI: NFT group members vs public-only
- Engagement: Are free players churning?

---

## 6. **Implementation Roadmap**

### Phase 1: Foundation (Week 1-2)
- [ ] Conversation threading system
- [ ] Alpha quality scoring
- [ ] Time-based throttling
- [ ] Insider info classification

### Phase 2: Discovery & Engagement (Week 3-4)
- [ ] Insider info notifications
- [ ] Group discovery features
- [ ] Alpha leaderboard
- [ ] Group previews

### Phase 3: Balance & Dynamics (Week 5-6)
- [ ] Information decay system
- [ ] Relationship-based group formation
- [ ] Insider trading risk/detection
- [ ] NFT-gated chat balancing

### Phase 4: Polish & Monitoring (Week 7-8)
- [ ] Analytics dashboard
- [ ] A/B testing framework
- [ ] Balance adjustments
- [ ] Player feedback integration

---

## 7. **Success Metrics**

### Engagement
- **Group chat participation rate**: Target 60%+ of active players
- **Messages per user per day**: Target 2-5
- **Retention**: Players in groups have 2x retention

### Information Value
- **Alpha accuracy**: 65-75% (not too high = no skill, not too low = no value)
- **ROI advantage**: Group members earn 20-40% more than public-only
- **Time to act**: Players act on tips within 2h avg

### Balance
- **Win rate parity**: NFT holders vs free players within 10%
- **Churn rate**: <5% of players leave due to "unfair advantage"
- **Engagement distribution**: No single group dominates

---

## 8. **Technical Considerations**

### Database Schema Changes
```sql
-- Conversation threads
CREATE TABLE conversation_threads (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  theme TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  last_message_at TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  key_points JSONB DEFAULT '[]'
);

-- Alpha scores
CREATE TABLE alpha_scores (
  chat_id TEXT NOT NULL,
  period TEXT NOT NULL,
  insider_info_shared INTEGER DEFAULT 0,
  prediction_accuracy DECIMAL(5,2),
  market_impact DECIMAL(10,2),
  alpha_score INTEGER,
  calculated_at TIMESTAMP NOT NULL,
  PRIMARY KEY (chat_id, period)
);

-- Insider info tracking
CREATE TABLE insider_info_events (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  classification JSONB NOT NULL,
  shared_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  outcome TEXT, -- 'correct' | 'incorrect' | 'pending'
  value_captured DECIMAL(10,2)
);
```

### LLM Prompt Enhancements
```typescript
// Add to group message prompts
const CONVERSATION_CONTINUITY = `
=== CONVERSATION THREADS ===
Active threads in this chat:
${threads.map(t => `
  Thread: "${t.theme}"
  Started: ${t.startedAt}
  Key points: ${t.keyPoints.join(', ')}
  Status: ${t.resolved ? 'RESOLVED' : 'ONGOING'}
`).join('\n')}

RULES:
- Build on active threads naturally
- Reference previous key points when relevant
- Start new threads for new topics
- Mark threads as resolved when outcome is known
`;
```

### Performance Considerations
- **Caching**: Alpha scores cached for 5min
- **Batch processing**: Thread analysis runs async
- **Indexing**: Add indexes on `chat_id`, `shared_at`, `expires_at`
- **Archival**: Move old threads to cold storage after 30 days

---

## 9. **Next Steps**

### Immediate Actions
1. **Review this doc** with team
2. **Prioritize features** based on impact/effort
3. **Create Linear issues** for Phase 1
4. **Set up analytics** to track baseline metrics
5. **Design mockups** for UI changes

### Questions to Answer
1. What's the target alpha advantage for group members? (20%? 40%?)
2. Should we A/B test insider trading risk system?
3. How do we handle groups that become too powerful?
4. What's the UX for information decay indicators?
5. Should we add group chat achievements/badges?

---

## 10. **References**

### Related Files
- `packages/engine/src/services/group-chat-service.ts` - Core service
- `packages/engine/src/services/npc-group-dynamics-service.ts` - NPC behavior
- `packages/engine/src/prompts/game/group-messages.ts` - Message generation
- `packages/agents/src/autonomous/AutonomousGroupChatService.ts` - Agent participation
- `apps/web/src/app/api/chats/[id]/message/route.ts` - Message API
- `docs/nft-gated-group-chats-plan.md` - NFT gating implementation

### Related Issues
- BAB-36: Group Chat Information Generation Logic ✅ DONE
- BAB-37: Group Chat Display Cadence ⚠️ PARTIAL
- BAB-63: NFT/ERC721-gated group chats ✅ DONE (PR #668)

