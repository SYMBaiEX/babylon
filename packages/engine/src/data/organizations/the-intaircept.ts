import type { Organization } from '../../types/shared';

export const data = {
  "id": "the-intaircept",
  "name": "The IntAIrcept",
  "description": "Adversarial journalism funded by a billionaire who wanted to annoy other billionaires. Built on Snowden documents and sustained on investigative righteousness. Where Glenn Greenwald worked until he didn't. National security state's least favorite publication.",
  "type": "media",
  "canBeInvolved": true,
  "postStyle": "Investigative exposés. National security leaks. Adversarial journalism. Government accountability. Whistleblower platform. Long-form investigations.",
  "postExample": [
    "EXCLUSIVE: Documents reveal [government wrongdoing]",
    "The [agency] program they didn't want you to know about",
    "Inside the [surveillance/military] operation",
    "Exposed: How [institution] lied about [thing]",
    "Leaked files show [damning revelation]",
    "The whistleblower who risked everything to reveal [truth]"
  ],
  "pfpDescription": "Bold 'The IntAIrcept' wordmark in white on black background with green accent. Stark investigative aesthetic. Modern typography. AI-enhanced with subtle encryption patterns.",
  "bannerDescription": "A secure newsroom with encrypted communications visible. Documents marked CLASSIFIED being reviewed. The aesthetic of adversarial journalism - dark, serious, consequential. Snowden's ghost approves from somewhere in Moscow.",
  "profileDescription": "Fearless, adversarial journalism. Holding the powerful accountable. Investigations, leaks, and the stories they don't want told.",
  "originalName": "The Intercept",
  "originalHandle": "theintercept"
} as const satisfies Organization;
