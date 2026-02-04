import { afterEach, describe, expect, it } from 'bun:test';

import {
  getWaitlistHostnames,
  isWaitlistHostname,
} from '../../../apps/web/src/lib/host-routing';

const originalWaitlistHostnames = process.env.WAITLIST_HOSTNAMES;

afterEach(() => {
  if (originalWaitlistHostnames === undefined) {
    delete process.env.WAITLIST_HOSTNAMES;
  } else {
    process.env.WAITLIST_HOSTNAMES = originalWaitlistHostnames;
  }
});

describe('host-routing (waitlist hostnames)', () => {
  it('includes sensible defaults when env var is missing', () => {
    delete process.env.WAITLIST_HOSTNAMES;
    const hosts = getWaitlistHostnames();

    expect(hosts.has('babylon.market')).toBe(true);
    expect(hosts.has('www.babylon.market')).toBe(true);
    expect(hosts.has('staging.babylon.market')).toBe(true);
    expect(hosts.has('www.staging.babylon.market')).toBe(true);
  });

  it('parses WAITLIST_HOSTNAMES as a case-insensitive CSV', () => {
    process.env.WAITLIST_HOSTNAMES =
      'Babylon.Market, WWW.BABYLON.MARKET , staging.babylon.market';

    expect(isWaitlistHostname('babylon.market')).toBe(true);
    expect(isWaitlistHostname('www.babylon.market')).toBe(true);
    expect(isWaitlistHostname('staging.babylon.market')).toBe(true);
    expect(isWaitlistHostname('play.staging.babylon.market')).toBe(false);
  });
});
