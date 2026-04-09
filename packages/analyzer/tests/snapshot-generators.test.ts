import { describe, it, expect } from "vitest";
import { generateBlogScaffold } from "../src/blog-scaffold-generator.js";
import type { BlogScaffoldInput } from "../src/blog-scaffold-generator.js";
import { generateVerifyScaffold } from "../src/verify-generator.js";

function makeInput(overrides: Partial<BlogScaffoldInput> = {}): BlogScaffoldInput {
  return {
    siteTitle: "Snapshot Test Blog",
    siteUrl: "https://snapshot.example.com",
    posts: [
      { slug: "hello-world", title: "Hello World", date: "2024-01-15", categories: ["general"] },
      { slug: "second-post", title: "Second Post", date: "2024-02-20", categories: ["tech"] },
    ],
    categories: [
      { slug: "general", name: "General", count: 1 },
      { slug: "tech", name: "Tech", count: 1 },
    ],
    hasYoastSeo: true,
    hasAcfFields: false,
    mediaDomains: ["cdn.snapshot.example.com"],
    wpPermalinkStructure: "/%year%/%monthnum%/%postname%/",
    ...overrides,
  };
}

describe("Blog scaffold snapshot tests", () => {
  it("generates stable root layout", () => {
    const files = generateBlogScaffold(makeInput());
    const layout = files.find((f) => f.path === "app/layout.tsx");
    expect(layout!.content).toMatchSnapshot();
  });

  it("generates stable blog archive page", () => {
    const files = generateBlogScaffold(makeInput());
    const archive = files.find((f) => f.path === "app/blog/page.tsx");
    expect(archive!.content).toMatchSnapshot();
  });

  it("generates stable content data layer", () => {
    const files = generateBlogScaffold(makeInput());
    const content = files.find((f) => f.path === "lib/content.ts");
    expect(content!.content).toMatchSnapshot();
  });

  it("generates stable next.config.ts", () => {
    const files = generateBlogScaffold(makeInput());
    const config = files.find((f) => f.path === "next.config.ts");
    expect(config!.content).toMatchSnapshot();
  });

  it("generates stable category archive page", () => {
    const files = generateBlogScaffold(makeInput());
    const category = files.find((f) => f.path === "app/blog/category/[slug]/page.tsx");
    expect(category!.content).toMatchSnapshot();
  });
});

describe("Verify scaffold snapshot tests", () => {
  it("generates stable playwright config", () => {
    const files = generateVerifyScaffold({
      siteUrl: "https://snapshot.example.com",
      postSlugs: ["hello-world", "second-post"],
      categorySlugs: ["general", "tech"],
    });
    const config = files.find((f) => f.path.includes("playwright.config"));
    expect(config!.content).toMatchSnapshot();
  });

  it("generates stable smoke test", () => {
    const files = generateVerifyScaffold({
      siteUrl: "https://snapshot.example.com",
      postSlugs: ["hello-world"],
      categorySlugs: ["general"],
    });
    const smoke = files.find((f) => f.path.includes("smoke.spec"));
    expect(smoke!.content).toMatchSnapshot();
  });
});
