/**
 * Actors Data API
 *
 * @route GET /api/actors
 * @access Public
 *
 * @description
 * Returns all actors and organizations data from the game world. Uses the split
 * file structure loader for efficient data loading. Includes NPCs, organizations,
 * and their metadata.
 *
 * @openapi
 * /api/actors:
 *   get:
 *     tags:
 *       - Actors
 *     summary: Get all actors and organizations
 *     description: Returns complete list of all actors (NPCs) and organizations in the game world with their metadata, roles, and relationships.
 *     responses:
 *       200:
 *         description: Actors data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 actors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       role:
 *                         type: string
 *                       tier:
 *                         type: string
 *                       description:
 *                         type: string
 *                 organizations:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Failed to load actors data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *
 * @returns {Promise<NextResponse>} JSON response with actors and organizations data
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/actors');
 * const data = await response.json();
 * console.log(data.actors); // Array of all actors
 * ```
 *
 * @see {@link /lib/data/actors-loader} Actors data loader
 */

import { NextResponse } from 'next/server';
import { loadActorsData } from '@babylon/engine';

/**
 * GET /api/actors
 *
 * @description Fetches all actors and organizations data from the game world
 *
 * @returns {Promise<NextResponse>} Actors and organizations data
 */
export async function GET() {
  try {
    const actorsData = loadActorsData();
    return NextResponse.json(actorsData);
  } catch (error) {
    console.error('Error loading actors data:', error);
    return NextResponse.json(
      { error: 'Failed to load actors data' },
      { status: 500 }
    );
  }
}
