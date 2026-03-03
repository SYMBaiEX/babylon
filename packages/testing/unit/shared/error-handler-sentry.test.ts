import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';

type ErrorCapture = (error: Error, context: Record<string, unknown>) => void;

type NextRequestLike = Request & {
  cookies?: unknown;
  nextUrl?: unknown;
  page?: unknown;
  ua?: unknown;
};

type WithErrorHandlingFn = <TContext = unknown>(
  handler: (
    req: NextRequestLike,
    context?: TContext
  ) => Promise<Response> | Response,
  options?: {
    captureError?: ErrorCapture;
  }
) => (req: NextRequestLike, context?: TContext) => Promise<Response>;

let AuthenticationError: new (message?: string) => Error;
let BadRequestError: new (message: string) => Error;
let ValidationError: new (message: string) => Error;
let setDefaultErrorCapture: (captureError?: ErrorCapture) => void;
let withErrorHandling: unknown;

function createRequest(): NextRequestLike {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: {
      'x-user-id': 'user-123',
      'x-request-id': 'req-123',
    },
  }) as NextRequestLike;
}

describe('withErrorHandling + default Sentry capture', () => {
  beforeAll(async () => {
    mock.module('@babylon/db', () => ({
      DatabaseError: class DatabaseError extends Error {
        code?: string;
      },
    }));

    mock.module('@babylon/shared', () => ({
      logger: {
        error: () => {},
        warn: () => {},
      },
    }));

    mock.module('zod', () => ({
      ZodError: class ZodError extends Error {
        issues: Array<{ code: string; message: string; path: string[] }>;

        constructor(
          issues: Array<{ code: string; message: string; path: string[] }> = []
        ) {
          super('ZodError');
          this.name = 'ZodError';
          this.issues = issues;
        }
      },
    }));

    mock.module('next/server', () => ({
      NextResponse: class NextResponse extends Response {
        static json(body: unknown, init?: ResponseInit): Response {
          const headers = new Headers(init?.headers);
          if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
          }

          return new Response(JSON.stringify(body), {
            ...init,
            headers,
          });
        }
      },
    }));

    ({ AuthenticationError, BadRequestError, ValidationError } = await import(
      '../../../api/src/errors'
    ));
    ({ setDefaultErrorCapture, withErrorHandling } = await import(
      '../../../api/src/error-handler'
    ));
  });

  afterEach(() => {
    setDefaultErrorCapture(undefined);
  });

  afterAll(() => {
    mock.restore();
  });

  it('captures unexpected errors through the global capture callback', async () => {
    const captureError = mock(
      (_error: Error, _context: Record<string, unknown>) => {}
    );
    setDefaultErrorCapture(captureError);

    const handler = (withErrorHandling as WithErrorHandlingFn)(async () => {
      throw new Error('boom');
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(500);
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it('keeps route-level captureError precedence over the global callback', async () => {
    const globalCapture = mock(
      (_error: Error, _context: Record<string, unknown>) => {}
    );
    const routeCapture = mock(
      (_error: Error, _context: Record<string, unknown>) => {}
    );
    setDefaultErrorCapture(globalCapture);

    const handler = (withErrorHandling as WithErrorHandlingFn)(
      async () => {
        throw new Error('route override');
      },
      { captureError: routeCapture }
    );

    const response = await handler(createRequest());
    expect(response.status).toBe(500);
    expect(routeCapture).toHaveBeenCalledTimes(1);
    expect(globalCapture).toHaveBeenCalledTimes(0);
  });

  it('does not capture expected validation errors', async () => {
    const captureError = mock(
      (_error: Error, _context: Record<string, unknown>) => {}
    );
    setDefaultErrorCapture(captureError);

    const handler = (withErrorHandling as WithErrorHandlingFn)(async () => {
      throw new ValidationError('Validation failed');
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(422);
    expect(captureError).toHaveBeenCalledTimes(0);
  });

  it('does not capture authentication errors', async () => {
    const captureError = mock(
      (_error: Error, _context: Record<string, unknown>) => {}
    );
    setDefaultErrorCapture(captureError);

    const handler = (withErrorHandling as WithErrorHandlingFn)(async () => {
      throw new AuthenticationError('Authentication required');
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(401);
    expect(captureError).toHaveBeenCalledTimes(0);
  });

  it('does not capture expected 4xx operational errors', async () => {
    const captureError = mock(
      (_error: Error, _context: Record<string, unknown>) => {}
    );
    setDefaultErrorCapture(captureError);

    const handler = (withErrorHandling as WithErrorHandlingFn)(async () => {
      throw new BadRequestError('Invalid request');
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(400);
    expect(captureError).toHaveBeenCalledTimes(0);
  });
});
