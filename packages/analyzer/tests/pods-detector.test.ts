import { describe, it, expect } from "vitest";
import { detectPods } from "../src/pods-detector.js";
import type { WpPost } from "@wp-transfer/core";

function makePost(id: number, meta: Record<string, unknown>, type = "post"): WpPost {
  return {
    id,
    title: `Post ${id}`,
    slug: `post-${id}`,
    status: "publish",
    type,
    content: "",
    excerpt: "",
    date: "",
    modified: "",
    author: 0,
    meta,
  };
}

describe("detectPods", () => {
  it("detects Pods from _pods_meta key", () => {
    const posts = [makePost(1, { _pods_meta: "some_value" })];
    const result = detectPods(posts);
    expect(result.detected).toBe(true);
    expect(result.fieldCount).toBe(1);
  });

  it("detects meta storage mode", () => {
    const posts = [makePost(1, { _pods_meta: "some_value", _pods_field_one: "val" })];
    const result = detectPods(posts);
    expect(result.detected).toBe(true);
    expect(result.storageMode).toBe("meta");
    expect(result.warning).toBeUndefined();
  });

  it("warns about table storage when detected", () => {
    const posts = [makePost(1, { _pods_meta: "storage_type:table" })];
    const result = detectPods(posts);
    expect(result.detected).toBe(true);
    expect(result.storageMode).toBe("table");
    expect(result.warning).toContain("Table Storage");
  });

  it("returns detected: false when no Pods data", () => {
    const posts = [makePost(1, { some_other_key: "value" })];
    const result = detectPods(posts);
    expect(result.detected).toBe(false);
    expect(result.fieldCount).toBe(0);
    expect(result.storageMode).toBe("unknown");
  });

  it("handles empty posts", () => {
    const result = detectPods([]);
    expect(result.detected).toBe(false);
    expect(result.podTypes).toHaveLength(0);
    expect(result.fieldCount).toBe(0);
  });

  it("collects pod content types from matching posts", () => {
    const posts = [
      makePost(1, { _pods_field_name: "val" }, "staff"),
      makePost(2, { pods_data: "val" }, "project"),
      makePost(3, { unrelated: "val" }, "post"),
    ];
    const result = detectPods(posts);
    expect(result.detected).toBe(true);
    expect(result.podTypes.sort()).toEqual(["project", "staff"]);
  });
});
