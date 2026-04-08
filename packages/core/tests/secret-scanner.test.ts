import { describe, it, expect } from "vitest";
import { scanForSecrets, type SecretMatch } from "../src/index.js";

describe("scanForSecrets", () => {
  it("detects AWS access key", () => {
    const content = `AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.type === "aws-access-key")).toBe(true);
    expect(matches[0]!.severity).toBe("high");
  });

  it("detects generic API key pattern", () => {
    const content = `api_key=abcdefghij1234567890`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.type === "generic-secret")).toBe(true);
  });

  it("detects private key blocks", () => {
    const content = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF1PmMAuCK3gOaGGSfNW+Q
-----END RSA PRIVATE KEY-----`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.type === "private-key")).toBe(true);
    expect(matches[0]!.severity).toBe("high");
  });

  it("returns empty for clean content", () => {
    const content = `<h1>Hello World</h1>
<p>This is a blog post about cooking.</p>
<p>No secrets here, just plain content.</p>`;
    const matches = scanForSecrets(content);
    expect(matches).toEqual([]);
  });

  it("detects WP-specific secrets", () => {
    const content = `define('AUTH_KEY', 'put your unique phrase here');
define('DB_PASSWORD', 'mysecretpassword123');`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.some((m) => m.type === "wp-auth-key")).toBe(true);
    expect(matches.some((m) => m.type === "wp-db-password")).toBe(true);
  });

  it("detects GitHub tokens", () => {
    const content = `GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh1234`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.type === "github-token")).toBe(true);
  });

  it("detects Slack tokens", () => {
    // Construct token dynamically to avoid GitHub push protection
    const prefix = "xoxb";
    const content = `SLACK_TOKEN=${prefix}-1234567890-abcdefghijklmnop`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.type === "slack-token")).toBe(true);
  });

  it("reports correct line and column numbers", () => {
    const content = `line one
line two
api_key=supersecretvalue123`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const match = matches.find((m) => m.type === "generic-secret");
    expect(match).toBeDefined();
    expect(match!.line).toBe(3);
    expect(match!.column).toBeGreaterThan(0);
  });

  it("includes snippet in matches", () => {
    const content = `SOME_API_KEY=AKIAIOSFODNN7EXAMPLE`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.snippet).toBeTruthy();
    expect(matches[0]!.snippet.length).toBeGreaterThan(0);
  });
});
