/**
 * Article Image Generation Service
 *
 * Generates cover images for articles using fal.ai's Flux AI models.
 * Images are uploaded to storage and URLs are returned for database storage.
 */

import { logger } from '@babylon/shared';
import { fal } from '@fal-ai/client';
import { articleCover, renderPrompt } from '../prompts';

interface FalImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

interface FalResponse {
  data: {
    images: FalImage[];
  };
}

interface ArticleImageParams {
  title: string;
  summary: string;
  category?: string;
}

/**
 * Initialize the fal.ai client with API key
 * Should be called once at startup
 */
export function initFalClient(): boolean {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    logger.warn(
      'FAL_KEY not found - article image generation disabled',
      {},
      'ArticleImageService'
    );
    return false;
  }

  fal.config({
    credentials: falKey,
  });

  return true;
}

/**
 * Check if image generation is available
 */
export function isImageGenerationAvailable(): boolean {
  return Boolean(process.env.FAL_KEY);
}

/**
 * Generate a cover image for an article
 *
 * @param params - Article details for image generation
 * @returns URL of the generated image, or null if generation fails
 */
export async function generateArticleImage(
  params: ArticleImageParams
): Promise<string | null> {
  if (!isImageGenerationAvailable()) {
    logger.debug(
      'Skipping article image generation - FAL_KEY not available',
      { title: params.title },
      'ArticleImageService'
    );
    return null;
  }

  const prompt = renderPrompt(articleCover, {
    title: params.title,
    summary: params.summary,
    category: params.category || 'general',
  });

  logger.debug(
    'Generating article cover image',
    { title: params.title, category: params.category },
    'ArticleImageService'
  );

  const result = (await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
      image_size: 'landscape_16_9',
      num_inference_steps: 4,
      num_images: 1,
    },
    logs: false,
  })) as FalResponse;

  if (!result.data.images || result.data.images.length === 0) {
    logger.error(
      'No images returned from fal.ai',
      { title: params.title },
      'ArticleImageService'
    );
    return null;
  }

  const imageUrl = result.data.images[0]?.url;
  if (!imageUrl) {
    logger.error(
      'Image URL missing in fal.ai response',
      { title: params.title },
      'ArticleImageService'
    );
    return null;
  }

  logger.info(
    'Generated article cover image',
    { title: params.title, imageUrl },
    'ArticleImageService'
  );

  return imageUrl;
}

/**
 * Generate article image with retry logic
 *
 * @param params - Article details for image generation
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @returns URL of the generated image, or null if all retries fail
 */
export async function generateArticleImageWithRetry(
  params: ArticleImageParams,
  maxRetries = 2
): Promise<string | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const imageUrl = await generateArticleImage(params);
    if (imageUrl) {
      return imageUrl;
    }

    if (attempt < maxRetries) {
      logger.warn(
        `Article image generation attempt ${attempt + 1} failed, retrying...`,
        { title: params.title },
        'ArticleImageService'
      );
      // Wait before retry (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, attempt))
      );
    }
  }

  logger.error(
    `Failed to generate article image after ${maxRetries + 1} attempts`,
    { title: params.title },
    'ArticleImageService'
  );
  return null;
}
