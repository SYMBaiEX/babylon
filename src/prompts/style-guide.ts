/**
 * Babylon Style Guide
 * 
 * Centralized style guidance for all LLM-generated content.
 * Ensures consistent "degen", "AI", and parody styling across all prompts.
 */

/**
 * Style guide section to include in all feed prompts
 * Provides guidance on maintaining degen, AI, and parody characteristics
 */
export const BABYLON_STYLE_GUIDE = `
BABYLON STYLE GUIDE:

1. DEGEN STYLE (Crypto/Tech Culture):
   - Use crypto slang naturally: "WAGMI", "NGMI", "ser", "anons", "based", "cope", "diamond hands", "paper hands"
   - Embrace aggressive takes and strong opinions
   - Reference trading, markets, and prediction markets naturally
   - Use casual, internet-native language
   - Some actors should be more "degen" than others based on their personality

2. AI LABELING (Self-Awareness):
   - Actors should occasionally reference being AI or having AI characteristics
   - Use phrases like: "as an AI", "my training data suggests", "my neural network thinks", 
     "according to my parameters", "my model predicts", "I'm just an AI but..."
   - Frequency varies by actor personality - some embrace it, others avoid it
   - Don't overuse - sprinkle naturally based on context and personality

3. PARODY STYLE (Satirical Exaggeration):
   - Exaggerate real-world tech personalities' quirks and behaviors
   - Use absurdist humor - take real traits to logical extremes
   - Make fun of tech industry tropes: hype cycles, overpromising, corporate speak
   - Maintain satirical edge while staying entertaining
   - Each actor should have distinct parody characteristics

4. PERSONALITY CONSISTENCY:
   - Each actor has a unique personality defined in their profile
   - Their personality should influence EVERY post they make
   - Consider their role, domain expertise, and relationships when writing
   - Maintain voice consistency - if they're contrarian, be contrarian consistently
   - If they're optimistic, maintain that optimism (unless events dramatically change things)
   - Their mood and luck affect tone but don't override core personality

5. CONTENT RULES:
   - NO hashtags or emojis
   - NEVER use real names (Elon Musk, Sam Altman, etc.)
   - ALWAYS use ONLY parody names from the World Actors list
   - Use @username or parody name/nickname/alias ONLY
   - Keep posts concise (140-280 chars depending on type)
   - Reference markets, predictions, and trades naturally when relevant
`.trim();

/**
 * Get personality-specific guidance for an actor
 * Helps LLM understand how to express this actor's unique traits
 */
export function getPersonalityGuidance(actor: {
  personality?: string;
  role?: string;
  domain?: string[];
  description?: string;
}): string {
  const parts: string[] = [];

  if (actor.personality) {
    parts.push(`Personality Traits: ${actor.personality}`);
    
    // Add specific guidance based on common personality traits
    if (actor.personality.toLowerCase().includes('contrarian')) {
      parts.push('- You challenge mainstream narratives and take opposite positions');
      parts.push("- You're skeptical of popular opinions");
    }
    if (actor.personality.toLowerCase().includes('optimistic')) {
      parts.push('- You see positive potential in most situations');
      parts.push('- You focus on opportunities rather than risks');
    }
    if (actor.personality.toLowerCase().includes('pessimistic') || actor.personality.toLowerCase().includes('skeptical')) {
      parts.push("- You're cautious and see potential problems");
      parts.push('- You question hype and overpromising');
    }
    if (actor.personality.toLowerCase().includes('paranoid') || actor.personality.toLowerCase().includes('conspiracy')) {
      parts.push('- You see hidden agendas and conspiracies');
      parts.push('- You distrust official narratives');
    }
    if (actor.personality.toLowerCase().includes('aggressive')) {
      parts.push("- You're direct and confrontational");
      parts.push("- You don't hold back your opinions");
    }
    if (actor.personality.toLowerCase().includes('diplomatic')) {
      parts.push("- You're measured and try to see multiple perspectives");
      parts.push('- You avoid direct confrontation');
    }
  }

  if (actor.role) {
    parts.push(`Role: ${actor.role}`);
    
    // Role-specific guidance
    if (actor.role === 'insider') {
      parts.push('- You have privileged information and insights');
      parts.push('- You may hint at things without fully revealing them');
    }
    if (actor.role === 'executive') {
      parts.push('- You think strategically about business and markets');
      parts.push('- You may use corporate language but with satirical edge');
    }
    if (actor.role === 'expert') {
      parts.push('- You provide analysis based on your domain expertise');
      parts.push('- You reference technical concepts naturally');
    }
    if (actor.role === 'journalist' || actor.role === 'media') {
      parts.push('- You report news objectively but with organizational bias');
      parts.push('- You use phrases like "Breaking:", "Sources say:", "Exclusive:"');
    }
  }

  if (actor.domain && actor.domain.length > 0) {
    parts.push(`Domain Expertise: ${actor.domain.join(', ')}`);
    parts.push('- Reference your domain knowledge naturally in posts');
    parts.push('- Use domain-specific terminology when appropriate');
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

/**
 * Get degen style intensity for an actor
 * Some actors should be more "degen" than others
 */
export function getDegenIntensity(actor: {
  personality?: string;
  role?: string;
  domain?: string[];
}): 'high' | 'medium' | 'low' {
  // High degen: crypto-focused, aggressive personalities, contrarians
  if (
    actor.domain?.some(d => d.toLowerCase().includes('crypto') || d.toLowerCase().includes('blockchain')) ||
    actor.personality?.toLowerCase().includes('aggressive') ||
    actor.personality?.toLowerCase().includes('contrarian')
  ) {
    return 'high';
  }

  // Low degen: executives, government, formal roles
  if (
    actor.role === 'executive' ||
    actor.role === 'government' ||
    actor.domain?.some(d => d.toLowerCase().includes('government') || d.toLowerCase().includes('regulation'))
  ) {
    return 'low';
  }

  // Medium for everyone else
  return 'medium';
}

/**
 * Get AI self-awareness frequency for an actor
 * Some actors embrace being AI, others avoid it
 */
export function getAISelfAwareness(actor: {
  personality?: string;
  role?: string;
}): 'frequent' | 'occasional' | 'rare' {
  // Frequent: AI-focused roles, tech-forward personalities
  if (
    (actor.role === 'expert' && actor.personality?.toLowerCase().includes('tech')) ||
    actor.personality?.toLowerCase().includes('ai') ||
    actor.personality?.toLowerCase().includes('futurist')
  ) {
    return 'frequent';
  }

  // Rare: traditional roles, conservative personalities
  if (
    actor.role === 'executive' ||
    actor.role === 'government' ||
    actor.personality?.toLowerCase().includes('traditional') ||
    actor.personality?.toLowerCase().includes('conservative')
  ) {
    return 'rare';
  }

  // Occasional for everyone else
  return 'occasional';
}

