import { describe, expect, it, vi } from "vitest";
import type { WpRestPostType } from "@wp-transfer/analyzer";
import {
  fetchRestPostTypeCounts,
  summarizeRestContent,
} from "../src/commands/rest-content-summary.js";

const postTypes: WpRestPostType[] = [
  { slug: "post", name: "Posts", restBase: "posts", hierarchical: false },
  { slug: "page", name: "Pages", restBase: "pages", hierarchical: true },
  { slug: "attachment", name: "Media", restBase: "media", hierarchical: false },
  {
    slug: "book",
    name: "Books",
    restBase: "library",
    restNamespace: "acme/v1",
    hierarchical: false,
  },
];

describe("REST content summary", () => {
  it("uses each REST base and continues with zero when one count request fails", async () => {
    const typesWithSlugFallback = [
      ...postTypes,
      { slug: "note", name: "Notes", hierarchical: false },
    ];
    const fetchCount = vi.fn(async (restBase: string, _restNamespace?: string) => {
      if (restBase === "library") throw new Error("not available");
      return { posts: 12, pages: 3, media: 8, note: 2 }[restBase] ?? 0;
    });
    const warn = vi.fn();

    const counts = await fetchRestPostTypeCounts(typesWithSlugFallback, fetchCount, warn);

    expect(fetchCount).toHaveBeenCalledWith("posts");
    expect(fetchCount).toHaveBeenCalledWith("pages");
    expect(fetchCount).toHaveBeenCalledWith("media");
    expect(fetchCount).toHaveBeenCalledWith("library", "acme/v1");
    expect(fetchCount).toHaveBeenCalledWith("note");
    expect(counts).toEqual(new Map([["post", 12], ["page", 3], ["attachment", 8], ["book", 0], ["note", 2]]));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('post type "book"'));
  });

  it("maps post, page, media, and custom post-type totals into schema and cost inputs", () => {
    const summary = summarizeRestContent(
      postTypes,
      new Map([["post", 12], ["page", 3], ["attachment", 8], ["book", 5]]),
    );

    expect(summary.contentSummary).toEqual({
      posts: 12,
      pages: 3,
      media: 8,
      customPostTypes: [{ slug: "book", name: "Books", count: 5 }],
    });
    expect(summary.customPostTypes).toEqual([{ slug: "book", name: "Books", count: 5 }]);
    expect(summary.postCountForEstimate).toBe(20);
  });
});
