#!/usr/bin/env tsx

/**
 * Regenerate Welcome Messages for Group Chats
 * 
 * This script regenerates the welcome messages in group chats using LLM
 * to create personalized, satirical initial messages instead of the
 * generic "Welcome to my inner circle" message.
 * 
 * Run with: npx tsx scripts/regenerate-welcome-messages.ts
 */

import { PrismaClient } from '@prisma/client'
import { BabylonLLMClient } from '../src/generator/llm/openai-client'

const prisma = new PrismaClient()
const llm = new BabylonLLMClient()

async function generateInitialMessage(
  adminName: string,
  adminDescription: string,
  chatName: string,
  chatTheme: string,
  memberNames: string[]
): Promise<string> {
  const memberNamesList = memberNames.slice(0, 5).join(', ')
  
  const prompt = `You are ${adminName}, the admin of a private group chat called "${chatName}".

YOUR CONTEXT:
- Description: ${adminDescription || 'influential figure'}
- Domain: ${chatTheme || 'general'}

GROUP MEMBERS: ${memberNamesList}

Write the first message to this group chat. It should:
1. Set the tone for insider discussions
2. Reference your shared domain/interests (${chatTheme})
3. Be 1-2 sentences, casual but strategic
4. Sound like you're bringing together powerful people for a reason
5. Match the satirical tone of the group name

Examples for tone (but make it unique):
- "Figured we should have a place to talk about what's really happening with AI before the peasants find out."
- "Welcome. Let's discuss how we're all going to profit from this crypto crash."
- "Time to coordinate our totally-not-coordinated strategy for the metaverse."

OUTPUT JSON:
{
  "message": "your initial message here"
}`

  try {
    const response = await llm.generateJSON<{ message: string }>(
      prompt,
      undefined,
      { temperature: 0.8, maxTokens: 500 }
    )
    
    return response.message || `Welcome to ${chatName}. Let's discuss what's happening in ${chatTheme}.`
  } catch (error) {
    console.warn(`Failed to generate message for ${chatName}, using fallback`)
    return `Welcome to ${chatName}. Let's discuss what's happening in ${chatTheme}.`
  }
}

async function main() {
  console.log('\n🔄 Regenerating group chat welcome messages...\n')

  // Get all group chats
  const chats = await prisma.chat.findMany({
    where: {
      isGroup: true,
      gameId: 'continuous',
    },
    include: {
      messages: {
        where: {
          id: {
            endsWith: '-welcome'
          }
        },
        take: 1,
      },
    },
  })

  if (chats.length === 0) {
    console.log('❌ No group chats found!')
    return
  }

  console.log(`Found ${chats.length} group chats\n`)

  let updated = 0
  let failed = 0
  let skipped = 0

  for (const chat of chats) {
    const welcomeMessageId = `${chat.id}-welcome`
    
    try {
      // Get admin actor info
      const welcomeMessage = chat.messages[0]
      if (!welcomeMessage) {
        console.log(`⚠️  ${chat.name}: No welcome message found, skipping`)
        skipped++
        continue
      }

      const adminId = welcomeMessage.senderId
      const admin = await prisma.actor.findUnique({
        where: { id: adminId },
        select: { name: true, description: true },
      })

      if (!admin) {
        console.log(`⚠️  ${chat.name}: Admin actor not found, skipping`)
        skipped++
        continue
      }

      // Skip if already has custom message (not the generic one)
      if (!welcomeMessage.content.includes('Welcome to my inner circle')) {
        console.log(`✓  ${chat.name}: Already has custom message, skipping`)
        skipped++
        continue
      }

      // Get member names (we'll just use the first few for context)
      const memberNames = [`${admin.name} (admin)`]

      // Generate new message
      console.log(`🎨 Generating message for: ${chat.name}`)
      const newMessage = await generateInitialMessage(
        admin.name,
        admin.description || '',
        chat.name || 'group',
        'tech', // default theme
        memberNames
      )

      // Update the message
      await prisma.message.update({
        where: { id: welcomeMessageId },
        data: { content: newMessage },
      })

      console.log(`   ✅ "${newMessage.slice(0, 70)}${newMessage.length > 70 ? '...' : ''}"\n`)
      updated++

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))

    } catch (error) {
      console.error(`   ❌ Failed to update ${chat.name}:`, error instanceof Error ? error.message : error, '\n')
      failed++
    }
  }

  console.log('\n📊 Summary:')
  console.log(`   ✅ Updated: ${updated}`)
  console.log(`   ⚠️  Skipped: ${skipped}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📁 Total: ${chats.length}\n`)
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

