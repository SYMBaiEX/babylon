#!/usr/bin/env bun
/**
 * Generate Eliza character files from actors.json
 * Converts Babylon actor data to Eliza character format
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { logger } from '../src/lib/logger'
import type { ActorData, ElizaCharacter, ElizaMessageExample } from '../src/shared/types'

function convertActorToCharacter(actor: ActorData): ElizaCharacter {
  // Extract bio from description
  const bio = [
    actor.description.split('.')[0] + '.',
    `Known as ${actor.nickname} or ${actor.aliases[0] || actor.name}`,
    `Personality: ${actor.personality}`,
    `Active in: ${actor.domain.join(', ')}`
  ]

  // Generate lore from quirks and affiliations
  const lore = [
    ...actor.quirks.map(q => `Known for: ${q}`),
    actor.affiliations.length > 0
      ? `Affiliated with: ${actor.affiliations.join(', ')}`
      : 'Independent operator',
    `${actor.tier} tier influencer`,
    actor.canPostFeed ? 'Active poster' : 'Mostly observes'
  ]

  // Create message examples from post style
  const messageExamples = [
    [
      {
        user: "{{user1}}",
        content: { text: "What's your take on this?" }
      },
      {
        user: actor.name,
        content: { text: actor.postExample[0] || "Interesting question..." }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "What do you think will happen?" }
      },
      {
        user: actor.name,
        content: { text: actor.postExample[1] || actor.postExample[0] || "Hard to say..." }
      }
    ]
  ]

  // Extract adjectives from personality
  const personalityWords = actor.personality.split(' ')
  const adjectives = [
    ...personalityWords,
    ...actor.quirks.slice(0, 3).map(q => q.split(' ')[0].toLowerCase()),
    actor.canPostFeed ? 'vocal' : 'reserved'
  ]

  // Parse post style
  const styleLines = actor.postStyle.split('. ').filter(s => s.length > 0)

  return {
    name: actor.name,
    username: actor.username,
    bio,
    lore,
    messageExamples,
    postExamples: actor.postExample.slice(0, 5),
    topics: actor.domain,
    adjectives: adjectives.filter((v, i, a) => a.indexOf(v) === i), // unique
    style: {
      all: styleLines.slice(0, 5),
      chat: [
        "stays in character",
        "references their background",
        "uses their signature style"
      ],
      post: [
        "maintains consistent voice",
        "engages with domain expertise",
        "reflects personality traits"
      ]
    },
    clients: ["babylon"],
    plugins: ["babylon"],
    modelProvider: "openai",
    settings: {
      secrets: {
        "OPENAI_API_KEY": "required - OpenAI API key for model provider",
        "BABYLON_AGENT_ID": `optional - Agent identifier (default: babylon-agent-${actor.id})`,
        "BABYLON_AGENT_SECRET": "optional - Agent secret for authentication (enables trading)",
        "BABYLON_API_URL": "optional - API base URL (default: http://localhost:3000)"
      },
      voice: {
        model: "en_US-hfc_male-medium"
      },
      strategies: actor.domain.includes('crypto') || actor.domain.includes('tech')
        ? ["technical-analysis", "trend-following"]
        : ["fundamental-analysis", "sentiment-trading"],
      riskTolerance: actor.tier === 'S_TIER' ? 0.7 : actor.tier === 'A_TIER' ? 0.6 : 0.5,
      minConfidence: 0.6,
      autoTrading: false
    }
  }
}

async function main() {
  logger.info('Generating Eliza character files from actors.json...', undefined, 'Script');

  // Read actors.json
  const actorsPath = join(process.cwd(), 'data', 'actors.json')
  const actorsData = JSON.parse(readFileSync(actorsPath, 'utf-8'))
  const actors: Actor[] = actorsData.actors

  // Create output directory
  const outputDir = join(process.cwd(), 'src', 'eliza', 'characters')
  mkdirSync(outputDir, { recursive: true })

  // Generate first 29 character files (alice-trader.json already exists)
  const actorsToConvert = actors.slice(0, 29)

  logger.info(`Converting ${actorsToConvert.length} actors to Eliza character files...`, undefined, 'Script');

  let successCount = 0
  let errorCount = 0

  for (const actor of actorsToConvert) {
    try {
      const character = convertActorToCharacter(actor)
      const filename = `${actor.id}.json`
      const filepath = join(outputDir, filename)

      writeFileSync(filepath, JSON.stringify(character, null, 2) + '\n')
      logger.info(`Created: ${filename}`, undefined, 'Script');
      successCount++
    } catch (error) {
      logger.error(`Failed to create ${actor.id}.json:`, error, 'Script');
      errorCount++
    }
  }

  logger.info('Summary:', {
    success: successCount,
    errors: errorCount,
    output: outputDir
  }, 'Script');
}

main().catch(error => {
  logger.error('Error:', error, 'Script');
  process.exit(1);
})
