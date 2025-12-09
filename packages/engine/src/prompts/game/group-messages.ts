import { definePrompt } from '../define-prompt';
import {
  ANTI_REPETITION_RULES,
  characterVoiceGuidance,
  PARODY_NAME_RULES,
} from '../shared-sections';

/**
 * Prompt for generating private group chat messages for the day.
 *
 * Creates batch private group chat messages containing insider information,
 * strategic discussions, and confidential revelations. Messages provide
 * exclusive context to group members that affects trading decisions.
 * Includes full narrative context for connected private conversations.
 *
 * Returns XML with multiple group messages.
 */
export const groupMessages = definePrompt({
  id: 'group-messages',
  version: '4.0.0',
  category: 'game',
  description: 'Generates private group chats with full character context',
  temperature: 1,
  maxTokens: 20000,
  template: `{{realityGrounding}}

The current date is {{currentDate}}. Always act as though it is the current date.

=== ALL CHARACTERS IN WORLD ===
{{characterRoster}}

=== DETAILED CHARACTER PROFILES (For voice matching) ===
{{detailedCharacterProfiles}}

=== CHARACTER RELATIONSHIPS ===
{{relationshipContext}}

=== ORGANIZATIONS ===
{{organizationRoster}}

=== COMPLETE NARRATIVE CONTEXT ===
{{richGameContext}}

=== FULL EVENT HISTORY ===
{{eventTimeline}}

=== RESOLVED QUESTIONS (Known facts) ===
{{resolvedQuestionsContext}}

=== ACTIVE QUESTIONS (What they might discuss) ===
{{activeQuestionsContext}}

=== GROUP CHAT HISTORY (Previous conversations) ===
{{previousGroupMessages}}

=== DAY {{day}} CONTEXT ===
{{fullContext}}
{{scenarioContext}}
{{questionContext}}

Today's events:
{{eventsList}}
{{recentEventContext}}

${PARODY_NAME_RULES}

${characterVoiceGuidance('groupsList')}

${ANTI_REPETITION_RULES}

=== PRIVATE GROUP CHAT REQUIREMENTS ===

PRIVATE GROUP CHATS (Day {{day}}):
Members share things they would NEVER say publicly:
- Vulnerabilities, fears, doubts
- Real insider knowledge about their companies
- Strategic planning and market manipulation
- Gossip about people outside the group
- Honest reactions vs their public persona
- SPECIFIC trading positions and intentions
- Coordination of attacks on rivals
- Insider data (revenues, deals, failures)
- What they're REALLY doing vs what they say publicly
- Reactions to resolved question outcomes
- Plotting around active questions

NARRATIVE AWARENESS:
- Reference specific events from the timeline above
- Discuss implications of resolved questions
- Strategize about active questions
- Show how relationships have evolved
- Don't repeat conversations they've already had

CONVERSATION EVOLUTION:
- Check previous group messages above
- Conversations should progress, not repeat
- Reference "remember when we discussed X" if building on past talks
- Show character relationships deepening or straining

Generate {{groupCount}} private group conversations:

{{groupsList}}

Respond with ONLY this XML:
<response>
  <groups>
    <group>
      <groupId>group-id</groupId>
      <messages>
        <message>
          <actorId>actor-id</actorId>
          <content>private message (max 200 chars, in character voice)</content>
          <referencesEvent>what event/question this relates to</referencesEvent>
        </message>
      </messages>
      <conversationTheme>what this conversation is really about</conversationTheme>
      <buildsOnPrevious>what previous conversation this continues or "new thread"</buildsOnPrevious>
    </group>
  </groups>
</response>

Return EXACTLY {{groupCount}} groups. Each must have distinct themes and advance relationships.
No other text.
`.trim(),
});
