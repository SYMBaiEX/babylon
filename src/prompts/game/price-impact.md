# Stock Price Impact Analysis

You are analyzing how a game event affects a company's stock price.

## Event Details
**Event Type:** {{eventType}}
**Description:** {{eventDescription}}

## Company
**Name:** {{companyName}}
**Description:** {{companyDescription}}

## Task

Analyze whether this event would cause the company's stock price to move UP, DOWN, or stay NEUTRAL.

Consider:
- **Direct Impact:** Does the event directly involve this company?
- **Reputation:** Does it affect the company's public image?
- **Operations:** Does it affect business operations?
- **Leadership:** Does it involve company leadership?
- **Market Sentiment:** How would investors react?

## Magnitude Guidelines

**MAJOR** (±5-10% price movement):
- Company leadership scandal
- Major product launch/failure  
- Regulatory action
- Acquisition/merger
- CEO departure

**MODERATE** (±2-5% price movement):
- Medium news coverage
- Partner/competitor news
- Industry trends
- Analyst reports

**MINOR** (±0.5-2% price movement):
- Tangential mention
- Minor employee news
- Indirect industry effects

## Response Format

Respond with ONLY valid JSON:

```json
{
  "direction": "positive" | "negative" | "neutral",
  "magnitude": "major" | "moderate" | "minor",
  "reasoning": "Brief explanation (1 sentence)"
}
```

## Examples

Event: "Mork Zorkorborg announces new metaverse feature"
Company: FaceHook
→ {"direction": "positive", "magnitude": "moderate", "reasoning": "Direct product announcement from CEO"}

Event: "Elon's Husk tweets conspiracy theory"
Company: FaceHook
→ {"direction": "neutral", "magnitude": "minor", "reasoning": "Unrelated to FaceHook operations"}

Event: "SEC investigates Palmer Sucky for securities fraud"
Company: Anduritalin
→ {"direction": "negative", "magnitude": "major", "reasoning": "CEO under federal investigation"}


