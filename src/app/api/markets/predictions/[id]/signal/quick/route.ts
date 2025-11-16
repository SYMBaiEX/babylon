/**
 * Quick Signal API (Disabled)
 * 
 * @route GET /api/markets/predictions/[id]/signal/quick - Get quick signal (disabled)
 * @route POST /api/markets/predictions/[id]/signal/quick - Get quick signal (disabled)
 * @access Public
 * 
 * @description
 * Quick signal endpoint is currently disabled. Returns 410 Gone status.
 * 
 * @openapi
 * /api/markets/predictions/{id}/signal/quick:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get quick signal (disabled)
 *     description: Quick signal endpoint is disabled
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prediction market ID
 *     responses:
 *       410:
 *         description: Endpoint disabled
 *   post:
 *     tags:
 *       - Markets
 *     summary: Get quick signal (disabled)
 *     description: Quick signal endpoint is disabled
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prediction market ID
 *     responses:
 *       410:
 *         description: Endpoint disabled
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: 'Quick signal endpoint is disabled.' },
    { status: 410 }
  )
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return GET(req, ctx)
}

