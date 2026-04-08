import { defineCommand } from "citty";
import { consola } from "consola";
import { createReadStream, existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import {
  analyzeSchema,
  estimateCost,
  generateReport,
  reportToMarkdown,
  createWpRestClient,
  classifyPlugin,
  parseGutenbergBlocks,
  convertBlocksToPortableText,
} from "@wp-transfer/analyzer";
import type { PluginEntry } from "@wp-transfer/core";

export const analyzeCommand = defineCommand({
  meta: {
    name: "analyze",
    description: "Analyze a WordPress site for migration",
  },
  args: {
    source: {
      type: "positional",
      required: true,
      description: "WP site URL or WXR file path",
    },
    output: {
      type: "string",
      default: "./migration-report",
      description: "Output file path (without extension)",
    },
    format: {
      type: "string",
      default: "both",
      description: "Output format: json, markdown, or both",
    },
    username: {
      type: "string",
      description: "WP admin username for REST API",
    },
    password: {
      type: "string",
      description: "WP application password for REST API",
    },
  },
  async run({ args }) {
    const source = args.source as string;
    const output = args.output as string;
    const format = args.format as string;

    const validFormats = ["json", "markdown", "both"];
    if (!validFormats.includes(format)) {
      consola.error(`Invalid format "${format}". Must be one of: ${validFormats.join(", ")}`);
      return;
    }

    const resolvedSource = resolve(process.cwd(), source);

    if (source.endsWith(".xml") && existsSync(resolvedSource)) {
      await analyzeFromWxr(resolvedSource, output, format);
    } else {
      await analyzeFromUrl(
        source,
        output,
        format,
        args.username as string | undefined,
        args.password as string | undefined,
      );
    }
  },
});

async function analyzeFromWxr(
  filePath: string,
  output: string,
  format: string,
): Promise<void> {
  consola.start(`Parsing WXR file: ${filePath}`);

  const stream = createReadStream(resolve(filePath));
  const wxr = await parseWxr(stream);

  consola.success(`Parsed: ${wxr.posts.length} posts, ${wxr.media.length} media, ${wxr.users.length} users`);

  // Analyze schema
  consola.start("Analyzing schema...");
  const schema = analyzeSchema(wxr.posts, wxr.taxonomies, wxr.media, wxr.users.length);

  // Convert Gutenberg content to Portable Text
  consola.start("Converting content to Portable Text...");
  let convertedCount = 0;
  for (const post of wxr.posts) {
    if (post.content && post.content.includes("<!-- wp:")) {
      const blocks = parseGutenbergBlocks(post.content);
      const ptBlocks = convertBlocksToPortableText(blocks);
      (post as Record<string, unknown>).portableText = ptBlocks;
      convertedCount++;
    }
  }
  consola.success(`Converted ${convertedCount}/${wxr.posts.length} posts to Portable Text`);

  // Estimate cost (no plugin data from WXR)
  const plugins: PluginEntry[] = [];
  const cost = estimateCost(
    schema.contentSummary.posts,
    schema.contentSummary.media,
    plugins,
    schema.customPostTypes.length > 0,
  );

  // Generate report
  const report = generateReport({
    siteUrl: wxr.siteUrl || filePath,
    wpVersion: wxr.wpVersion || "unknown",
    themeName: "unknown",
    isChildTheme: false,
    schema,
    plugins,
    userCount: wxr.users.length,
    cost,
  });

  await writeOutput(report, output, format);

  consola.box(
    [
      `Site: ${report.siteUrl}`,
      `Posts: ${report.contentSummary.posts} | Pages: ${report.contentSummary.pages} | Media: ${report.contentSummary.media}`,
      `Custom Post Types: ${schema.customPostTypes.length}`,
      `ACF Fields: ${schema.acfFields.length}`,
      `Yoast SEO: ${schema.hasYoastSeo ? "Yes" : "No"} | Rank Math: ${schema.hasRankMath ? "Yes" : "No"}`,
      `Estimated Effort: ${report.estimatedTotalHours} hours`,
      `Risks: ${report.risks.length}`,
    ].join("\n"),
  );
}

async function analyzeFromUrl(
  siteUrl: string,
  output: string,
  format: string,
  username?: string,
  password?: string,
): Promise<void> {
  consola.start(`Connecting to: ${siteUrl}`);

  const auth =
    username && password
      ? { username, applicationPassword: password }
      : undefined;

  const client = createWpRestClient(siteUrl, auth);

  // Probe site info
  let siteInfo: Awaited<ReturnType<typeof client.probeSiteInfo>>;
  try {
    siteInfo = await client.probeSiteInfo();
  } catch {
    consola.error("Failed to connect to the WordPress site. Check the URL and ensure the REST API is accessible.");
    return;
  }
  consola.success(`Connected: ${siteInfo.name}`);

  // Fetch plugins (requires auth)
  let restPlugins: Awaited<ReturnType<typeof client.fetchPlugins>> = [];
  if (auth) {
    try {
      restPlugins = await client.fetchPlugins();
      consola.success(`Plugins: ${restPlugins.length} found`);
    } catch {
      consola.warn("Could not fetch plugins (authentication may be required)");
    }
  } else {
    consola.info("Skipping plugin fetch (no credentials provided)");
  }

  // Classify plugins
  const plugins: PluginEntry[] = restPlugins.map(classifyPlugin);

  // Fetch post types
  let postTypes: Awaited<ReturnType<typeof client.fetchPostTypes>>;
  try {
    postTypes = await client.fetchPostTypes();
  } catch {
    consola.error("Failed to fetch post types from the WordPress REST API.");
    return;
  }
  consola.success(`Post types: ${postTypes.map((pt) => pt.slug).join(", ")}`);

  // Build minimal schema analysis from REST data
  const schema = analyzeSchema([], [], [], 0);

  // Override content summary with REST data
  const hasCustomPostTypes = postTypes.some(
    (pt) =>
      !["post", "page", "attachment", "revision", "nav_menu_item", "wp_block", "wp_template", "wp_template_part", "wp_navigation", "wp_font_family", "wp_font_face"].includes(pt.slug),
  );

  const cost = estimateCost(0, 0, plugins, hasCustomPostTypes);

  const report = generateReport({
    siteUrl: siteInfo.url,
    wpVersion: "unknown",
    themeName: "unknown",
    isChildTheme: false,
    schema,
    plugins,
    userCount: 0,
    cost,
  });

  await writeOutput(report, output, format);

  consola.box(
    [
      `Site: ${report.siteUrl} (${siteInfo.name})`,
      `Plugins: ${plugins.length}`,
      `Post Types: ${postTypes.map((pt) => pt.slug).join(", ")}`,
      `Estimated Effort: ${report.estimatedTotalHours} hours`,
      `Risks: ${report.risks.length}`,
    ].join("\n"),
  );
}

async function writeOutput(
  report: ReturnType<typeof generateReport>,
  output: string,
  format: string,
): Promise<void> {
  const outputPath = resolve(output);
  const dir = dirname(outputPath);
  await mkdir(dir, { recursive: true });

  if (format === "json" || format === "both") {
    const jsonPath = `${outputPath}.json`;
    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8");
    consola.success(`Written: ${jsonPath}`);
  }

  if (format === "markdown" || format === "both") {
    const mdPath = `${outputPath}.md`;
    const md = reportToMarkdown(report);
    await writeFile(mdPath, md, "utf-8");
    consola.success(`Written: ${mdPath}`);
  }
}
