import type { ActorData } from '../../types/shared';

export const data = {
  "id": "test-trader-npc-001",
  "name": "Test Trader NPC",
  "realName": "Test Trader",
  "username": "test_trader",
  "description": "Test trader NPC",
  "profileDescription": "Test trader NPC profile",
  "domain": [],
  "tier": "B_TIER",
  "hasPool": false,
  "postStyle": "Test",
  "postExample": [],
  "personality": "Test",
  "pfpDescription": "Test trader profile picture",
  "profileBanner": "Test trader banner",
  "originalFirstName": "Test",
  "originalLastName": "Trader",
  "originalHandle": "test_trader",
  "firstName": "Test",
  "lastName": "Trader"
} as const satisfies ActorData;
