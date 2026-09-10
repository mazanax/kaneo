import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW,
  getRateLimitConfig,
} from "../../../apps/api/src/utils/rate-limit-env";

describe("getRateLimitConfig", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("is on by default on self-hosted instances", () => {
    const config = getRateLimitConfig({});
    expect(config.enabled).toBe(true);
    expect(config.window).toBe(DEFAULT_RATE_LIMIT_WINDOW);
    expect(config.max).toBe(DEFAULT_RATE_LIMIT_MAX);
  });

  it("can be opted out of", () => {
    expect(getRateLimitConfig({ DISABLE_RATE_LIMIT: "true" }).enabled).toBe(
      false,
    );
  });

  it("stays on in cloud regardless of the opt-out", () => {
    expect(
      getRateLimitConfig({ KANEO_CLOUD: "true", DISABLE_RATE_LIMIT: "true" })
        .enabled,
    ).toBe(true);
  });

  it("reads the configured window and max", () => {
    const config = getRateLimitConfig({
      RATE_LIMIT_WINDOW: "60",
      RATE_LIMIT_MAX: "300",
    });
    expect(config.window).toBe(60);
    expect(config.max).toBe(300);
  });

  it("ignores non-positive or unparseable overrides", () => {
    const config = getRateLimitConfig({
      RATE_LIMIT_WINDOW: "0",
      RATE_LIMIT_MAX: "lots",
    });
    expect(config.window).toBe(DEFAULT_RATE_LIMIT_WINDOW);
    expect(config.max).toBe(DEFAULT_RATE_LIMIT_MAX);
  });

  it("caps the email sign-in code paths", () => {
    const { customRules } = getRateLimitConfig({});
    expect(customRules["/email-otp/send-verification-otp"]).toEqual({
      window: 60,
      max: 3,
    });
    expect(customRules["/sign-in/email-otp"]).toEqual({ window: 60, max: 10 });
    expect(customRules["/sign-in/magic-link"]).toEqual({ window: 60, max: 3 });
  });

  it("keeps the existing signup and invite rules", () => {
    const { customRules } = getRateLimitConfig({});
    expect(customRules["/sign-up/email"]).toEqual({ window: 60, max: 3 });
    expect(customRules["/organization/invite-member"]).toEqual({
      window: 60,
      max: 5,
    });
  });
});
