import { describe, it, expect } from "vitest";
import {
  parseElementorData,
  convertElementorWidgets,
  extractElementorFromMeta,
} from "../src/elementor-converter.js";
import type { ElementorWidget } from "../src/elementor-converter.js";

function widget(widgetType: string, settings: Record<string, unknown> = {}): ElementorWidget {
  return { elType: "widget", widgetType, settings, elements: [] };
}

function section(children: ElementorWidget[]): ElementorWidget {
  return { elType: "section", settings: {}, elements: children };
}

function column(children: ElementorWidget[]): ElementorWidget {
  return { elType: "column", settings: {}, elements: children };
}

describe("convertElementorWidgets", () => {
  // ── heading ──

  it("converts heading with default h2", () => {
    const result = convertElementorWidgets([widget("heading", { title: "Hello" })]);
    expect(result.jsx).toHaveLength(1);
    expect(result.jsx[0]).toBe("<h2>Hello</h2>");
    expect(result.convertedCount).toBe(1);
  });

  it("converts heading with h3 header_size", () => {
    const result = convertElementorWidgets([widget("heading", { title: "Sub", header_size: "h3" })]);
    expect(result.jsx[0]).toBe("<h3>Sub</h3>");
  });

  it("falls back to h2 for invalid heading size", () => {
    const result = convertElementorWidgets([widget("heading", { title: "X", header_size: "div" })]);
    expect(result.jsx[0]).toContain("<h2>");
  });

  // ── text-editor ──

  it("converts text-editor with HTML content", () => {
    const result = convertElementorWidgets([widget("text-editor", { editor: "<p>Rich text</p>" })]);
    expect(result.jsx[0]).toContain("dangerouslySetInnerHTML");
    expect(result.jsx[0]).toContain("<p>Rich text</p>");
  });

  // ── image ──

  it("converts image with URL and alt", () => {
    const result = convertElementorWidgets([
      widget("image", { image: { url: "https://example.com/img.jpg", alt: "Photo" } }),
    ]);
    expect(result.jsx[0]).toContain('src="https://example.com/img.jpg"');
    expect(result.jsx[0]).toContain('alt="Photo"');
  });

  it("converts image-box using the same converter", () => {
    const result = convertElementorWidgets([
      widget("image-box", { image: { url: "/box.png" } }),
    ]);
    expect(result.jsx[0]).toContain("<Image");
    expect(result.jsx[0]).toContain('src="/box.png"');
  });

  // ── button ──

  it("converts button with link", () => {
    const result = convertElementorWidgets([
      widget("button", { text: "Sign Up", link: { url: "/signup" } }),
    ]);
    expect(result.jsx[0]).toContain('href="/signup"');
    expect(result.jsx[0]).toContain("Sign Up");
  });

  // ── divider ──

  it("converts divider to hr", () => {
    const result = convertElementorWidgets([widget("divider")]);
    expect(result.jsx[0]).toBe('<hr className="my-8" />');
  });

  // ── spacer ──

  it("converts spacer with custom size", () => {
    const result = convertElementorWidgets([widget("spacer", { space: { size: "100" } })]);
    expect(result.jsx[0]).toContain('height: "100px"');
  });

  it("converts spacer with default size when missing", () => {
    const result = convertElementorWidgets([widget("spacer")]);
    expect(result.jsx[0]).toContain('height: "50px"');
  });

  // ── icon-list ──

  it("converts icon-list with items", () => {
    const result = convertElementorWidgets([
      widget("icon-list", { icon_list: [{ text: "Alpha" }, { text: "Beta" }] }),
    ]);
    expect(result.jsx[0]).toContain("<ul>");
    expect(result.jsx[0]).toContain("<li>Alpha</li>");
    expect(result.jsx[0]).toContain("<li>Beta</li>");
  });

  it("converts empty icon-list to placeholder", () => {
    const result = convertElementorWidgets([widget("icon-list", { icon_list: [] })]);
    expect(result.jsx[0]).toContain("Item 1");
  });

  // ── video ──

  it("converts youtube video to iframe", () => {
    const result = convertElementorWidgets([
      widget("video", { video_type: "youtube", youtube_url: "https://youtube.com/watch?v=abc" }),
    ]);
    expect(result.jsx[0]).toContain("<iframe");
    expect(result.jsx[0]).toContain("https://youtube.com/watch?v=abc");
  });

  it("converts hosted video to video element", () => {
    const result = convertElementorWidgets([
      widget("video", { video_type: "hosted", hosted_url: { url: "/video.mp4" } }),
    ]);
    expect(result.jsx[0]).toContain("<video");
    expect(result.jsx[0]).toContain('src="/video.mp4"');
  });

  // ── guidance (unconverted widgets) ──

  it("returns specific guidance for form widget", () => {
    const result = convertElementorWidgets([widget("form")]);
    expect(result.unconverted).toHaveLength(1);
    expect(result.unconverted[0].widgetType).toBe("form");
    expect(result.unconverted[0].guidance).toContain("React Hook Form");
  });

  it("returns specific guidance for slides widget", () => {
    const result = convertElementorWidgets([widget("slides")]);
    expect(result.unconverted[0].guidance).toContain("Embla Carousel");
  });

  it("returns specific guidance for accordion widget", () => {
    const result = convertElementorWidgets([widget("accordion")]);
    expect(result.unconverted[0].guidance).toContain("Radix UI Accordion");
  });

  it("returns generic guidance for unknown widget", () => {
    const result = convertElementorWidgets([widget("my-custom-thing")]);
    expect(result.unconverted).toHaveLength(1);
    expect(result.unconverted[0].widgetType).toBe("my-custom-thing");
    expect(result.unconverted[0].guidance).toContain("manual conversion required");
  });

  // ── nested flattening ──

  it("flattens section > column > widget structure", () => {
    const tree: ElementorWidget[] = [
      section([
        column([widget("heading", { title: "A" }), widget("button", { text: "B" })]),
        column([widget("divider")]),
      ]),
    ];
    const result = convertElementorWidgets(tree);
    expect(result.totalWidgets).toBe(3);
    expect(result.convertedCount).toBe(3);
    expect(result.jsx).toHaveLength(3);
  });

  it("handles deeply nested elements", () => {
    const tree: ElementorWidget[] = [
      section([section([column([widget("heading", { title: "Deep" })])])]),
    ];
    const result = convertElementorWidgets(tree);
    expect(result.totalWidgets).toBe(1);
    expect(result.jsx[0]).toContain("Deep");
  });

  // ── conversion stats ──

  it("reports correct totals for mixed widgets", () => {
    const tree: ElementorWidget[] = [
      widget("heading", { title: "Title" }),
      widget("form"),
      widget("divider"),
      widget("unknown-xyz"),
    ];
    const result = convertElementorWidgets(tree);
    expect(result.totalWidgets).toBe(4);
    expect(result.convertedCount).toBe(2);
    expect(result.jsx).toHaveLength(2);
    expect(result.unconverted).toHaveLength(2);
  });

  it("handles empty widget array", () => {
    const result = convertElementorWidgets([]);
    expect(result.totalWidgets).toBe(0);
    expect(result.convertedCount).toBe(0);
    expect(result.jsx).toHaveLength(0);
    expect(result.unconverted).toHaveLength(0);
  });
});

describe("parseElementorData", () => {
  it("parses valid JSON array", () => {
    const data = JSON.stringify([{ elType: "widget", widgetType: "heading", settings: { title: "Hi" } }]);
    const result = parseElementorData(data);
    expect(result).toHaveLength(1);
    expect(result![0].widgetType).toBe("heading");
  });

  it("returns null for invalid JSON", () => {
    expect(parseElementorData("not json")).toBeNull();
  });

  it("returns null for non-array JSON", () => {
    expect(parseElementorData('{"key": "value"}')).toBeNull();
  });
});

describe("extractElementorFromMeta", () => {
  it("extracts from _elementor_data meta key", () => {
    const meta = {
      _elementor_data: JSON.stringify([{ elType: "widget", widgetType: "divider", settings: {} }]),
    };
    const result = extractElementorFromMeta(meta);
    expect(result).toHaveLength(1);
    expect(result![0].widgetType).toBe("divider");
  });

  it("returns null when _elementor_data is missing", () => {
    expect(extractElementorFromMeta({ other_key: "val" })).toBeNull();
  });

  it("returns null when _elementor_data is invalid JSON", () => {
    expect(extractElementorFromMeta({ _elementor_data: "broken{" })).toBeNull();
  });
});
