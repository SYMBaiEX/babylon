/**
 * Generate Actor Profile Images
 * Uses fal.ai's flux schnell to generate profile pictures for actors
 */

import { fal } from "@fal-ai/client";
import { readFile, writeFile, exists } from "fs/promises";
import { join } from "path";
import { config } from "dotenv";
import { loadPrompt } from "../prompts/loader.js";

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

async function generateActorImage(actor: Actor): Promise<string> {
  console.log(`Generating image for ${actor.name}...`);

  // Extract key satirical elements from description
  const descriptionParts = actor.description.split('.').slice(0, 3).join('. ');

  // Load prompt template and render with variables
  const prompt = loadPrompt('image/actor-portrait', {
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
        update.logs.map((log) => log.message).forEach(console.log);
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
  console.log(`✓ Generated image for ${actor.name}: ${imageUrl}`);

  return imageUrl;
}

async function generateOrganizationImage(org: Organization): Promise<string> {
  console.log(`Generating image for ${org.name}...`);

  // Load prompt template and render with variables
  const prompt = loadPrompt('image/organization-logo', {
    organizationName: org.name,
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
        update.logs.map((log) => log.message).forEach(console.log);
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
  console.log(`✓ Generated image for ${org.name}: ${imageUrl}`);

  return imageUrl;
}

async function downloadImage(url: string, filepath: string): Promise<void> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filepath, buffer);
  console.log(`✓ Saved image to ${filepath}`);
}

async function main() {
  console.log("🎨 Checking actor and organization images...\n");

  // Check for FAL_KEY
  if (!process.env.FAL_KEY) {
    console.error("❌ Error: FAL_KEY not found in environment variables");
    console.error("Please add FAL_KEY to your .env file");
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
  console.log(`\n📸 Processing ${actorsDb.actors.length} actors...\n`);
  for (const actor of actorsDb.actors) {
    const imagePath = join(actorsImagesDir, `${actor.id}.jpg`);
    
    if (await fileExists(imagePath)) {
      console.log(`✓ Image already exists for ${actor.name}`);
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
  console.log(`\n🏢 Processing ${actorsDb.organizations.length} organizations...\n`);
  for (const org of actorsDb.organizations) {
    const imagePath = join(orgsImagesDir, `${org.id}.jpg`);
    
    if (await fileExists(imagePath)) {
      console.log(`✓ Image already exists for ${org.name}`);
      skippedCount++;
      continue;
    }

    const imageUrl = await generateOrganizationImage(org);
    await downloadImage(imageUrl, imagePath);
    generatedCount++;
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n✓ Complete!`);
  console.log(`  - Generated: ${generatedCount}`);
  console.log(`  - Skipped (already exists): ${skippedCount}`);
  console.log(`  - Total actors: ${actorsDb.actors.length}`);
  console.log(`  - Total organizations: ${actorsDb.organizations.length}`);
}

main().catch(console.error);

