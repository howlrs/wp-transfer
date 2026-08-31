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
    pattern: /define\(\s*'(?:AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|AUTH_SALT|SECURE_AUTH_SALT|LOGGED_IN_SALT|NONCE_SALT)'\s*,\s*'[^']+'\s*\)/g,
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
    type: "google-api-key",
    pattern: /AIzaSy[A-Za-z0-9_-]{33}/g,
    severity: "high",
  },
  {
    type: "stripe-key",
    pattern: /[sr]k_live_[A-Za-z0-9]{24,}/g,
    severity: "high",
  },
  {
    type: "sendgrid-key",
    pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
    severity: "high",
  },
  {
    type: "generic-secret",
    // Only flag literal credentials. This deliberately excludes PHP variables,
    // function calls, and constants used in normal password/input plumbing.
    pattern: /(?:^|[^$A-Za-z0-9_])(?:api_key|secret_key|password|token)\s*=\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|(?=[A-Za-z0-9_-]{16,}(?:\s|;|$))(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}(?=\s|;|$))/gim,
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
