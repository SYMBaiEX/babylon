/**
 * Prediction Market Signal API (Deprecated)
 * 
 * @route GET /api/markets/predictions/[id]/signal - Get market signal (deprecated)
 * @route POST /api/markets/predictions/[id]/signal - Submit market signal (deprecated)
 * @access Public
 * 
 * @description
 * This endpoint is deprecated and returns 410 Gone. Signal functionality has been
 * removed from the platform.
 * 
 * @openapi
 * /api/markets/predictions/{id}/signal:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get market signal (deprecated)
 *     description: This endpoint is deprecated and returns 410 Gone
 *     deprecated: true
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Market/question ID
 *     responses:
 *       410:
 *         description: Endpoint deprecated
 *   post:
 *     tags:
 *       - Markets
 *     summary: Submit market signal (deprecated)
 *     description: This endpoint is deprecated and returns 410 Gone
 *     deprecated: true
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Market/question ID
 *     responses:
 *       410:
 *         description: Endpoint deprecated
 * 
 * @deprecated This endpoint is no longer available
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: 'Signal endpoint is not available.' },
    { status: 410 }
  )
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return GET(req, ctx)
}

