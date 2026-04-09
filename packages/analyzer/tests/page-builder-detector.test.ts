import { describe, it, expect } from "vitest";
import type { WpPost } from "@wp-transfer/core";
import { detectPageBuilder } from "../src/page-builder-detector.js";

function makePost(overrides: Partial<WpPost> = {}): WpPost {
  return {
    id: 1,
    title: "Test",
    slug: "test",
    status: "publish",
    type: "page",
    content: "",
    excerpt: "",
    date: "2024-01-01",
    modified: "2024-01-01",
    author: 1,
    meta: {},
    ...overrides,
  };
}

const elementorData = JSON.stringify([
  {
    elType: "section",
    elements: [
      {
        elType: "column",
        elements: [
          { elType: "widget", widgetType: "heading", settings: {} },
          { elType: "widget", widgetType: "image", settings: {} },
          { elType: "widget", widgetType: "heading", settings: {} },
        ],
      },
    ],
  },
]);

const deepElementorData = JSON.stringify([
  {
    elType: "section",
    elements: [
      {
        elType: "column",
        elements: [
          {
            elType: "section",
            elements: [
              {
                elType: "column",
                elements: [
                  { elType: "widget", widgetType: "text-editor", settings: {} },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);

const diviContent = `[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_text]Hello world[/et_pb_text][et_pb_image src="img.jpg"][/et_pb_image][et_pb_button button_text="Click"][/et_pb_button][/et_pb_column][/et_pb_row][/et_pb_section]`;

const wpbakeryContent = `[vc_row][vc_column][vc_column_text]Some text[/vc_column_text][vc_single_image image="123"][vc_btn title="Go" link="url:http%3A//example.com"][/vc_column][/vc_row]`;

describe("detectPageBuilder", () => {
  it("returns null builder when no page builder detected", () => {
    const posts = [makePost({ content: "<p>Plain HTML content</p>" })];
    const result = detectPageBuilder(posts);
    expect(result.builder).toBeNull();
    expect(result.pageCount).toBe(0);
    expect(result.widgetUsage).toEqual({});
    expect(result.maxDepth).toBe(0);
    expect(result.migrationGuide).toBe("");
  });

  it("returns null for empty post array", () => {
    const result = detectPageBuilder([]);
    expect(result.builder).toBeNull();
    expect(result.pageCount).toBe(0);
  });

  // Elementor detection
  describe("Elementor", () => {
    it("detects Elementor from _elementor_data meta", () => {
      const posts = [
        makePost({ meta: { _elementor_data: elementorData, _elementor_edit_mode: "builder" } }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.builder).toBe("elementor");
      expect(result.pageCount).toBe(1);
    });

    it("counts widget usage correctly", () => {
      const posts = [
        makePost({ meta: { _elementor_data: elementorData } }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.widgetUsage).toEqual({ heading: 2, image: 1 });
    });

    it("counts widgets across multiple posts", () => {
      const posts = [
        makePost({ id: 1, meta: { _elementor_data: elementorData } }),
        makePost({ id: 2, meta: { _elementor_data: elementorData } }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.pageCount).toBe(2);
      expect(result.widgetUsage).toEqual({ heading: 4, image: 2 });
    });

    it("calculates max nesting depth", () => {
      const posts = [
        makePost({ meta: { _elementor_data: deepElementorData } }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.maxDepth).toBeGreaterThanOrEqual(4);
    });

    it("handles malformed _elementor_data gracefully", () => {
      const posts = [
        makePost({ meta: { _elementor_data: "not valid json" } }),
      ];
      const result = detectPageBuilder(posts);
      // Should not crash; falls through to no builder
      expect(result.builder).toBeNull();
    });

    it("generates migration guide with component mapping", () => {
      const posts = [
        makePost({ meta: { _elementor_data: elementorData } }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.migrationGuide).toContain("Elementor");
      expect(result.migrationGuide).toContain("heading");
      expect(result.migrationGuide).toContain("image");
      expect(result.migrationGuide).toContain("`<Image>`");
    });
  });

  // Divi detection
  describe("Divi", () => {
    it("detects Divi from et_pb shortcodes in content", () => {
      const posts = [makePost({ content: diviContent })];
      const result = detectPageBuilder(posts);
      expect(result.builder).toBe("divi");
      expect(result.pageCount).toBe(1);
    });

    it("counts shortcode usage correctly", () => {
      const posts = [makePost({ content: diviContent })];
      const result = detectPageBuilder(posts);
      expect(result.widgetUsage["et_pb_text"]).toBe(1);
      expect(result.widgetUsage["et_pb_image"]).toBe(1);
      expect(result.widgetUsage["et_pb_button"]).toBe(1);
      // Structural shortcodes also counted
      expect(result.widgetUsage["et_pb_section"]).toBe(1);
      expect(result.widgetUsage["et_pb_row"]).toBe(1);
      expect(result.widgetUsage["et_pb_column"]).toBe(1);
    });

    it("calculates nesting depth from shortcode structure", () => {
      const posts = [makePost({ content: diviContent })];
      const result = detectPageBuilder(posts);
      // section > row > column > text = depth 4
      expect(result.maxDepth).toBeGreaterThanOrEqual(4);
    });

    it("generates migration guide with Divi component mapping", () => {
      const posts = [makePost({ content: diviContent })];
      const result = detectPageBuilder(posts);
      expect(result.migrationGuide).toContain("Divi");
      expect(result.migrationGuide).toContain("et_pb_text");
    });
  });

  // WPBakery detection
  describe("WPBakery", () => {
    it("detects WPBakery from vc_ shortcodes in content", () => {
      const posts = [makePost({ content: wpbakeryContent })];
      const result = detectPageBuilder(posts);
      expect(result.builder).toBe("wpbakery");
      expect(result.pageCount).toBe(1);
    });

    it("counts shortcode usage correctly", () => {
      const posts = [makePost({ content: wpbakeryContent })];
      const result = detectPageBuilder(posts);
      expect(result.widgetUsage["vc_column_text"]).toBe(1);
      expect(result.widgetUsage["vc_single_image"]).toBe(1);
      expect(result.widgetUsage["vc_btn"]).toBe(1);
      expect(result.widgetUsage["vc_row"]).toBe(1);
      expect(result.widgetUsage["vc_column"]).toBe(1);
    });

    it("generates migration guide with WPBakery component mapping", () => {
      const posts = [makePost({ content: wpbakeryContent })];
      const result = detectPageBuilder(posts);
      expect(result.migrationGuide).toContain("WPBakery");
      expect(result.migrationGuide).toContain("vc_column_text");
    });
  });

  // Priority: Elementor takes precedence when both present
  describe("priority", () => {
    it("prefers Elementor over Divi shortcodes", () => {
      const posts = [
        makePost({
          content: diviContent,
          meta: { _elementor_data: elementorData },
        }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.builder).toBe("elementor");
    });
  });

  // Migration guide format
  describe("migration guide", () => {
    it("includes effort estimation", () => {
      const posts = [
        makePost({ meta: { _elementor_data: elementorData } }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.migrationGuide).toContain("Estimated migration effort");
      expect(result.migrationGuide).toContain("hours");
    });

    it("includes widget usage table", () => {
      const posts = [
        makePost({ meta: { _elementor_data: elementorData } }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.migrationGuide).toContain("Widget");
      expect(result.migrationGuide).toContain("Count");
      expect(result.migrationGuide).toContain("Suggested Next.js Component");
    });

    it("includes migration strategy section", () => {
      const posts = [
        makePost({ meta: { _elementor_data: elementorData } }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.migrationGuide).toContain("Migration Strategy");
    });

    it("includes recommended libraries section", () => {
      const posts = [
        makePost({ meta: { _elementor_data: elementorData } }),
      ];
      const result = detectPageBuilder(posts);
      expect(result.migrationGuide).toContain("Recommended Libraries");
    });
  });
});
