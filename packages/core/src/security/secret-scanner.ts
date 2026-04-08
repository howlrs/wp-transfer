export interface SecretMatch {
  type: string;
  line: number;
  column: number;
  snippet: string;
  severity: "high" | "medium" | "low";
}

interface PatternDef {
  type: string;
  pattern: RegExp;
  severity: "high" | "medium" | "low";
}

const PATTERNS: PatternDef[] = [
  {
    type: "aws-access-key",
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: "high",
  },
  {
    type: "private-key",
    pattern: /-----BEGIN\s[\w\s]*PRIVATE KEY-----/g,
    severity: "high",
  },
  {
    type: "wp-auth-key",
    pattern: /define\(\s*'AUTH_KEY'\s*,\s*'[^']+'\s*\)/g,
    severity: "high",
  },
  {
    type: "wp-db-password",
    pattern: /define\(\s*'DB_PASSWORD'\s*,\s*'[^']+'\s*\)/g,
    severity: "high",
  },
  {
    type: "github-token",
    pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g,
    severity: "high",
  },
  {
    type: "slack-token",
    pattern: /xox[baprs]-[A-Za-z0-9\-]+/g,
    severity: "high",
  },
  {
    type: "generic-secret",
    pattern: /(?:api_key|secret_key|password|token)\s*=\s*[^\s]{8,}/gi,
    severity: "medium",
  },
];

/**
 * Scans content for potential secrets and credentials.
 * Returns an array of matches with location and severity information.
 */
export function scanForSecrets(content: string): SecretMatch[] {
  const lines = content.split("\n");
  const matches: SecretMatch[] = [];
  const seen = new Set<string>();

  for (const patternDef of PATTERNS) {
    // Reset the regex state for each pattern
    const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]!;
      let match: RegExpExecArray | null;

      // Reset regex for each line
      regex.lastIndex = 0;

      while ((match = regex.exec(line)) !== null) {
        const key = `${patternDef.type}:${lineIndex}:${match.index}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Create a snippet: show the matched portion, truncated if too long
        const snippet = match[0].length > 80
          ? match[0].substring(0, 77) + "..."
          : match[0];

        matches.push({
          type: patternDef.type,
          line: lineIndex + 1,
          column: match.index + 1,
          snippet,
          severity: patternDef.severity,
        });
      }
    }
  }

  return matches;
}
