# Prediction Market Story Generation Guide

## Overview

This guide provides a framework for creating engaging prediction market storylines in Babylon. Stories should feel realistic, involve multiple actors naturally, and build narrative tension through posts, leaks, and group chats over a timeline leading to a resolution.

## Core Principles

1. **Actor Integration**: Involve 30+ Babylon actors throughout the timeline, with reactions tailored to their personalities
2. **Realistic Progression**: Build from initial trigger → clues → leaks → speculation → resolution
3. **Balanced Outcomes**: Use 4-outcome system (2 YES, 2 NO) for fair market resolution
4. **Scoring System**: Each post/event contributes to outcome determination via 1-100 scoring
5. **Multiple Perspectives**: Include public posts, DMs, group chats, and leaks from various sources

## Story Structure

### Timeline Framework

Stories should follow a **10-hour timeline** (or equivalent time progression):

- **Hour 0**: The Trigger - Initial event that creates the prediction market
- **Hours 1-3**: Early Clues - First hints, technical anomalies, initial speculation
- **Hours 4-6**: Escalation - Major leaks, celebrity reactions, market positioning
- **Hours 7-9**: Build-up - Final leaks, market frenzy, announcement of resolution event
- **Hour 10**: Resolution - The decisive moment that determines the outcome

### Market Question Requirements

The primary prediction market question must be:
- **Clear and specific** (not vague like "will X be more than Y?")
- **Binary resolvable** (can be definitively answered YES or NO)
- **Time-bound** (resolution happens at a specific point)
- **Measurable** (clear criteria for what counts as YES/NO)

**Example (Good):**
- "Will [entity] successfully [specific action] by [deadline]?"

**Example (Bad):**
- "Will [entity] be more than 'just X'?" (too vague)

## Actor Integration Strategy

### Actor Selection by Hour

Distribute actors throughout the timeline based on:
- **Domain relevance** (tech CEOs react to tech stories, politicians to policy stories)
- **Personality fit** (conspiracy actors for mysterious events, investors for market-moving news)
- **Tier distribution** (S-tier actors for major moments, C-tier for niche reactions)

### Actor Reaction Guidelines

Each actor's reaction should:
- Match their **posting style** (e.g., AIlon's casual memes, ButerAIn's technical threads)
- Reflect their **domain expertise** (e.g., Jensen HuAIng on GPUs, Cashie Wood on investments)
- Include their **personality quirks** (e.g., Sundar's reboots, Jim CrAImer's BOOYAH)
- Align with their **political/cultural stance** (e.g., Trump Terminal's caps, AIOC's progressive takes)

### Actor Distribution

- **S-Tier Actors**: Major moments, high-impact reactions (Hours 0, 6, 10)
- **A-Tier Actors**: Supporting major moments, credible endorsements
- **B-Tier Actors**: Reactive roles, commentary, analysis
- **C-Tier Actors**: Niche reactions, specialized takes

## Content Types

### Public Feed Posts
- Official announcements
- Celebrity reactions
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

## Scoring System

See `scoring-system.md` for full details. Each post/event receives a score (1-100):

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

## Story Generation Checklist

### Pre-Generation
- [ ] Define clear, specific market question
- [ ] Identify 30+ relevant actors to involve
- [ ] Map actors to timeline hours based on relevance
- [ ] Plan 4 possible outcomes (2 YES, 2 NO)
- [ ] Create initial trigger event

### Timeline Generation
- [ ] Hour 0: Trigger event + initial actor reactions
- [ ] Hours 1-3: Early clues + technical analysis
- [ ] Hours 4-6: Major leaks + celebrity reactions
- [ ] Hours 7-9: Final build-up + market frenzy
- [ ] Hour 10: Resolution moment

### Content Generation
- [ ] Public feed posts from major actors
- [ ] Anonymous DM leaks (at least 2-3 per hour from Hour 2+)
- [ ] Group chat discussions (Hours 3, 5, 8)
- [ ] Visual evidence (photos, documents, spectrograms)
- [ ] Conflicting perspectives (not all actors agree)

### Quality Control
- [ ] Each post has realistic, non-repetitive content
- [ ] Actor voices are distinct and match their personalities
- [ ] Scores assigned to all posts/events
- [ ] Timeline builds narrative tension
- [ ] Multiple perspectives create uncertainty
- [ ] DM leaks feel authentic (anonymous accounts, technical details)

## Outcome Variants

Each story should have 4 outcome branches:

### Strong YES (67-100 average)
- Clear, unambiguous success
- Multiple confirmations
- High-profile validation
- Technical proof

### Weak YES (50-66 average)
- Partial success
- Ambiguous results
- Requires interpretation
- Weak but recognizable

### Weak NO (34-49 average)
- Attempted but failed
- Technical problems
- No hoax, just failure
- "Almost but not quite"

### Strong NO (1-33 average)
- Exposed as hoax/fraud
- Deliberate deception
- Complete failure
- Evidence of fakery

## Actor Personality Reference

When generating actor reactions, reference their established:
- **Posting style** (short/long, formal/casual, technical/philosophical)
- **Domain expertise** (tech, finance, politics, media, etc.)
- **Personality quirks** (specific phrases, behaviors, obsessions)
- **Political/cultural stance** (progressive, conservative, libertarian, etc.)

See `public/data/actors.json` for full actor profiles.

## Alternative Content System

Create **alternative posts/leaks** for each hour to:
- Add variety between story runs
- Provide multiple DM leak options
- Offer different actor reaction variants
- Include both public and private content

## Implementation Notes

### For Game Engine Integration
- Use timeline as base structure
- Swap in alternative posts for variety
- Calculate cumulative scores as events unfold
- Determine outcome at resolution point
- Generate actor reactions based on outcome

### For LLM Generation
- Use actor reactions as templates
- Maintain voice consistency
- Vary content while keeping personality
- Generate new DM leaks following patterns
- Create group chat discussions organically

### For Market Impact
- Connect actor reactions to price movements
- Weight high-profile actor posts more heavily
- Use DM leaks to create volatility
- Build tension through conflicting signals
- Resolve based on cumulative scoring

## Example Story Structure

```
Hour 0: [Trigger Event]
  - Public announcement/news
  - 3-5 major actor reactions
  - Market question appears
  - Scores: 30-50 (neutral/early)

Hour 1-3: [Early Clues]
  - Technical anomalies discovered
  - First anonymous DM leaks
  - Expert analysis begins
  - Group chat discussions
  - Scores: 20-70 (mixed signals)

Hour 4-6: [Escalation]
  - Major leaks with evidence
  - Celebrity reactions
  - Market positioning
  - More DM leaks
  - Scores: 40-80 (building tension)

Hour 7-9: [Build-up]
  - Final leaks before resolution
  - Market frenzy
  - Official announcements
  - Last-minute revelations
  - Scores: 30-90 (high volatility)

Hour 10: [Resolution]
  - The decisive moment
  - Outcome determined by cumulative average
  - Actor reactions to outcome
  - Market resolution
```

## Quality Standards

### Post Quality
- ✅ Realistic and believable
- ✅ Non-repetitive (avoid same phrases)
- ✅ Matches actor personality
- ✅ Advances narrative
- ✅ Appropriate length for actor style

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

## Reusability

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
- Relevant actors (based on domain)
- Technical details (if applicable)
- Outcome criteria
- Resolution moment

The core structure, scoring system, and actor integration principles remain consistent.

