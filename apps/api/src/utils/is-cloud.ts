/**
 * `env` is injectable so callers that already take an env object (and their
 * tests) can resolve cloud mode without reaching for the real `process.env`.
 */
export function isCloud(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KANEO_CLOUD === "true";
}
