import { describe, it, expect } from "vitest";
import { scanForSecrets, type SecretMatch } from "../src/index.js";

describe("scanForSecrets", () => {
  it("detects AWS access key", () => {
    const accessKey = ["AK", "IA", "IOSFODNN7EXAMPLE"].join("");
    const content = `AWS_ACCESS_KEY_ID=${accessKey}`;
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

  it("detects quoted literal credentials but ignores password hashing and input plumbing", () => {
    const literal = scanForSecrets('password = "literal-secret-value";');
    const plumbing = scanForSecrets(`
$password = password_hash($_POST["password"], PASSWORD_DEFAULT);
$token = $_POST["token"];
secret_key = getenv("APP_SECRET_KEY");
`);

    expect(literal.some((match) => match.type === "generic-secret")).toBe(true);
    expect(plumbing.some((match) => match.type === "generic-secret")).toBe(false);
  });

  it("detects private key blocks", () => {
    const header = ["-----BEGIN RSA ", "PRIVATE KEY-----"].join("");
    const content = `${header}
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
    const authKey = ["define(", "'AUTH_KEY'", ", 'put your unique phrase here');"].join("");
    const dbPassword = ["define(", "'DB_PASSWORD'", ", 'mysecretpassword123');"].join("");
    const content = `${authKey}
${dbPassword}`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.some((m) => m.type === "wp-auth-key")).toBe(true);
    expect(matches.some((m) => m.type === "wp-db-password")).toBe(true);
  });

  it("detects GitHub tokens", () => {
    const token = ["gh", "p_", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh1234"].join("");
    const content = `GITHUB_TOKEN=${token}`;
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
    const accessKey = ["AK", "IA", "IOSFODNN7EXAMPLE"].join("");
    const content = `SOME_API_KEY=${accessKey}`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.snippet).toBeTruthy();
    expect(matches[0]!.snippet.length).toBeGreaterThan(0);
  });

  it("detects Google API keys", () => {
    const apiKey = ["AIza", "SyA1B2C3D4E5F6G7H8I9J0KlMnOpQrStUvW"].join("");
    const content = `GOOGLE_API_KEY=${apiKey}`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.type === "google-api-key")).toBe(true);
    expect(matches.find((m) => m.type === "google-api-key")!.severity).toBe("high");
  });

  it("detects Stripe live secret keys", () => {
    // Construct dynamically to avoid GitHub push protection
    const content = `STRIPE_SECRET=${"sk" + "_live_" + "abcdefghijklmnopqrstuvwx"}`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.type === "stripe-key")).toBe(true);
    expect(matches.find((m) => m.type === "stripe-key")!.severity).toBe("high");
  });

  it("detects Stripe live restricted keys", () => {
    // Construct dynamically to avoid GitHub push protection
    const content = `STRIPE_RK=${"rk" + "_live_" + "abcdefghijklmnopqrstuvwx"}`;
    const matches = scanForSecrets(content);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.type === "stripe-key")).toBe(true);
  });

  it("detects all WP salt/key constants", () => {
    const secureAuthKey = ["define(", "'SECURE_AUTH_KEY'", ", 'some-unique-phrase');"].join("");
    const nonceSalt = ["define(", "'NONCE_SALT'", ", 'another-unique-phrase');"].join("");
    const content = `${secureAuthKey}
${nonceSalt}`;
    const matches = scanForSecrets(content);
    expect(matches.filter((m) => m.type === "wp-auth-key")).toHaveLength(2);
  });
});
