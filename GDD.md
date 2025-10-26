# Babylon - Game Design Document (GDD)

**Version:** 2.0  
**Type:** Satirical Prediction Market Game  
**Platform:** Web (React), CLI  
**Generation:** LLM-driven (OpenAI)

---

## 🎯 CORE CONCEPT

**Players observe a generated satirical world and bet on yes/no outcomes.**

- Game generates 30-day narrative with satirical actors (Elon's Husk, Scam Altman, etc.)
- 3 yes/no questions to predict
- Players DON'T control the world - they observe and bet
- World unfolds automatically - players read feed, join group chats, make predictions
- Predetermined outcomes - game knows answers, players must deduce them

---

## 👥 ACTORS (68 Total)

### Tier System:
- **S-Tier (5):** Most famous, highest impact (Elon's Husk, Scam Altman, etc.)
- **A-Tier (6):** Famous influencers (Naval Ravitard, Peter Thief, etc.)
- **B-Tier (8):** Known personalities (Rachel Madcow, Lex Deadpan, etc.)
- **C-Tier (10):** Supporting cast
- **D-Tier (39):** Extras and commentators

### Actor Properties:
- `canPostFeed`: Can post publicly
- `canPostGroups`: Can post in group chats
- `domain`: Areas of expertise
- `personality`: Character traits
- `luck`: low/medium/high (changes daily)
- `mood`: -1 to 1 (changes daily)

---

## 🎮 GAME FLOW

### Pre-Game: LLM Generation (5-10 minutes)

**Phase 1: Actor Selection**
- Pick 3 main actors (weighted toward S/A tier)
- Pick 15 supporting actors (mixed tiers)
- Pick 50 extras (mostly C/D tier)

**Phase 2: Scenario & Question Generation**
- Generate 3 scenarios involving the 3 mains
- Generate 5 yes/no questions per scenario (15 total)
- LLM ranks all 15 questions by interest
- Select top 3 questions (one per scenario)

**Phase 3: World Building**
- Generate connections between all actors
- Create 5-8 group chats (each main has 1-2)
- Assign actors to group chats
- Set initial luck/mood values

**Phase 4: Timeline Generation (30 days)**

Days 1-10 (WILD PHASE):
- 3-5 world events per day
- Strange, disconnected, mysterious
- Rumors, vague hints
- NPCs in groups share cryptic info
- Feed: 10-15 posts per day

Days 11-20 (CONNECTION PHASE):
- 5-7 world events per day
- Stories start connecting
- More concrete information
- Groups become more active
- Feed: 15-25 posts per day

Days 21-25 (CONVERGENCE PHASE):
- 7-10 world events per day
- Storylines tie together
- Major revelations
- Truth begins emerging
- Feed: 25-35 posts per day

Days 26-29 (CLIMAX PHASE):
- 10-15 world events per day
- Maximum uncertainty
- Conflicting final clues
- Dramatic developments
- Feed: 35-50 posts per day

Day 30 (RESOLUTION):
- 5 final events
- All 3 questions resolved
- Outcomes revealed
- Epilogue
- Feed: 20-30 final posts

**Phase 5: Save Game**
- Complete JSON (3-5MB)
- All events, posts, outcomes
- Ready for players

---

### In-Game: Player Experience

**Players join a pre-generated game:**

1. **View Feed** (Main Activity)
   - Scroll through chronological feed
   - See news, reactions, threads
   - Posts from all actors
   - Can see everything publicly

2. **Join Group Chats** (Insider Info)
   - Start game: NOT in any groups
   - Post on feed → Chance to be added to group
   - Groups have 5-10 NPCs + players
   - NPCs drop insider info in groups
   - Players can add other players
   - NPCs don't respond to players

3. **Make Predictions**
   - 3 yes/no questions
   - Place bets with tokens
   - Odds update based on bets
   - Resolve on Day 30

4. **Progress Through Days**
   - Game advances day-by-day
   - New posts appear each day
   - Group chats get new messages
   - Players can post anytime
   - Game automatically ends Day 30

---

## 📱 PLAYER UI SCREENS

### 1. Game Lobby
```
┌─────────────────────────────────────────┐
│  🎮 BABYLON - Satirical Prediction Game │
│                                         │
│  Current Game:                          │
│  "Will OpenLIE release GPT-6?"          │
│  Status: Day 5/30                       │
│                                         │
│  Players: 12/20                         │
│  Your Balance: 1000 tokens              │
│                                         │
│  [ Join Game ]  [ View Feed ]           │
└─────────────────────────────────────────┘
```

### 2. Feed (Main Screen)
```
┌─────────────────────────────────────────────────┐
│  📰 FEED - Day 5/30                             │
├─────────────────────────────────────────────────┤
│                                                 │
│  📰 The New York Crimes @10:23am                │
│  BREAKING: OpenLIE schedules mysterious event   │
│  Sources say "biggest announcement ever"        │
│  ❤️ 234  💬 89  🔄 156                         │
│                                                 │
│  💬 Scam Altman @10:45am                        │
│  Big things coming. Bigger than you think.     │
│  ❤️ 1.2K  💬 456  🔄 890                       │
│                                                 │
│    ↳ 💬 Elon's Husk @11:02am                   │
│      lol sure buddy                            │
│      ❤️ 2.3K  💬 234                           │
│                                                 │
│  📰 Boomerberg @11:30am                         │
│  Analysis: GPU shortage may delay AI plans     │
│  ❤️ 456  💬 123                                │
│                                                 │
│  [ Post Update ]                                │
└─────────────────────────────────────────────────┘
```

### 3. Group Chats (Insider Info)
```
┌─────────────────────────────────────────────────┐
│  💬 AI Insiders (Private Group)                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  Scam Altman:                                   │
│  Just left Nvidia. Things are... accelerating.  │
│  10:15am ✓✓                                     │
│                                                 │
│  Johnson Hung:                                    │
│  The H200 changes EVERYTHING.                   │
│  10:23am ✓✓                                     │
│                                                 │
│  You:                                           │
│  What does this mean for the timeline?          │
│  10:30am ✓✓                                     │
│                                                 │
│  [NPCs may drop more info later]                │
│                                                 │
│  [ Type message... ]                            │
└─────────────────────────────────────────────────┘
```

### 4. Predictions
```
┌─────────────────────────────────────────────────┐
│  📊 PREDICTIONS - Day 5/30                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Question 1: Will OpenLIE release GPT-6?        │
│  Current Odds: 67% YES / 33% NO                 │
│  Your Bet: 100 tokens on YES                    │
│  Potential Payout: 149 tokens                   │
│                                                 │
│  Question 2: Will Ethereum 3.0 launch?          │
│  Current Odds: 45% YES / 55% NO                 │
│  Your Bet: None                                 │
│  [ Bet on YES ] [ Bet on NO ]                   │
│                                                 │
│  Question 3: Will SEC approve Bitcoin ETF?      │
│  Current Odds: 52% YES / 48% NO                 │
│  Your Bet: 200 tokens on NO                     │
│  Potential Payout: 384 tokens                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🔄 GAME LOOP

### Server/Host:
1. Pre-generate game using LLM (once)
2. Save game JSON
3. Host game for players to join
4. Advance day every X minutes (or manually)
5. Reveal new feed posts for current day
6. Allow group chat interactions
7. Track player bets
8. Resolve on Day 30

### Players:
1. Join game (assigned random tokens)
2. Read feed posts
3. Join group chats (if added)
4. Post on feed (chance to join groups)
5. Make predictions on 3 questions
6. Wait for Day 30
7. Win/lose based on correct predictions

---

## 🎲 GAME MECHANICS

### Feed Posting:
- **Anyone** can post on public feed
- Posts appear in chronological order
- No replies to player posts (NPCs ignore them)
- Players can see all NPC posts

### Group Chats:
- **Private** - Only members see
- 5-10 members per group
- NPCs drop insider info randomly
- Players get added if they post on feed
- Players can invite other players

### Predictions:
- 3 yes/no questions
- Bet tokens on YES or NO
- Odds determined by total bets (LMSR)
- Payouts based on odds
- Resolve on Day 30

### Luck & Mood:
- **Luck:** Affects how things go for actor
- **Mood:** Affects tone of their posts
- Both change daily based on events
- Visible in actor profiles

---

## 📊 TECHNICAL ARCHITECTURE

```
Game Generation (Pre-game):
  LLM → Complete 30-day narrative
     → All feed posts
     → All group messages
     → All events
     → Outcomes predetermined

Game Server (Runtime):
  Load generated JSON
  → Host for players
  → Manage day progression
  → Handle player bets
  → Resolve outcomes

Player Client:
  React UI
  → View feed
  → Join groups
  → Make bets
  → See results
```

---

## 🧪 TESTING REQUIREMENTS

### Unit Tests:
- [x] Game generation
- [x] Actor selection
- [x] Scenario generation
- [x] Feed generation
- [x] Event validation

### Integration Tests:
- [x] Complete game generation
- [x] JSON validation
- [x] Timeline coherence

### Synpress Tests (Player UI):
- [ ] Connect wallet
- [ ] Join game
- [ ] View feed
- [ ] Post on feed
- [ ] Join group chat
- [ ] Post in group
- [ ] Place bet
- [ ] See day progression
- [ ] View results

---

## 🎯 SUCCESS CRITERIA

### Generated Game:
- ✅ Has 3 main actors from S/A tier
- ✅ Has 15 supporting actors
- ✅ Has 50 extras
- ✅ Has 3 scenarios
- ✅ Has 3 yes/no questions
- ✅ Has 30 days of events
- ✅ Has 1500-2100 feed posts (richer than target)
- ✅ Has 130-210 group messages
- ✅ Has predetermined outcomes
- ✅ JSON is valid and loadable

### Player Experience:
- ⏸️  Can join game
- ⏸️  Can see feed
- ⏸️  Can post on feed
- ⏸️  Can join group chats
- ⏸️  Can make predictions
- ⏸️  Can see day progression
- ⏸️  Can see final results
- ⏸️  All tested with Synpress

---

## 📋 IMPLEMENTATION STATUS

**Phase 1: Architecture** ✅
- Game generation pipeline
- Actor database (68 actors)
- OpenAI integration
- Feed system architecture

**Phase 2: LLM Generation** ✅
- Complete generation pipeline working
- Rich content generation (events, posts, messages)
- Mock mode available (no API key needed)
- LLM mode with OpenAI integration

**Phase 3: Player UI** ⏸️
- React app needed
- Feed viewer
- Group chat UI
- Prediction interface

**Phase 4: Synpress Tests** ⏸️
- UI testing needed

---

**Next: Implement complete LLM generation + Player UI + Tests**

