import { readFileSync } from "node:fs";

/**
 * Safe local env loader.
 *
 * Reads a dotenv-style file as DATA (never executes it as a shell script).
 * Only `KEY=VALUE` lines are parsed; comments, blank lines and malformed lines
 * are ignored. Existing `process.env` values are not overwritten. Values are
 * never logged.
 */
export function loadLocalEnv(path = ".env.local"): void {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return; // no local env file; rely on the ambient environment
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue; // not a KEY=VALUE line -> ignore
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue; // do not override ambient env
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
