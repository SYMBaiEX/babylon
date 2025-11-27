/**
 * Sentry Server Actions Wrapper
 *
 * Best practice: Wrap server actions with Sentry to capture errors and performance.
 * This provides better error tracking for Next.js server actions.
 *
 * Usage:
 * ```ts
 * 'use server'
 *
 * import { wrapServerActionWithSentry } from '@babylon/api/sentry/server-actions'
 *
 * export const myServerAction = wrapServerActionWithSentry(
 *   'myServerAction',
 *   async (data: MyDataType) => {
 *     // Your server action code
 *   }
 * )
 * ```
 */

/**
 * Wrap a server action with Sentry error tracking and performance monitoring
 * 
 * @sentry/nextjs is an optional dependency - if not installed, this function
 * will simply execute the action without Sentry tracking.
 */
export function wrapServerActionWithSentry<T extends unknown[], R>(
  actionName: string,
  action: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    // Dynamically import Sentry if available
    try {
      // @sentry/nextjs is an optional dependency
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Module may not be installed
      const Sentry = await import('@sentry/nextjs');
      return Sentry.startSpan(
        {
          name: `serverAction.${actionName}`,
          op: 'function.server_action',
          attributes: {
            'server.action.name': actionName,
          },
        },
        async () => {
          return await action(...args);
        }
      );
    } catch {
      // Sentry not available, execute action directly
      return await action(...args);
    }
  };
}
