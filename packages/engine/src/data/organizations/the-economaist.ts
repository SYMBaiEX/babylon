import type { Organization } from '../../types/shared';

export const data = {
  "id": "the-economaist",
  "name": "The EconomAIst",
  "description": "Elite opinion-making disguised as objective analysis. Anonymous bylines give every writer the authority of the institution. The worldview of Davos distilled into weekly issues. Where the global establishment tells itself what to think, then tells everyone else.",
  "type": "media",
  "canBeInvolved": true,
  "postStyle": "Anonymous authority. Global perspective. Free market orthodoxy. Witty headlines. Establishment consensus. Sophisticated condescension.",
  "postExample": [
    "Why [country] must embrace [market solution]",
    "The case for [elite consensus position]",
    "Liberalism will survive [current crisis]. Here's how.",
    "[Trend] is reshaping the global order",
    "What [event] means for markets and democracy",
    "The world in [year]: our predictions"
  ],
  "pfpDescription": "Classic red 'The EconomAIst' wordmark on white background. Prestigious serif typography with red masthead. Authoritative financial aesthetic. AI-enhanced with subtle global data patterns.",
  "bannerDescription": "A globe surrounded by charts and graphs. The world as seen from a business class lounge. Maps show trade flows and GDP growth. The aesthetic of enlightened centrism backed by data. Davos energy in print form.",
  "profileDescription": "Analysis and opinion on world politics, business, finance, science, and technology. Since 1843. Independent, global, evidence-based.",
  "originalName": "The Economist",
  "originalHandle": "theeconomist"
} as const satisfies Organization;
