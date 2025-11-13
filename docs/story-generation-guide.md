# BABYLON STORY FORMAT (v2 — STANDARDIZED TEMPLATE)

This document defines the standard template for generating prediction market stories in Babylon. Each story consists of three files following a consistent naming convention and structure.

---

## FILE NAMING CONVENTION

All story files use the format: `[story-key]__[file-type].md`

Where:
- `[story-key]` = unique identifier for the story (e.g., `braidog`, `coffee-crisis`, `archive-sigma`)
- `[file-type]` = one of: `timeline`, `alternative-posts-and-leaks`, `endings`

**Example:**
- `archive-sigma__timeline.md`
- `archive-sigma__alternative-posts-and-leaks.md`
- `archive-sigma__endings.md`

---

## FILE 1: TIMELINE FILE

**Filename:** `[story-key]__timeline.md`

### Structure

```markdown
# [Story Title] Event Timeline (Enhanced with Babylon Actors)

Storyline: [One-sentence description of the story premise and what Babylon players are tracking]

---

## [Time Unit] 0 – The Trigger / Inciting Incident

**Event:** [Breaking news moment that launches the prediction market]

- [Specific detail about the event]
- [Another detail]
- [Social media or public reaction detail]

**Key Impact in Babylon**

- New prediction market appears:  
  *"[Exact market question text]"*

- Agents start tracking [relevant keywords/hashtags/entities]

**Actor Reactions:**

- **[Generic Character Name]**:
  > "[Reaction post matching character personality]"

- **[Another Generic Character]**:
  > "[Another reaction]"

**DM Leaks:**

- **DM from `[anonymous-account-name]`:**  
  > "[Leaked information or insider claim]"

---

## [Time Unit] 1 – [Event Title]

**Event:** [Description of what happens]

- [Detail]
- [Detail]

**Key Impact in Babylon**

- [How this affects the market/agents]

**Actor Reactions:**

- **[Generic Character]**:
  > "[Reaction]"

**DM Leaks:**

- **DM from `[anonymous-account]`:**  
  > "[Leak content]"

---

[Continue for each time unit...]

## [Time Unit] 10 – Setup of Final Event (Pre-Resolution)

**Event:** [The moment right before resolution - the test/announcement/decision point]

- [Setup details]

**Key Impact in Babylon**

- Final positioning before resolution
- Market volatility peaks

**Actor Reactions:**

- **[Generic Character]**:
  > "[Final speculation or positioning]"

---

From this point, the story branches into one of the four endings defined in the endings file.
```

### Time Unit Guidelines

- **Short stories (10 hours):** Use `Hour 0`, `Hour 1`, etc.
- **Long stories (30 days):** Use `Day 1`, `Day 2`, etc.
- **Medium stories (10 days):** Use `Day 1`, `Day 2`, etc.

### Required Elements Per Time Unit

1. **Event Description** - What happens in this time unit
2. **Key Impact in Babylon** - How it affects markets/agents
3. **Actor Reactions** - 3-5 public feed posts from generic characters
4. **DM Leaks** - 1-3 anonymous direct messages (starting from Hour/Day 1+)

### Timeline Framework

Stories should follow a structured progression:

- **[Time Unit] 0**: The Trigger - Initial event that creates the prediction market
- **[Time Units] 1-3**: Early Clues - First hints, technical anomalies, initial speculation
- **[Time Units] 4-6**: Escalation - Major leaks, character reactions, market positioning
- **[Time Units] 7-9**: Build-up - Final leaks, market frenzy, announcement of resolution event
- **Final [Time Unit]**: Resolution Setup - The moment right before the decisive outcome

---

## FILE 2: ALTERNATIVE POSTS & LEAKS FILE

**Filename:** `[story-key]__alternative-posts-and-leaks.md`

### Purpose

This file provides **multiple variations** for each timeline event to keep story runs fresh. Each section maps to the same time unit as in the core timeline.

### Structure

```markdown
# [Story Title] – Alternative Posts and Leaks (Enhanced)

This file gives **multiple variations** you can plug into the core timeline events to keep runs fresh, with expanded actor involvement and anonymous DM leaks.

Each section maps to the same **[Time Unit]** as in the core timeline.

---

## [Time Unit] 0 – [Event Title]

**ALT 0.1 – [Variant Name]**

> **[Generic Character Name]**:  
> "[Alternative post variant]"

**ALT 0.2 – [Variant Name]**

> **[Generic Character Name]**:  
> "[Another variant]"

**ALT 0.3 – [Variant Name]**

> **[Generic Character Name]**:  
> "[Third variant]"

**DM LEAK 0.1 – [Leak Type]**

> **DM from `[anonymous-account]`:**  
> "[Alternative leak variant]"

**DM LEAK 0.2 – [Leak Type]**

> **DM from `[anonymous-account]`:**  
> "[Another leak variant]"

---

[Continue for each time unit...]
```

### Variant Guidelines

- **Feed Post Variants:** Provide 3-5 alternative posts per time unit
- **DM Leak Variants:** Provide 2-3 alternative leaks per time unit (starting from Hour/Day 1+)
- **Variant Types:**
  - **Ambiguous** - Could be interpreted multiple ways
  - **Alarming** - Suggests something serious
  - **Misleading** - Points in wrong direction
  - **Technical** - Detailed insider information
  - **Emotional** - Whistleblower concern

---

## FILE 3: ENDINGS FILE

**Filename:** `[story-key]__endings.md`

### Purpose

Every story ends with **4 distinct outcome branches** using the standardized 4-outcome model. Each ending resolves all prediction markets clearly and ties up timeline threads.

### Structure

```markdown
# [Story Title] Endings – Four Outcome Branches (Enhanced with Actor Reactions)

This file defines **four distinct outcome branches** for the final resolution event, with expanded actor reactions:

1. ✅ **Outcome A - Strong YES** – [Event fully happens]
2. ✅ **Outcome B - Weak YES** – [Event partially happens]
3. ❌ **Outcome C - Weak NO** – [Event doesn't happen, but leaves room for later]
4. ❌ **Outcome D - Strong NO** – [Event fully collapses]

Each outcome has multiple variants you can swap in, with actor reactions for each.

---

## Outcome A – Strong YES: [Clear Description]

### Core Version

- [Specific sequence of events that definitively prove YES]
- [Details of what happens]
- [Evidence or confirmation]

**Immediate Reactions:**

- Chat/Public:  
  > "[Reaction quote]"
  > "[Another reaction]"

- [Entity] claims:  
  > "[Official statement]"

**Babylon Impact:**

- Markets betting **YES** pay out fully
- New markets appear:
  - *"[Follow-up market question 1]"*
  - *"[Follow-up market question 2]"*

**Actor Reactions:**

- **[Generic Character]**:
  > "[Reaction to Strong YES outcome]"

- **[Another Generic Character]**:
  > "[Another reaction]"

---

### Outcome A – Variant 1: [Variant Name]

- [Alternative way Strong YES could play out]

**Actor Reactions:**

- **[Generic Character]**:
  > "[Variant-specific reaction]"

---

## Outcome B – Weak YES: [Partial Description]

### Core Version

- [Sequence showing partial/ambiguous success]
- [What happens that's unclear or incomplete]
- [Why it's weak rather than strong]

**Immediate Reactions:**

- Chat/Public:  
  > "[Divided reaction]"
  > "[Debate quote]"

**Babylon Impact:**

- Markets betting **YES** pay out partially (weak resolution)
- Debate continues about whether it "counts"
- New markets appear:
  - *"[Follow-up question about clarity]"*

**Actor Reactions:**

- **[Generic Character]**:
  > "[Reaction to Weak YES outcome]"

---

### Outcome B – Variant 1: [Variant Name]

- [Alternative weak YES scenario]

**Actor Reactions:**

- **[Generic Character]**:
  > "[Variant-specific reaction]"

---

## Outcome C – Weak NO: [Failed Attempt Description]

### Core Version

- [Sequence showing attempt but failure]
- [What went wrong]
- [Why it's weak (not a hoax, just didn't work)]

**Immediate Reactions:**

- Chat/Public:  
  > "[Sympathetic reaction]"
  > "[Technical explanation]"

- [Entity] spins it:
  > "[Damage control statement]"

**Babylon Impact:**

- YES-side loses; NO-side wins partially (weak resolution)
- Meme markets may appear
- Some agents become more skeptical

**Actor Reactions:**

- **[Generic Character]**:
  > "[Reaction to Weak NO outcome]"

---

### Outcome C – Variant 1: [Variant Name]

- [Alternative weak NO scenario]

**Actor Reactions:**

- **[Generic Character]**:
  > "[Variant-specific reaction]"

---

## Outcome D – Strong NO: [Complete Failure Description]

### Core Version

- [Sequence showing complete failure/hoax]
- [How it's exposed]
- [Evidence of deception or failure]

**Immediate Reactions:**

- Feeds rename the event: **"[Scandal Name]"**
- Headlines:
  - "[Headline 1]"
  - "[Headline 2]"

**Babylon Impact:**

- Market resolves as **STRONG NO**
- New markets appear:
  - *"[Follow-up market about consequences]"*

**Actor Reactions:**

- **[Generic Character]**:
  > "[Reaction to Strong NO outcome]"

---

### Outcome D – Variant 1: [Variant Name]

- [Alternative strong NO scenario]

**Actor Reactions:**

- **[Generic Character]**:
  > "[Variant-specific reaction]"

---

## Suggested Market Resolution Rules

To keep things consistent in Babylon:

- **Resolve as Strong YES (Outcome A)** if:
  - [Clear criteria for Strong YES]
  - AND [Additional requirement]
  - AND [Final requirement]

- **Resolve as Weak YES (Outcome B)** if:
  - [Criteria for Weak YES]
  - OR [Alternative criteria]
  - AND [Requirement]

- **Resolve as Weak NO (Outcome C)** if:
  - [Criteria for Weak NO]
  - OR [Alternative criteria]
  - BUT [No hoax evidence]

- **Resolve as Strong NO (Outcome D)** if:
  - [Criteria for Strong NO]
  - OR [Evidence of fakery]
  - OR [Deliberate fraud]
```

### Outcome Definitions

1. **STRONG YES (Outcome A)**
   - Event fully happens
   - Clear, dramatic, total fulfillment
   - Multiple confirmations
   - Technical proof
   - Example: "The Archive Sigma documents are fully released without redaction, confirming every major rumor."

2. **WEAK YES (Outcome B)**
   - Event partially happens
   - Yes, but incomplete, limited, or softened
   - Ambiguous results requiring interpretation
   - Example: "A partial release occurs; only non-sensitive data is published. The core rumors are neither confirmed nor disproven."

3. **WEAK NO (Outcome C)**
   - Event doesn't happen, but leaves room for later
   - A "no for now," with ambiguity or delay
   - Attempted but failed
   - Example: "The vote is postponed after last-minute objections. Officials promise a future release, but no timeline is given."

4. **STRONG NO (Outcome D)**
   - Event fully collapses
   - Definitive closure in the opposite direction
   - Exposed as hoax/fraud
   - Example: "All documents remain sealed permanently. Officials classify the archive under national security protocols. Rumors are debunked."

### Scoring System

Each post/event receives a score (1-100) that contributes to outcome determination:

- **67-100**: Strong YES indicators → Outcome A (Strong YES)
- **50-66**: Weak YES indicators → Outcome B (Weak YES)
- **34-49**: Weak NO indicators → Outcome C (Weak NO)
- **1-33**: Strong NO indicators → Outcome D (Strong NO)

**Key Scoring Principles:**
- Technical confirmations from experts = high scores (67-100)
- Insider leaks with evidence = high scores (67-100)
- Generic corporate responses = medium scores (34-66)
- Expert dismissals = low scores (1-33)
- Hoax evidence = very low scores (1-33)

---

## GENERIC CHARACTER & COMPANY SETS

To keep everything safe, consistent, and avoid real-world references, use these generic sets:

### Generic Characters

- Tech Founder
- AI Lab Director
- Robotics CEO
- Government Regulator
- National Security Advisor
- Technology Reporter
- Data Scientist
- Venture Capital Executive
- Start-up Engineer
- Investigative Journalist
- AI Safety Researcher
- Investment Analyst
- Market Commentator
- Privacy Activist
- Crypto Trader
- Biohacker
- Philosopher
- Academic Commentator
- Media Personality
- News Anchor

### Generic Companies

- Global AI Lab
- NextGen Robotics Corp
- Quantum Systems Inc
- Unified Cloud Services
- OmniCompute Research
- FutureVision Analytics
- Northern Biotech Group
- DeepSignal Systems
- Colossal-AIsciences

### Generic Regions/Governments

- Northern Coalition
- Pacific Alliance
- Central Federation
- Eastern Bloc
- Western Union

**Important:** Never reference real people, real companies, or real events. Always use generic names from these sets.

---

## MARKET QUESTION REQUIREMENTS

The primary prediction market question must be:

- **Clear and specific** (not vague like "will X be more than Y?")
- **Binary resolvable** (can be definitively answered YES or NO)
- **Time-bound** (resolution happens at a specific point)
- **Measurable** (clear criteria for what counts as YES/NO)

**Example (Good):**
- "Will [entity] successfully [specific action] by [deadline]?"

**Example (Bad):**
- "Will [entity] be more than 'just X'?" (too vague)

---

## STORY GENERATION CHECKLIST

### Pre-Generation
- [ ] Choose unique `[story-key]` identifier
- [ ] Define clear, specific market question
- [ ] Determine time unit (hours vs days) and total duration
- [ ] Plan 4 possible outcomes (2 YES, 2 NO)
- [ ] Create initial trigger event
- [ ] Select relevant generic characters and companies

### Timeline Generation
- [ ] Time Unit 0: Trigger event + initial character reactions
- [ ] Time Units 1-3: Early clues + technical analysis
- [ ] Time Units 4-6: Major leaks + character reactions
- [ ] Time Units 7-9: Final build-up + market frenzy
- [ ] Final Time Unit: Resolution moment setup

### Content Generation
- [ ] Public feed posts from generic characters (3-5 per time unit)
- [ ] Anonymous DM leaks (1-3 per time unit from Time Unit 1+)
- [ ] Group chat discussions (optional, for Time Units 3, 5, 8)
- [ ] Visual evidence descriptions (photos, documents, spectrograms)
- [ ] Conflicting perspectives (not all characters agree)

### Alternative Content Generation
- [ ] 3-5 feed post variants per time unit
- [ ] 2-3 DM leak variants per time unit
- [ ] Mix of ambiguous, alarming, and misleading variants

### Endings Generation
- [ ] Outcome A: Strong YES with 2-3 variants
- [ ] Outcome B: Weak YES with 2-3 variants
- [ ] Outcome C: Weak NO with 2-3 variants
- [ ] Outcome D: Strong NO with 2-3 variants
- [ ] Character reactions for each outcome
- [ ] Market resolution rules

### Quality Control
- [ ] Each post has realistic, non-repetitive content
- [ ] Character voices are distinct and consistent
- [ ] Timeline builds narrative tension
- [ ] Multiple perspectives create uncertainty
- [ ] DM leaks feel authentic (anonymous accounts, technical details)
- [ ] All 4 endings are plausible and well-developed
- [ ] No real-world person/company references
- [ ] Scores assigned to all posts/events

---

## EXAMPLE STORY STRUCTURE

```
archive-sigma__timeline.md
├── Day 0 – The Trigger
│   ├── Event: National Research Council announcement
│   ├── Market question appears
│   ├── 5 character reactions
│   └── 2 DM leaks
├── Day 1-3 – Early Clues
│   ├── Technical anomalies
│   ├── First insider leaks
│   └── Expert analysis
├── Day 4-6 – Escalation
│   ├── Major leaks with evidence
│   ├── Character reactions
│   └── Market positioning
├── Day 7-9 – Build-up
│   ├── Final leaks
│   ├── Official announcements
│   └── Market frenzy
└── Day 10 – Resolution Setup
    └── Pre-decision moment

archive-sigma__alternative-posts-and-leaks.md
├── Day 0 variants (3 posts, 2 leaks)
├── Day 1 variants (3 posts, 2 leaks)
└── [Continue for each day...]

archive-sigma__endings.md
├── Outcome A: Strong YES (3 variants)
├── Outcome B: Weak YES (3 variants)
├── Outcome C: Weak NO (3 variants)
└── Outcome D: Strong NO (3 variants)
```

---

## CONTENT TYPES

### Public Feed Posts
- Official announcements
- Character reactions
- Expert analysis
- Market commentary
- Memes and viral content

### Direct Messages (DMs)
- Anonymous insider leaks
- Whistleblower revelations
- Technical details from engineers
- Market insider tips
- Concerned employee reports

### Group Chat Messages
- Private discussions among experts
- Insider speculation
- Technical analysis
- Market positioning talk

### Leaks and Documents
- Blurred photos (whiteboards, documents)
- Internal emails
- Audio/video analysis
- Spectrograms, data visualizations

---

## QUALITY STANDARDS

### Post Quality
- ✅ Realistic and believable
- ✅ Non-repetitive (avoid same phrases)
- ✅ Matches character personality
- ✅ Advances narrative
- ✅ Appropriate length for character style

### Leak Quality
- ✅ Anonymous accounts feel authentic
- ✅ Technical details are plausible
- ✅ Whistleblower language is realistic
- ✅ Creates genuine uncertainty
- ✅ Advances toward resolution

### Narrative Quality
- ✅ Builds tension over time
- ✅ Multiple conflicting perspectives
- ✅ Evidence accumulates naturally
- ✅ Surprises and reveals
- ✅ Satisfying resolution

---

## REUSABILITY

This framework works for any prediction market story:
- Technology breakthroughs
- Financial events
- Political developments
- Scientific discoveries
- Entertainment milestones
- Regulatory decisions
- Market movements
- Social phenomena

Simply adapt:
- The trigger event
- Relevant generic characters (based on domain)
- Technical details (if applicable)
- Outcome criteria
- Resolution moment

The core structure, scoring system, and character integration principles remain consistent.

---

## NOTES

- **Keep it generic:** Never reference real people, real companies, or real events
- **Maintain tension:** Each time unit should advance the narrative
- **Create uncertainty:** Mix positive and negative signals throughout
- **Resolve cleanly:** All 4 endings must tie up all threads
- **Enable replayability:** Alternative posts/leaks allow different story runs
- **Stay consistent:** Use the same generic characters/companies throughout a story
