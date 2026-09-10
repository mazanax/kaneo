/**
 * Session lifetime configuration.
 *
 * Better Auth applies its own defaults when `session` is left unset
 * (`expiresIn` 7d, `updateAge` 1d, `cookieCache.maxAge` 5m). Those are
 * reasonable, but self-hosted instances have no way to shorten them without
 * patching the source, so the values are surfaced as env vars here and the
 * Better Auth defaults are kept as the fallbacks.
 */

export const DEFAULT_SESSION_EXPIRES_IN = 60 * 60 * 24 * 7;
export const DEFAULT_SESSION_UPDATE_AGE = 60 * 60 * 24;
export const DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE = 5 * 60;

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

/**
 * Accepts a plain number of seconds (`604800`) or a suffixed duration
 * (`7d`, `12h`, `30m`, `90s`). Anything unparseable falls back to `fallback`
 * with a warning rather than silently becoming `NaN` — a bad value must not
 * turn into an immediately-expiring (or never-expiring) session.
 */
export function parseDurationSeconds(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  const value = raw?.trim();
  if (!value) return fallback;

  const match = /^(\d+)\s*([smhd])?$/i.exec(value);
  if (!match) {
    console.warn(
      `${name}="${value}" is not a valid duration (expected e.g. "604800", "7d", "12h"). Falling back to ${fallback}s.`,
    );
    return fallback;
  }

  const [, amountRaw, unitRaw] = match;
  const unit = unitRaw?.toLowerCase() ?? "s";
  const multiplier = DURATION_UNITS[unit];
  if (amountRaw === undefined || multiplier === undefined) return fallback;

  const seconds = Number.parseInt(amountRaw, 10) * multiplier;

  if (!Number.isSafeInteger(seconds)) {
    console.warn(
      `${name}="${value}" is out of range. Falling back to ${fallback}s.`,
    );
    return fallback;
  }

  return seconds;
}

export type SessionLifetimeConfig = {
  expiresIn: number;
  updateAge: number;
  cookieCacheMaxAge: number;
};

/**
 * `env` is injectable so the behaviour can be tested without mutating the
 * real `process.env`.
 */
export function getSessionLifetimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): SessionLifetimeConfig {
  const expiresIn = parseDurationSeconds(
    env.SESSION_EXPIRES_IN,
    DEFAULT_SESSION_EXPIRES_IN,
    "SESSION_EXPIRES_IN",
  );

  // A zero/negative TTL would lock everyone out on the next request, so the
  // floor is one minute.
  const safeExpiresIn = expiresIn < 60 ? DEFAULT_SESSION_EXPIRES_IN : expiresIn;
  if (safeExpiresIn !== expiresIn) {
    console.warn(
      `SESSION_EXPIRES_IN=${expiresIn}s is below the 60s minimum. Falling back to ${DEFAULT_SESSION_EXPIRES_IN}s.`,
    );
  }

  const updateAge = parseDurationSeconds(
    env.SESSION_UPDATE_AGE,
    DEFAULT_SESSION_UPDATE_AGE,
    "SESSION_UPDATE_AGE",
  );

  // `updateAge` is the sliding-refresh threshold: Better Auth extends a
  // session once it is older than this. Larger than `expiresIn` means the
  // session can never be refreshed and every user is hard-logged-out on the
  // `expiresIn` boundary, which is almost never what an operator wants.
  const safeUpdateAge = Math.min(updateAge, safeExpiresIn);
  if (safeUpdateAge !== updateAge) {
    console.warn(
      `SESSION_UPDATE_AGE=${updateAge}s exceeds SESSION_EXPIRES_IN=${safeExpiresIn}s. Clamping to ${safeExpiresIn}s.`,
    );
  }

  const cookieCacheMaxAge = parseDurationSeconds(
    env.SESSION_COOKIE_CACHE_MAX_AGE,
    DEFAULT_SESSION_COOKIE_CACHE_MAX_AGE,
    "SESSION_COOKIE_CACHE_MAX_AGE",
  );

  // The cookie cache serves the session without touching the database, so it
  // also bounds how long a revoked session (sign-out elsewhere, role change,
  // deleted user) stays usable. It must never outlive the session itself.
  // Set it to 0 to disable the cache and make revocation immediate.
  const safeCookieCacheMaxAge = Math.min(cookieCacheMaxAge, safeExpiresIn);
  if (safeCookieCacheMaxAge !== cookieCacheMaxAge) {
    console.warn(
      `SESSION_COOKIE_CACHE_MAX_AGE=${cookieCacheMaxAge}s exceeds SESSION_EXPIRES_IN=${safeExpiresIn}s. Clamping to ${safeExpiresIn}s.`,
    );
  }

  return {
    expiresIn: safeExpiresIn,
    updateAge: safeUpdateAge,
    cookieCacheMaxAge: safeCookieCacheMaxAge,
  };
}
