import type { Route, IAgentRuntime } from '@elizaos/core';
import type { AutonomyService } from './service';

// Minimal types for express Request/Response since express types aren't installed
interface Request {
  body?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
}

interface Response {
  status: (code: number) => Response;
  json: (data: Record<string, unknown>) => Response;
  send: (data: unknown) => Response;
}

// Type guard to check if service is AutonomyService
function isAutonomyService(service: unknown): service is AutonomyService {
  return (
    typeof service === 'object' &&
    service !== null &&
    'getStatus' in service &&
    'enableAutonomy' in service &&
    typeof (service as { getStatus: unknown }).getStatus === 'function' &&
    typeof (service as { enableAutonomy: unknown }).enableAutonomy === 'function'
  );
}

/**
 * Simple API routes for controlling autonomy via settings
 */
export const autonomyRoutes: Route[] = [
  {
    path: '/autonomy/status',
    type: 'GET',
    handler: async (_req: Request, res: Response, runtime: IAgentRuntime) => {
      const autonomyService = runtime.getService('AUTONOMY') || runtime.getService('autonomy');

      if (!isAutonomyService(autonomyService)) {
        res.status(503).json({
          error: 'Autonomy service not available',
        });
        return;
      }

      const status = autonomyService.getStatus();

      res.json({
        success: true,
        data: {
          enabled: status.enabled,
          running: status.running,
          interval: status.interval,
          intervalSeconds: Math.round(status.interval / 1000),
          autonomousRoomId: status.autonomousRoomId,
          agentId: runtime.agentId,
          characterName: runtime.character?.name || 'Agent',
        },
      });
    },
  },

  {
    path: '/autonomy/enable',
    type: 'POST',
    handler: async (_req: Request, res: Response, runtime: IAgentRuntime) => {
      const autonomyService = runtime.getService('AUTONOMY') || runtime.getService('autonomy');

      if (!isAutonomyService(autonomyService)) {
        res.status(503).json({
          success: false,
          error: 'Autonomy service not available',
        });
        return;
      }

      await autonomyService.enableAutonomy();
      const status = autonomyService.getStatus();

      res.json({
        success: true,
        message: 'Autonomy enabled',
        data: {
          enabled: status.enabled,
          running: status.running,
          interval: status.interval,
        },
      });
    },
  },

  {
    path: '/autonomy/disable',
    type: 'POST',
    handler: async (_req: Request, res: Response, runtime: IAgentRuntime) => {
      const autonomyService = runtime.getService('AUTONOMY') || runtime.getService('autonomy');

      if (!isAutonomyService(autonomyService)) {
        res.status(503).json({
          success: false,
          error: 'Autonomy service not available',
        });
        return;
      }

      await autonomyService.disableAutonomy();
      const status = autonomyService.getStatus();

      res.json({
        success: true,
        message: 'Autonomy disabled',
        data: {
          enabled: status.enabled,
          running: status.running,
          interval: status.interval,
        },
      });
    },
  },

  {
    path: '/autonomy/toggle',
    type: 'POST',
    handler: async (_req: Request, res: Response, runtime: IAgentRuntime) => {
      const autonomyService = runtime.getService('AUTONOMY') || runtime.getService('autonomy');

      if (!isAutonomyService(autonomyService)) {
        res.status(503).json({
          success: false,
          error: 'Autonomy service not available',
        });
        return;
      }

      const currentStatus = autonomyService.getStatus();

      if (currentStatus.enabled) {
        await autonomyService.disableAutonomy();
      } else {
        await autonomyService.enableAutonomy();
      }

      const newStatus = autonomyService.getStatus();

      res.json({
        success: true,
        message: newStatus.enabled ? 'Autonomy enabled' : 'Autonomy disabled',
        data: {
          enabled: newStatus.enabled,
          running: newStatus.running,
          interval: newStatus.interval,
        },
      });
    },
  },

  {
    path: '/autonomy/interval',
    type: 'POST',
    handler: async (req: Request, res: Response, runtime: IAgentRuntime) => {
      const autonomyService = runtime.getService('AUTONOMY') || runtime.getService('autonomy');

      if (!isAutonomyService(autonomyService)) {
        res.status(503).json({
          success: false,
          error: 'Autonomy service not available',
        });
        return;
      }

      if (!req.body || typeof req.body !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Request body is required',
        });
        return;
      }

      const { interval } = req.body as { interval?: unknown };

      if (typeof interval !== 'number' || interval < 5000 || interval > 600000) {
        res.status(400).json({
          success: false,
          error: 'Interval must be a number between 5000ms (5s) and 600000ms (10m)',
        });
        return;
      }

      autonomyService.setLoopInterval(interval);
      const status = autonomyService.getStatus();

      res.json({
        success: true,
        message: 'Interval updated',
        data: {
          interval: status.interval,
          intervalSeconds: Math.round(status.interval / 1000),
        },
      });
    },
  },
];
