import { describe, it, expect } from "vitest";
import { classifyPlugin } from "../src/plugin-detector.js";
import type { WpRestPlugin } from "../src/rest-client.js";

function makePlugin(
  overrides: Partial<WpRestPlugin> & Pick<WpRestPlugin, "plugin" | "name">,
): WpRestPlugin {
  return {
    status: "active",
    version: "1.0.0",
    ...overrides,
  };
}

describe("classifyPlugin", () => {
  it("classifies Yoast SEO correctly (seo, template, difficulty ≤ 3)", () => {
    const result = classifyPlugin(
      makePlugin({
        plugin: "wordpress-seo/wp-seo.php",
        name: "Yoast SEO",
        version: "21.0",
      }),
    );

    expect(result.slug).toBe("wordpress-seo");
    expect(result.category).toBe("seo");
    expect(result.migrationStrategy).toBe("template");
    expect(result.difficulty).toBeLessThanOrEqual(3);
    expect(result.active).toBe(true);
  });

  it("classifies ACF correctly (custom-fields, template)", () => {
    const result = classifyPlugin(
      makePlugin({
        plugin: "advanced-custom-fields/acf.php",
        name: "Advanced Custom Fields",
        version: "6.2.0",
      }),
    );

    expect(result.slug).toBe("advanced-custom-fields");
    expect(result.category).toBe("custom-fields");
    expect(result.migrationStrategy).toBe("template");
    expect(result.active).toBe(true);
  });

  it("classifies WooCommerce as manual with high difficulty (≥ 4)", () => {
    const result = classifyPlugin(
      makePlugin({
        plugin: "woocommerce/woocommerce.php",
        name: "WooCommerce",
        version: "8.0.0",
      }),
    );

    expect(result.slug).toBe("woocommerce");
    expect(result.category).toBe("ecommerce");
    expect(result.migrationStrategy).toBe("manual");
    expect(result.difficulty).toBeGreaterThanOrEqual(4);
    expect(result.estimatedHours).toBe(120);
  });

  it("assigns llm-assisted strategy to unknown active plugins", () => {
    const result = classifyPlugin(
      makePlugin({
        plugin: "my-custom-plugin/my-custom-plugin.php",
        name: "My Custom Plugin",
        version: "0.1.0",
      }),
    );

    expect(result.slug).toBe("my-custom-plugin");
    expect(result.category).toBe("other");
    expect(result.migrationStrategy).toBe("llm-assisted");
    expect(result.difficulty).toBe(3);
    expect(result.estimatedHours).toBe(16);
    expect(result.active).toBe(true);
  });

  it("marks inactive plugins as not-needed", () => {
    const result = classifyPlugin(
      makePlugin({
        plugin: "wordpress-seo/wp-seo.php",
        name: "Yoast SEO",
        version: "21.0",
        status: "inactive",
      }),
    );

    expect(result.slug).toBe("wordpress-seo");
    expect(result.active).toBe(false);
    expect(result.migrationStrategy).toBe("not-needed");
    expect(result.estimatedHours).toBe(0);
    // Should still preserve the known category
    expect(result.category).toBe("seo");
  });

  it("handles single-file plugins without directory prefix", () => {
    const result = classifyPlugin(
      makePlugin({
        plugin: "hello.php",
        name: "Hello Dolly",
        version: "1.7.2",
        status: "inactive",
      }),
    );

    // "hello.php" → slug "hello" (not in registry as "hello-dolly")
    expect(result.slug).toBe("hello");
    expect(result.active).toBe(false);
    expect(result.migrationStrategy).toBe("not-needed");
  });
});
