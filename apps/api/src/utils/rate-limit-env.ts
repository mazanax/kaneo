import { isCloud } from "./is-cloud";

/**
 * Rate limiting for the Better Auth endpoints (`/api/auth/*`).
 *
 * This used to be `enabled: isCloud()`, which left every self-hosted instance
 * with no limit at all on sign-in, OTP delivery and signup — including the
 * paths Better Auth itself ships stricter defaults for. It is now on by
 * default everywhere and opted out of with `DISABLE_RATE_LIMIT=true`, matching
 * the `DISABLE_*` convention used by the other auth toggles.
 *
 * Note: the limiter uses Better Auth's in-memory storage (no `secondaryStorage`
 * is configured), so counters are per-process and reset on restart. Running
 * several API replicas multiplies the effective limit by the replica count.
 */

export const DEFAULT_RATE_LIMIT_WINDOW = 10;
export const DEFAULT_RATE_LIMIT_MAX = 100;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  const value = raw?.trim();
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    console.warn(
      `${name}="${value}" is not a positive integer. Falling back to ${fallback}.`,
    );
    return fallback;
  }

  return parsed;
}

export type RateLimitConfig = {
  enabled: boolean;
  window: number;
  max: number;
  customRules: Record<string, { window: number; max: number }>;
};

export function getRateLimitConfig(
  env: NodeJS.ProcessEnv = process.env,
): RateLimitConfig {
  // Cloud always keeps the limiter on; self-hosted may opt out.
  const enabled = isCloud(env) || env.DISABLE_RATE_LIMIT !== "true";

  return {
    enabled,
    // Global fallback for any auth path without a more specific rule. Raise
    // `RATE_LIMIT_MAX` if many users share one egress IP (office NAT, VPN):
    // the bucket is keyed by IP + path, so they all share it.
    window: parsePositiveInt(
      env.RATE_LIMIT_WINDOW,
      DEFAULT_RATE_LIMIT_WINDOW,
      "RATE_LIMIT_WINDOW",
    ),
    max: parsePositiveInt(
      env.RATE_LIMIT_MAX,
      DEFAULT_RATE_LIMIT_MAX,
      "RATE_LIMIT_MAX",
    ),
    // `customRules` win over Better Auth's built-in special rules, so every
    // path listed here must be at least as strict as the built-in it shadows.
    customRules: {
      "/sign-up/email": { window: 60, max: 3 },
      "/organization/invite-member": { window: 60, max: 5 },
      // Code delivery: caps how many emails one IP can trigger.
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/magic-link": { window: 60, max: 3 },
      // Code verification. A single OTP already dies after 3 wrong attempts
      // (`allowedAttempts`), but without a limit here an attacker can request
      // a fresh code and keep guessing; this caps the guess rate itself.
      "/sign-in/email-otp": { window: 60, max: 10 },
    },
  };
}
