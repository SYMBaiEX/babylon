import { describe, expect, it } from 'vitest';
import { StaticDataRegistry } from '../../services/static-data-registry';
import {
  formatActorFinanceGuardrails,
  isDegenSpeaker,
} from '../../utils/shared-utils';

function toGuardrailsActor(actorId: string): {
  name: string;
  domain: string[];
  personality?: string;
  voice?: string;
  postStyle?: string;
  postExample?: string[];
} {
  const actor = StaticDataRegistry.getActor(actorId);
  if (!actor) {
    throw new Error(
      `Expected actor '${actorId}' to exist in StaticDataRegistry`
    );
  }
  return {
    name: actor.name,
    domain: actor.domain,
    personality: actor.personality,
    voice: actor.voice,
    postStyle: actor.postStyle,
    postExample: actor.postExample,
  };
}

describe('NPC finance/ticker guardrails', () => {
  it('classifies degens vs non-degens reasonably', () => {
    expect(isDegenSpeaker(toGuardrailsActor('ben-horowaitz'))).toBe(false);
    expect(isDegenSpeaker(toGuardrailsActor('ailon-musk'))).toBe(false);

    expect(isDegenSpeaker(toGuardrailsActor('gainzy'))).toBe(true);
    // Finance voice that naturally uses tickers should be allowed
    expect(isDegenSpeaker(toGuardrailsActor('nancy-pelosai'))).toBe(true);
  });

  it('applies finance guardrails only to non-degens', () => {
    const benRules = formatActorFinanceGuardrails(
      toGuardrailsActor('ben-horowaitz')
    );
    expect(benRules).toContain('DO NOT talk in tickers');

    const degenRules = formatActorFinanceGuardrails(
      toGuardrailsActor('gainzy')
    );
    expect(degenRules).toBe('');

    const nancyRules = formatActorFinanceGuardrails(
      toGuardrailsActor('nancy-pelosai')
    );
    expect(nancyRules).toBe('');
  });
});
