---
id: question-rankings
version: 1.0.0
category: game
description: Ranks questions by dramatic potential and entertainment value
temperature: 0.5
max_tokens: 2000
---

Rank these questions by dramatic potential and entertainment value (1 = best, {{questionCount}} = worst):

{{questionsList}}

Return JSON with ranks:
{
  "rankings": [
    { "questionId": 1, "rank": 3, "reasoning": "..." }
  ]
}
