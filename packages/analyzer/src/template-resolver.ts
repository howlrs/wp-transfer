import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";

export interface ScaffoldFileInput {
  path: string;
  content: string;
}

/**
 * Resolve template content for a scaffold file.
 * If templateDir is set and contains a file at scaffoldFile.path, returns the template's content.
 * Otherwise returns the original content.
 * Rejects path traversal attempts (returns original content).
 */
export async function resolveTemplate(
  templateDir: string | undefined,
  scaffoldFile: ScaffoldFileInput,
): Promise<string> {
  if (!templateDir) return scaffoldFile.content;

  // Reject absolute scaffold paths
  if (isAbsolute(scaffoldFile.path)) return scaffoldFile.content;

  const resolvedDir = resolve(templateDir);
  const candidatePath = resolve(resolvedDir, scaffoldFile.path);

  // Path traversal protection: resolved path must be under templateDir
  const rel = relative(resolvedDir, candidatePath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return scaffoldFile.content;
  }

  if (!existsSync(candidatePath)) return scaffoldFile.content;

  return readFile(candidatePath, "utf-8");
}
