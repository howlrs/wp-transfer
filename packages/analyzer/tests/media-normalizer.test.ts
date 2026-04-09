import { describe, it, expect } from "vitest";
import { normalizeMedia } from "../src/media-normalizer.js";
import type { WpMedia } from "@wp-transfer/core";

function makeMedia(url: string): WpMedia {
  return { id: 1, title: "img", url, mimeType: "image/jpeg" };
}

describe("normalizeMedia", () => {
  it("converts blogs.dir path to uploads/sites", () => {
    const media = [makeMedia("https://example.com/wp-content/blogs.dir/2/files/2024/01/img.jpg")];
    const result = normalizeMedia(media, 2);

    expect(result.media[0]!.url).toBe("https://example.com/wp-content/uploads/sites/2/2024/01/img.jpg");
  });

  it("preserves standard uploads path", () => {
    const media = [makeMedia("https://example.com/wp-content/uploads/2024/01/img.jpg")];
    const result = normalizeMedia(media, 1);

    expect(result.media[0]!.url).toBe("https://example.com/wp-content/uploads/2024/01/img.jpg");
  });

  it("generates remotePatterns from media domains", () => {
    const media = [
      makeMedia("https://example.com/wp-content/uploads/img.jpg"),
      makeMedia("https://cdn.example.com/wp-content/uploads/img2.jpg"),
    ];
    const result = normalizeMedia(media, 1);

    expect(result.remotePatterns).toContainEqual({ protocol: "https", hostname: "example.com" });
    expect(result.remotePatterns).toContainEqual({ protocol: "https", hostname: "cdn.example.com" });
  });

  it("deduplicates remotePatterns", () => {
    const media = [
      makeMedia("https://example.com/a.jpg"),
      makeMedia("https://example.com/b.jpg"),
    ];
    const result = normalizeMedia(media, 1);
    expect(result.remotePatterns).toHaveLength(1);
  });

  it("handles empty media array", () => {
    const result = normalizeMedia([], 1);
    expect(result.media).toHaveLength(0);
    expect(result.remotePatterns).toHaveLength(0);
  });
});
