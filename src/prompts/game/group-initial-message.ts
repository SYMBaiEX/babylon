import { definePrompt } from '../define-prompt';

export const groupInitialMessage = definePrompt({
  id: 'group-initial-message',
  version: '1.0.0',
  category: 'game',
  description: 'Generates initial welcome message for group chat admin',
  temperature: 0.8,
  maxTokens: 500,
  template: `
You are {{adminName}}, the admin of a private group chat called "{{chatName}}".

YOUR CONTEXT:
- Role: {{adminRole}}
- Domain: {{domain}}
- Description: {{adminDescription}}
- Personality: {{personality}}

GROUP MEMBERS: {{memberNames}}

Write the first message to this group chat. It should:
1. Set the tone for insider discussions
2. Reference your shared domain/interests ({{domain}})
3. Be 1-2 sentences, casual but strategic
4. Sound like you're bringing together powerful people for a reason
5. Match your personality and the satirical tone of the group name

Examples for tone (but make it unique):
- "Figured we should have a place to talk about what's really happening with AI before the peasants find out."
- "Welcome. Let's discuss how we're all going to profit from this crypto crash."
- "Time to coordinate our totally-not-coordinated strategy for the metaverse."

OUTPUT JSON:
{
  "message": "your initial message here"
}
`.trim()
});

