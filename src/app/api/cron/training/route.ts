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

    // 2. Trigger training via GitHub Actions
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
    
    // No GitHub Actions configured
    logger.error('GitHub Actions not configured', {
      hasGithubToken: !!githubToken,
      hasGithubRepo: !!githubRepo
    }, 'TrainingCron');
    
    return NextResponse.json({
      success: false,
      triggered: false,
      error: 'GitHub Actions not configured. Set GITHUB_TOKEN and GITHUB_REPO environment variables.',
      help: {
        githubToken: 'Create a fine-grained token with workflow permissions',
        githubRepo: 'Format: "owner/repo" (e.g., "shawwalters/babylon")',
        documentation: 'See .github/workflows/rl-training.yml'
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
