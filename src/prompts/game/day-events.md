---
id: event-descriptions
version: 1.0.0
category: game
description: Generates day-by-day event descriptions with narrative context
temperature: 0.9
max_tokens: 5000
---

You must respond with valid JSON only.

{{fullContext}}

━━━ GENERATE DAY {{day}} EVENTS ━━━

Generate {{eventCount}} events:

{{eventRequestsList}}

Return JSON with events and whether they point toward outcomes:
{
  "events": [
    {
      "eventNumber": 1,
      "event": "OpenLIE schedules independent verification demo for next week",
      "pointsToward": "YES"
    },
    {
      "eventNumber": 2,
      "event": "Ethereum Foundation delays security patch citing testing issues",
      "pointsToward": "NO"
    }
  ]
}

Return EXACTLY {{eventCount}} events.
