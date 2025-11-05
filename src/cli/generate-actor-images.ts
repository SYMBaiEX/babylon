/**
 * Generate Actor Profile Images
 * Uses fal.ai's flux schnell to generate profile pictures for actors
 */

import { fal } from "@fal-ai/client";
import { readFile, writeFile, exists } from "fs/promises";
import { join } from "path";
import { config } from "dotenv";
import { renderPrompt, actorPortrait, organizationLogo } from "@/prompts";
import { logger } from '@/lib/logger';

// Load environment variables
config();

interface Actor {
  id: string;
  name: string;
  realName?: string;
  description: string;
  domain?: string[];
  personality?: string;
}

interface Organization {
  id: string;
  name: string;
  description: string;
  type: string;
}

interface ActorsDatabase {
  version: string;
  description: string;
  actors: Actor[];
  organizations: Organization[];
}

interface FalImageResult {
  url: string;
  width: number;
  height: number;
  content_type: string;
}

interface FalResponse {
  data: {
    images: FalImageResult[];
    seed?: number;
    has_nsfw_concepts?: boolean[];
  };
}

async function fileExists(path: string): Promise<boolean> {
  return exists(path).catch(() => false);
}

/**
 * Map satirical organization names to their original company names
 * for logo parody generation
 */
function getOriginalCompanyName(satiricalName: string, orgId: string): string {
  const mappings: Record<string, string> = {
    'openlie': 'OpenAI',
    'anthropimp': 'Anthropic',
    'deepmined': 'DeepMind',
    'facehook': 'Facebook',
    'palantyrant': 'Palantir',
    'anduritalin': 'Anduril',
    'xitter': 'Twitter/X',
    'teslabot': 'Tesla',
    'spacehusk': 'SpaceX',
    'neuraljank': 'Neuraljank',
    'macrohard': 'Microsoft',
    'goolag': 'Google',
    'smamazon': 'Amazon',
    'trapple': 'Apple',
    'foxnoise': 'Fox News',
    'msdnc': 'MSNBC',
    'cnn-clickbait': 'CNN',
    'washout-post': 'Washington Post',
    'new-york-slimes': 'New York Times',
    'the-daily-liar': 'The Daily Wire',
    'microtreasury': 'MicroTreasury',
    'coinbased': 'Coinbase',
    'buy-nance': 'Binance',
    'bitfinesse': 'Bitfinex',
    'ai16z': 'AIndreessen Horowitz (a16z)',
    'y-combinator-rejects': 'Y Combinator',
    'tesla': 'Tesla',
    'us-congress': 'US Congress',
    '10-drowning-street': '10 Downing Street',
    'taxifornia': 'California',
    'grift-social': 'Grift Social',
    'parlor-trick': 'Parler',
    'gab-garbage': 'Gab',
    'sucker-carlton-tonight': 'Tucker Carlson Tonight',
    'the-joe-rogaine-experience': 'The Joe Rogan Experience',
    'infowars': 'InfoWars',
  };

  return mappings[orgId] || satiricalName;
}

async function generateActorImage(actor: Actor): Promise<string> {
  logger.info(`Generating image for ${actor.name}...`, undefined, 'CLI');

  // Extract key satirical elements from description
  const descriptionParts = actor.description.split('.').slice(0, 3).join('. ');

  // Render prompt template with variables
  const prompt = renderPrompt(actorPortrait, {
    actorName: actor.name,
    realName: actor.realName || actor.name,
    descriptionParts,
    personality: actor.personality || 'satirical'
  });
  
  const result = await fal.subscribe("fal-ai/flux/schnell", {
    input: {
      prompt,
      image_size: "square",
      num_inference_steps: 4,
      num_images: 1,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        update.logs.map((log) => log.message).forEach(msg => logger.debug(msg, undefined, 'CLI'));
      }
    },
  }) as FalResponse;

  // Validate response has images array with at least one image
  if (!result.data.images || result.data.images.length === 0) {
    throw new Error(`Fal.ai API returned no images for ${actor.name}. Response: ${JSON.stringify(result.data)}`);
  }

  const firstImage = result.data.images[0];
  if (!firstImage || !firstImage.url) {
    throw new Error(`First image missing URL for ${actor.name}. Image data: ${JSON.stringify(firstImage)}`);
  }

  const imageUrl = firstImage.url;
  logger.info(`Generated image for ${actor.name}: ${imageUrl}`, undefined, 'CLI');

  return imageUrl;
}

async function generateOrganizationImage(org: Organization): Promise<string> {
  logger.info(`Generating image for ${org.name}...`, undefined, 'CLI');

  // Get the original company name for logo parody
  const originalCompany = getOriginalCompanyName(org.name, org.id);

  // Render prompt template with variables
  const prompt = renderPrompt(organizationLogo, {
    organizationName: org.name,
    originalCompany,
    organizationType: org.type,
    organizationDescription: org.description
  });
  
  const result = await fal.subscribe("fal-ai/flux/schnell", {
    input: {
      prompt,
      image_size: "square",
      num_inference_steps: 4,
      num_images: 1,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        update.logs.map((log) => log.message).forEach(msg => logger.debug(msg, undefined, 'CLI'));
      }
    },
  }) as FalResponse;

  // Validate response has images array with at least one image
  if (!result.data.images || result.data.images.length === 0) {
    throw new Error(`Fal.ai API returned no images for ${org.name}. Response: ${JSON.stringify(result.data)}`);
  }

  const firstImage = result.data.images[0];
  if (!firstImage || !firstImage.url) {
    throw new Error(`First image missing URL for ${org.name}. Image data: ${JSON.stringify(firstImage)}`);
  }

  const imageUrl = firstImage.url;
  logger.info(`Generated image for ${org.name}: ${imageUrl}`, undefined, 'CLI');

  return imageUrl;
}

async function downloadImage(url: string, filepath: string): Promise<void> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filepath, buffer);
  logger.info(`Saved image to ${filepath}`, undefined, 'CLI');
}

async function main() {
  logger.info("Checking actor and organization images...", undefined, 'CLI');

  // Check for FAL_KEY
  if (!process.env.FAL_KEY) {
    logger.error("Error: FAL_KEY not found in environment variables", undefined, 'CLI');
    logger.error("Please add FAL_KEY to your .env file", undefined, 'CLI');
    process.exit(1);
  }

  // Configure fal.ai client
  fal.config({
    credentials: process.env.FAL_KEY,
  });

  // Load actors database
  const actorsPath = join(process.cwd(), "data", "actors.json");
  const actorsData = await readFile(actorsPath, "utf-8");
  const actorsDb: ActorsDatabase = JSON.parse(actorsData);

  const actorsImagesDir = join(process.cwd(), "images", "actors");
  const orgsImagesDir = join(process.cwd(), "images", "organizations");
  
  let generatedCount = 0;
  let skippedCount = 0;

  // Generate actor images
  logger.info(`Processing ${actorsDb.actors.length} actors...`, undefined, 'CLI');
  for (const actor of actorsDb.actors) {
    const imagePath = join(actorsImagesDir, `${actor.id}.jpg`);
    
    if (await fileExists(imagePath)) {
      logger.debug(`Image already exists for ${actor.name}`, undefined, 'CLI');
      skippedCount++;
      continue;
    }

    const imageUrl = await generateActorImage(actor);
    await downloadImage(imageUrl, imagePath);
    generatedCount++;
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Generate organization images
  logger.info(`Processing ${actorsDb.organizations.length} organizations...`, undefined, 'CLI');
  for (const org of actorsDb.organizations) {
    const imagePath = join(orgsImagesDir, `${org.id}.jpg`);
    
    if (await fileExists(imagePath)) {
      logger.debug(`Image already exists for ${org.name}`, undefined, 'CLI');
      skippedCount++;
      continue;
    }

    const imageUrl = await generateOrganizationImage(org);
    await downloadImage(imageUrl, imagePath);
    generatedCount++;
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  logger.info('Complete!', {
    generated: generatedCount,
    skipped: skippedCount,
    totalActors: actorsDb.actors.length,
    totalOrganizations: actorsDb.organizations.length
  }, 'CLI');
}

main().catch(error => {
  logger.error('Error:', error, 'CLI');
  process.exit(1);
});

