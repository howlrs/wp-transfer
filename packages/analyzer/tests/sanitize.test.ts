import { describe, it, expect } from "vitest";
import {
  isValidJsIdentifier,
  toSafeIdentifier,
  escapeForStringLiteral,
  sanitizeUrl,
  sanitizeSlug,
  isValidHostname,
  isPathSafe,
} from "../src/sanitize.js";

describe("isValidJsIdentifier", () => {
  it("accepts valid identifiers", () => {
    expect(isValidJsIdentifier("foo")).toBe(true);
    expect(isValidJsIdentifier("_bar")).toBe(true);
    expect(isValidJsIdentifier("$baz")).toBe(true);
    expect(isValidJsIdentifier("camelCase123")).toBe(true);
  });
  it("rejects invalid identifiers", () => {
    expect(isValidJsIdentifier("")).toBe(false);
    expect(isValidJsIdentifier("123abc")).toBe(false);
    expect(isValidJsIdentifier("foo-bar")).toBe(false);
    expect(isValidJsIdentifier("foo bar")).toBe(false);
    expect(isValidJsIdentifier('test"]; process.exit(1)')).toBe(false);
  });
});

describe("toSafeIdentifier", () => {
  it("preserves valid identifiers", () => {
    expect(toSafeIdentifier("price")).toBe("price");
    expect(toSafeIdentifier("_private")).toBe("_private");
  });
  it("replaces invalid characters with underscore", () => {
    expect(toSafeIdentifier("foo-bar")).toBe("foo_bar");
    expect(toSafeIdentifier("field name")).toBe("field_name");
  });
  it("prefixes if starts with digit", () => {
    expect(toSafeIdentifier("123abc")).toBe("_123abc");
  });
  it("handles malicious injection attempt", () => {
    const result = toSafeIdentifier('test"]; process.exit(1); ("x');
    expect(isValidJsIdentifier(result)).toBe(true);
    expect(result).not.toContain('"');
    expect(result).not.toContain(";");
    expect(result).not.toContain("(");
  });
  it("handles empty string", () => {
    expect(toSafeIdentifier("")).toBe("_empty");
  });
});

describe("escapeForStringLiteral", () => {
  it("escapes double quotes", () => {
    expect(escapeForStringLiteral('say "hello"')).toBe('say \\"hello\\"');
  });
  it("escapes backslashes", () => {
    expect(escapeForStringLiteral("path\\to\\file")).toBe(
      "path\\\\to\\\\file",
    );
  });
  it("escapes newlines", () => {
    expect(escapeForStringLiteral("line1\nline2")).toBe("line1\\nline2");
  });
  it("escapes template literal injection", () => {
    expect(escapeForStringLiteral("${process.exit(1)}")).toBe(
      "\\${process.exit(1)}",
    );
    expect(escapeForStringLiteral("`rm -rf /`")).toBe("\\`rm -rf /\\`");
  });
  it("handles code injection in site title", () => {
    const malicious = 'My "Blog"; import("malicious")//';
    const escaped = escapeForStringLiteral(malicious);
    // Every bare " must be escaped to \"
    expect(escaped).not.toMatch(/(?<!\\)"/);
    expect(escaped).toContain('\\"');
  });
});

describe("sanitizeUrl", () => {
  it("allows http and https URLs", () => {
    expect(sanitizeUrl("https://example.com/photo.jpg")).toBe(
      "https://example.com/photo.jpg",
    );
    expect(sanitizeUrl("http://cdn.example.com/image.png")).toBe(
      "http://cdn.example.com/image.png",
    );
  });
  it("allows relative URLs", () => {
    expect(sanitizeUrl("/images/photo.jpg")).toBe("/images/photo.jpg");
    expect(sanitizeUrl("./photo.jpg")).toBe("./photo.jpg");
  });
  it("rejects javascript: protocol", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeUrl("javascript:alert('xss')")).toBe("");
  });
  it("rejects data: protocol", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
  });
  it("rejects vbscript: protocol", () => {
    expect(sanitizeUrl("vbscript:MsgBox")).toBe("");
  });
  it("handles empty and malformed URLs", () => {
    expect(sanitizeUrl("")).toBe("");
    expect(sanitizeUrl("   ")).toBe("");
  });
  it("rejects case-varied dangerous protocols", () => {
    expect(sanitizeUrl("JAVASCRIPT:alert(1)")).toBe("");
    expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBe("");
  });
});

describe("sanitizeSlug", () => {
  it("preserves valid slugs", () => {
    expect(sanitizeSlug("hello-world")).toBe("hello-world");
    expect(sanitizeSlug("my-post-123")).toBe("my-post-123");
  });
  it("strips path traversal characters", () => {
    expect(sanitizeSlug("../../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeSlug("..%2F..%2Fetc")).toBe("2f2fetc");
  });
  it("strips special characters", () => {
    expect(sanitizeSlug('test"; rm -rf /')).toBe("testrm-rf");
  });
  it("lowercases", () => {
    expect(sanitizeSlug("Hello-World")).toBe("hello-world");
  });
});

describe("isValidHostname", () => {
  it("accepts valid hostnames", () => {
    expect(isValidHostname("example.com")).toBe(true);
    expect(isValidHostname("cdn.example.com")).toBe(true);
    expect(isValidHostname("my-site.org")).toBe(true);
  });
  it("rejects hostnames with injection", () => {
    expect(
      isValidHostname('example.com"}, {hostname: "evil.com'),
    ).toBe(false);
    expect(isValidHostname("example.com\nmalicious")).toBe(false);
  });
  it("rejects empty hostname", () => {
    expect(isValidHostname("")).toBe(false);
  });
});

describe("isPathSafe", () => {
  it("allows paths within output dir", () => {
    expect(isPathSafe("app/page.tsx", "/tmp/output")).toBe(true);
    expect(isPathSafe("lib/content.ts", "/tmp/output")).toBe(true);
  });
  it("rejects path traversal", () => {
    expect(isPathSafe("../../../etc/passwd", "/tmp/output")).toBe(false);
    expect(isPathSafe("app/../../etc/passwd", "/tmp/output")).toBe(false);
  });
  it("rejects absolute paths outside output", () => {
    expect(isPathSafe("/etc/passwd", "/tmp/output")).toBe(false);
  });
});
