/**
 * Training Trigger Cron
 * 
 * Runs daily to:
 * 1. Check if system is ready to train
 * 2. Trigger training if ready
 * 3. Monitor training job status
 * 
 * Triggered by Vercel Cron: 0 0 * * * (daily at midnight)
 * 
 * IMPORTANT: This triggers training but doesn't run it
 * Training runs on separate worker (Railway/GitHub Actions/CoreWeave)
 */

import { NextResponse } from 'next/server';
import { automationPipeline } from '@/lib/training/AutomationPipeline';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

/**
 * Daily training trigger
 */
export async function GET() {
  try {
    logger.info('Starting daily training trigger', undefined, 'TrainingCron');

    // 1. Check readiness
    const readiness = await automationPipeline.checkTrainingReadiness();
    
    if (!readiness.ready) {
      logger.info('System not ready to train', { 
        reason: readiness.reason,
        stats: readiness.stats
      }, 'TrainingCron');
      
      return NextResponse.json({
        success: true,
        triggered: false,
        reason: readiness.reason,
        stats: readiness.stats,
        nextCheck: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
    }

    logger.info('System ready - triggering training', readiness.stats, 'TrainingCron');

    // 2. Trigger training
    // For Vercel deployment, we can't run long training processes
    // Two options:
    
    // Option A: Trigger external training worker (Railway/Render/etc)
    const trainingWorkerUrl = process.env.TRAINING_WORKER_URL;
    
    if (trainingWorkerUrl) {
      logger.info('Triggering external training worker', { url: trainingWorkerUrl }, 'TrainingCron');
      
      const result = await automationPipeline.triggerTraining();
      
      if (!result.success) {
        return NextResponse.json({
          success: false,
          triggered: false,
          error: result.error
        }, { status: 400 });
      }
      
      // Call external worker
      try {
        const workerResponse = await fetch(`${trainingWorkerUrl}/train`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TRAINING_WORKER_SECRET || ''}`
          },
          body: JSON.stringify({
            batchId: result.jobId,
            source: 'vercel-cron'
          })
        });
        
        if (!workerResponse.ok) {
          throw new Error(`Worker returned ${workerResponse.status}`);
        }
        
        const workerData = await workerResponse.json();
        
        logger.info('Training worker accepted job', {
          batchId: result.jobId,
          workerResponse: workerData
        }, 'TrainingCron');
        
        return NextResponse.json({
          success: true,
          triggered: true,
          method: 'external_worker',
          batchId: result.jobId,
          workerStatus: workerData
        });
        
      } catch (workerError) {
        logger.error('Failed to trigger external worker', workerError, 'TrainingCron');
        
        return NextResponse.json({
          success: false,
          triggered: false,
          error: `Worker error: ${workerError instanceof Error ? workerError.message : String(workerError)}`
        }, { status: 500 });
      }
    }
    
    // Option B: Trigger GitHub Actions workflow
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO; // format: "owner/repo"
    
    if (githubToken && githubRepo) {
      logger.info('Triggering GitHub Actions workflow', { repo: githubRepo }, 'TrainingCron');
      
      const result = await automationPipeline.triggerTraining();
      
      if (!result.success) {
        return NextResponse.json({
          success: false,
          triggered: false,
          error: result.error
        }, { status: 400 });
      }
      
      try {
        const githubResponse = await fetch(
          `https://api.github.com/repos/${githubRepo}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `Bearer ${githubToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              event_type: 'trigger-training',
              client_payload: {
                batchId: result.jobId,
                source: 'vercel-cron',
                timestamp: new Date().toISOString()
              }
            })
          }
        );
        
        if (!githubResponse.ok) {
          throw new Error(`GitHub API returned ${githubResponse.status}`);
        }
        
        logger.info('GitHub Actions workflow dispatched', {
          batchId: result.jobId
        }, 'TrainingCron');
        
        return NextResponse.json({
          success: true,
          triggered: true,
          method: 'github_actions',
          batchId: result.jobId
        });
        
      } catch (githubError) {
        logger.error('Failed to trigger GitHub Actions', githubError, 'TrainingCron');
        
        return NextResponse.json({
          success: false,
          triggered: false,
          error: `GitHub Actions error: ${githubError instanceof Error ? githubError.message : String(githubError)}`
        }, { status: 500 });
      }
    }
    
    // Option C: Local spawn (development only - will timeout on Vercel)
    if (process.env.NODE_ENV === 'development' || process.env.ALLOW_LOCAL_TRAINING === 'true') {
      logger.warn('Using local training spawn (development only)', undefined, 'TrainingCron');
      
      const result = await automationPipeline.triggerTraining();
      
      return NextResponse.json({
        success: result.success,
        triggered: result.success,
        method: 'local_spawn',
        batchId: result.jobId,
        warning: 'Local spawn may timeout on Vercel - use external worker for production'
      });
    }
    
    // No training method configured
    logger.error('No training method configured', {
      hasWorkerUrl: !!trainingWorkerUrl,
      hasGithubToken: !!githubToken,
      hasGithubRepo: !!githubRepo
    }, 'TrainingCron');
    
    return NextResponse.json({
      success: false,
      triggered: false,
      error: 'No training method configured. Set TRAINING_WORKER_URL or GITHUB_TOKEN/GITHUB_REPO',
      configuration: {
        trainingWorkerUrl: !!trainingWorkerUrl,
        githubActions: !!(githubToken && githubRepo),
        localSpawn: process.env.NODE_ENV !== 'production'
      }
    }, { status: 500 });

  } catch (error) {
    logger.error('Training trigger failed', error, 'TrainingCron');
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
