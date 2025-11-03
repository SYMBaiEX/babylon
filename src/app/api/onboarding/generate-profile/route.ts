/**
 * API Route: /api/onboarding/generate-profile
 * Methods: GET (generate AI profile data for new users)
 */

import type { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';
import { BabylonLLMClient } from '@/generator/llm/openai-client';

interface ProfileData {
  name: string;
  username: string;
  bio: string;
}

const ADJECTIVES = [
  'cosmic', 'cyber', 'quantum', 'neon', 'digital', 'pixel', 'vapor', 'glitch',
  'turbo', 'mega', 'ultra', 'super', 'hyper', 'meta', 'proto', 'neo',
  'retro', 'techno', 'crypto', 'degen', 'based', 'chad', 'epic', 'legendary'
];

const NOUNS = [
  'trader', 'ape', 'whale', 'degen', 'hodler', 'builder', 'wizard', 'ninja',
  'viking', 'samurai', 'prophet', 'oracle', 'sage', 'sensei', 'guru', 'legend',
  'titan', 'phantom', 'shadow', 'storm', 'phoenix', 'dragon', 'lion', 'hawk'
];

/**
 * Generate a random username as fallback
 */
function generateRandomUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 9999);
  return `${adj}_${noun}${num}`;
}

/**
 * Generate a random display name
 */
function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  // Capitalize first letter of each word
  return `${adj.charAt(0).toUpperCase() + adj.slice(1)} ${noun.charAt(0).toUpperCase() + noun.slice(1)}`;
}

/**
 * Generate a random bio
 */
function generateRandomBio(): string {
  const bios = [
    "Just here for the vibes ✨",
    "Professional meme investor 📈",
    "Building in public 🛠️",
    "WAGMI 🚀",
    "Probably nothing 👀",
    "On-chain maxi ⛓️",
    "Touch grass? Never heard of it 🌱",
    "Wen moon? 🌙",
    "Diamond hands forever 💎",
    "Not financial advice 📊",
    "Here for a good time, not a long time ⏰",
    "Chaos coordinator 🎭",
    "Professional overthinking 🧠",
    "Living life on hard mode 🎮",
    "Probably online 💻",
    "Making it up as I go 🎪",
    "Main character energy 🌟",
    "Unhinged and thriving 🎢",
    "Brain full of bees 🐝",
    "Zero thoughts, head empty 🎈"
  ];
  return bios[Math.floor(Math.random() * bios.length)];
}

/**
 * GET /api/onboarding/generate-profile
 * Generate AI profile data for onboarding
 */
export async function GET(request: NextRequest) {
  try {
    // Try to generate with AI first, fall back to random if it fails
    let profileData: ProfileData;

    try {
      const llmClient = new BabylonLLMClient();
      
      const prompt = `Generate a fun, memetic profile for a new social media user in the style of crypto/tech Twitter.

Requirements:
- name: A display name (2-3 words, creative, internet culture inspired)
- username: A handle without @ (alphanumeric and underscores only, 8-15 chars)
- bio: A short, funny bio (10-50 chars, meme-worthy, relatable to internet/crypto culture)

Examples:
{
  "name": "Cyber Chad",
  "username": "cyber_chad_69",
  "bio": "WAGMI 🚀"
}

{
  "name": "Degen Wizard",
  "username": "degen_wizard",
  "bio": "Professional meme investor 📈"
}

Generate a UNIQUE profile (don't copy examples). Keep it fun and shareable!

Return ONLY a JSON object with name, username, and bio fields.`;

      profileData = await llmClient.generateJSON<ProfileData>(
        prompt,
        {
          required: ['name', 'username', 'bio'],
          properties: {
            name: { type: 'string' },
            username: { type: 'string' },
            bio: { type: 'string' },
          },
        },
        {
          temperature: 1.0, // High creativity
          maxTokens: 200,
        }
      );

      // Sanitize username - remove @ if present and ensure valid format
      profileData.username = profileData.username
        .replace(/^@/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .toLowerCase()
        .slice(0, 20);

      // Validate generated data
      if (!profileData.name || !profileData.username || !profileData.bio) {
        throw new Error('Invalid generated profile data');
      }

      if (profileData.username.length < 3) {
        throw new Error('Generated username too short');
      }

      logger.info('Generated AI profile', profileData, 'GET /api/onboarding/generate-profile');

    } catch (error) {
      logger.warn('Failed to generate AI profile, using random fallback', error, 'GET /api/onboarding/generate-profile');
      
      // Fallback to random generation
      profileData = {
        name: generateRandomName(),
        username: generateRandomUsername(),
        bio: generateRandomBio(),
      };
    }

    return successResponse(profileData);

  } catch (error) {
    logger.error('Error generating profile:', error, 'GET /api/onboarding/generate-profile');
    
    // Even if everything fails, return a basic profile
    return successResponse({
      name: generateRandomName(),
      username: generateRandomUsername(),
      bio: generateRandomBio(),
    });
  }
}

