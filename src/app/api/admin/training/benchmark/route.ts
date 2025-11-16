/**
 * Admin Training Benchmark API
 * 
 * @route POST /api/admin/training/benchmark - Benchmark model
 * @access Admin
 * 
 * @description
 * Benchmarks a trained model and optionally compares with previous best model.
 * Returns performance metrics and comparison results.
 * 
 * @openapi
 * /api/admin/training/benchmark:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Benchmark trained model
 *     description: Benchmarks model and compares with previous best (admin only)
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelId
 *             properties:
 *               modelId:
 *                 type: string
 *               compare:
 *                 type: boolean
 *                 default: true
 *               threshold:
 *                 type: number
 *                 default: 0.95
 *     responses:
 *       200:
 *         description: Benchmark completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: object
 *       400:
 *         description: Model ID required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 * 
 * @example
 * ```typescript
 * await fetch('/api/admin/training/benchmark', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${adminToken}` },
 *   body: JSON.stringify({ modelId: 'model-123' })
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { benchmarkService } from '@/lib/training/BenchmarkService';
import { logger } from '@/lib/logger';

export const maxDuration = 300; // 5 minutes for benchmarking

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, compare = true, threshold = 0.95 } = body;

    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID required' },
        { status: 400 }
      );
    }

    logger.info('Starting model benchmark', { modelId }, 'BenchmarkAPI');

    // Run benchmark
    const benchmarkResults = await benchmarkService.benchmarkModel(modelId);

    // Compare if requested
    let comparison = null;
    if (compare) {
      try {
        comparison = await benchmarkService.compareModels(modelId, threshold);
      } catch (error) {
        logger.warn('Model comparison failed', { error, modelId }, 'BenchmarkAPI');
      }
    }

    logger.info('Benchmark complete', { modelId, score: benchmarkResults.benchmarkScore }, 'BenchmarkAPI');

    return NextResponse.json({
      success: true,
      benchmark: benchmarkResults,
      comparison
    });

  } catch (error) {
    logger.error('Benchmark failed', error, 'BenchmarkAPI');
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Benchmark failed'
      },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    // Get benchmark summary
    const summary = await benchmarkService.getBenchmarkSummary();

    return NextResponse.json({
      success: true,
      summary
    });

  } catch (error) {
    logger.error('Failed to get benchmark summary', error, 'BenchmarkAPI');
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get summary'
      },
      { status: 500 }
    );
  }
}

