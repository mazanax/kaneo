import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE,
  DEFAULT_SESSION_EXPIRES_IN,
  DEFAULT_SESSION_UPDATE_AGE,
  getSessionLifetimeConfig,
  parseDurationSeconds,
} from "../../../apps/api/src/utils/session-env";

describe("parseDurationSeconds", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("reads plain seconds", () => {
    expect(parseDurationSeconds("604800", 1, "X")).toBe(604800);
  });

  it("reads suffixed durations", () => {
    expect(parseDurationSeconds("7d", 1, "X")).toBe(604800);
    expect(parseDurationSeconds("12h", 1, "X")).toBe(43200);
    expect(parseDurationSeconds("30m", 1, "X")).toBe(1800);
    expect(parseDurationSeconds("90s", 1, "X")).toBe(90);
    expect(parseDurationSeconds(" 7D ", 1, "X")).toBe(604800);
  });

  it("falls back on unset or unparseable values", () => {
    expect(parseDurationSeconds(undefined, 42, "X")).toBe(42);
    expect(parseDurationSeconds("", 42, "X")).toBe(42);
    expect(parseDurationSeconds("forever", 42, "X")).toBe(42);
    expect(parseDurationSeconds("7 days", 42, "X")).toBe(42);
    expect(parseDurationSeconds("-1", 42, "X")).toBe(42);
    expect(parseDurationSeconds("1.5d", 42, "X")).toBe(42);
  });
});

describe("getSessionLifetimeConfig", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("keeps the Better Auth defaults when nothing is set", () => {
    expect(getSessionLifetimeConfig({})).toEqual({
      expiresIn: DEFAULT_SESSION_EXPIRES_IN,
      updateAge: DEFAULT_SESSION_UPDATE_AGE,
      cookieCacheMaxAge: DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE,
    });
  });

  it("applies the configured lifetimes", () => {
    expect(
      getSessionLifetimeConfig({
        SESSION_EXPIRES_IN: "12h",
        SESSION_UPDATE_AGE: "1h",
        SESSION_COOKIE_CACHE_MAX_AGE: "60",
      }),
    ).toEqual({ expiresIn: 43200, updateAge: 3600, cookieCacheMaxAge: 60 });
  });

  it("allows disabling the cookie cache", () => {
    expect(
      getSessionLifetimeConfig({ SESSION_COOKIE_CACHE_MAX_AGE: "0" })
        .cookieCacheMaxAge,
    ).toBe(0);
  });

  // A sub-minute TTL would log everyone out on their next request; treat it
  // as a misconfiguration rather than honouring it.
  it("rejects a TTL below the one-minute floor", () => {
    expect(getSessionLifetimeConfig({ SESSION_EXPIRES_IN: "30" })).toEqual({
      expiresIn: DEFAULT_SESSION_EXPIRES_IN,
      updateAge: DEFAULT_SESSION_UPDATE_AGE,
      cookieCacheMaxAge: DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE,
    });
  });

  // Otherwise the session could never be refreshed and every user would be
  // hard-logged-out on the expiresIn boundary.
  it("clamps updateAge to the session TTL", () => {
    expect(
      getSessionLifetimeConfig({
        SESSION_EXPIRES_IN: "1h",
        SESSION_UPDATE_AGE: "7d",
      }).updateAge,
    ).toBe(3600);
  });

  // The cookie cache bounds how long a revoked session stays usable, so it
  // must never outlive the session.
  it("clamps the cookie cache to the session TTL", () => {
    expect(
      getSessionLifetimeConfig({
        SESSION_EXPIRES_IN: "5m",
        SESSION_COOKIE_CACHE_MAX_AGE: "1h",
      }).cookieCacheMaxAge,
    ).toBe(300);
  });
});
