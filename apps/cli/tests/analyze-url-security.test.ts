import { describe, expect, it, vi } from "vitest";
import { consola } from "consola";
import { analyzeFromUrl, prepareSiteUrlForConnection } from "../src/commands/analyze.js";

describe("URL analysis logging", () => {
  it("sanitizes a validated URL before it can be displayed", () => {
    expect(prepareSiteUrlForConnection("https://example.com/site?access_token=secret#fragment"))
      .toBe("https://example.com/site");
  });

  it.each([
    "https://user:secret@example.com",
    "not-a-url-with-secret",
  ])("does not log raw rejected URL input", async (unsafeUrl) => {
    const error = vi.spyOn(consola, "error").mockImplementation(() => undefined);
    const start = vi.spyOn(consola, "start").mockImplementation(() => undefined as never);
    try {
      await analyzeFromUrl(unsafeUrl, "./unused", "json");

      expect(error).toHaveBeenCalledWith(expect.not.stringContaining(unsafeUrl));
      expect(error).toHaveBeenCalledWith(expect.not.stringContaining("secret"));
      expect(start).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      start.mockRestore();
    }
  });
});
