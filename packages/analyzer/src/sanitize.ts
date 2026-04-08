const JS_IDENT_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

export function isValidJsIdentifier(name: string): boolean {
  return JS_IDENT_RE.test(name);
}

export function toSafeIdentifier(name: string): string {
  if (!name) return "_empty";
  let safe = name.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (/^[0-9]/.test(safe)) safe = "_" + safe;
  if (!safe) return "_empty";
  return safe;
}

export function escapeForStringLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

export function sanitizeUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
    return "";
  } catch {
    return "";
  }
}

export function sanitizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

export function isValidHostname(hostname: string): boolean {
  return HOSTNAME_RE.test(hostname) && hostname.length <= 253;
}

export function isPathSafe(filePath: string, outputDir: string): boolean {
  // Reject absolute paths that don't start with outputDir
  if (filePath.startsWith("/")) {
    const normalizedFile = normalizePath(filePath);
    const normalizedDir = normalizePath(outputDir);
    return (
      normalizedFile.startsWith(normalizedDir + "/") ||
      normalizedFile === normalizedDir
    );
  }
  // For relative paths, resolve against outputDir and check containment
  const combined = outputDir.replace(/\/+$/, "") + "/" + filePath;
  const normalizedCombined = normalizePath(combined);
  const normalizedDir = normalizePath(outputDir);
  return (
    normalizedCombined.startsWith(normalizedDir + "/") ||
    normalizedCombined === normalizedDir
  );
}

/** Collapse `.` and `..` segments without filesystem access. */
function normalizePath(p: string): string {
  const segments = p.split("/");
  const result: string[] = [];
  for (const seg of segments) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") {
      result.pop();
    } else {
      result.push(seg);
    }
  }
  return (p.startsWith("/") ? "/" : "") + result.join("/");
}
