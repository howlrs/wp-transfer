import { defineCommand } from "citty";
import { consola } from "consola";
import { createReadStream, existsSync, statSync, readdirSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import type { WxrParseResult } from "@wp-transfer/wxr-parser";
import {
  analyzeSchema,
  estimateCost,
  generateReport,
  reportToMarkdown,
  createWpRestClient,
  classifyPlugin,
  parseGutenbergBlocks,
  convertBlocksToPortableText,
  transformProducts,
  generateWooPrismaSchema,
  generateWooScaffold,
  detectI18n,
  generateI18nScaffold,
  detectMultisite,
  mergeUsers,
  normalizeMedia,
  rewriteCrossSiteUrls,
  generateMultisitePrismaSchema,
  generateMultisiteScaffold,
  resolveTemplate,
  detectPageBuilder,
  detectMetaBox,
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
      description: "WP site URL, WXR file path, or directory (with --multisite)",
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
    multisite: {
      type: "boolean",
      default: false,
      description: "Enable multisite analysis (source must be a directory)",
    },
    "multisite-mode": {
      type: "string",
      default: "",
      description: "Scaffold mode: subpath or subdomain (auto-detected if omitted)",
    },
    interactive: {
      type: "boolean",
      default: false,
      description: "Enable interactive prompts to configure analysis options",
    },
    templates: {
      type: "string",
      description: "Directory with template overrides for scaffold files",
    },
  },
  async run({ args }) {
    let source = args.source as string;
    let output = args.output as string;
    let format = args.format as string;
    let multisite = args.multisite as boolean;
    let multisiteMode = args["multisite-mode"] as string;
    const templateDir = args.templates as string | undefined;

    // Interactive mode: prompt for options when TTY is available
    if (args.interactive && process.stdout.isTTY) {
      const sourceType = await consola.prompt("Source type:", {
        type: "select",
        options: ["WXR file", "URL", "Directory (multisite)"],
      });
      if (typeof sourceType === "symbol") return;

      if (sourceType === "WXR file") {
        const wxrPath = await consola.prompt("WXR file path:", { type: "text" });
        if (typeof wxrPath === "symbol") return;
        source = wxrPath;
      } else if (sourceType === "URL") {
        const url = await consola.prompt("WordPress site URL:", { type: "text" });
        if (typeof url === "symbol") return;
        source = url;
      } else {
        const dir = await consola.prompt("Directory containing WXR files:", { type: "text" });
        if (typeof dir === "symbol") return;
        source = dir;
        multisite = true;
      }

      const outDir = await consola.prompt("Output directory:", {
        type: "text",
        default: output,
      });
      if (typeof outDir === "symbol") return;
      output = outDir;

      const fmt = await consola.prompt("Output format:", {
        type: "select",
        options: ["json", "markdown", "both"],
      });
      if (typeof fmt === "symbol") return;
      format = fmt;

      if (multisite) {
        const mode = await consola.prompt("Scaffold mode:", {
          type: "select",
          options: ["auto", "subpath", "subdomain"],
        });
        if (typeof mode === "symbol") return;
        multisiteMode = mode === "auto" ? "" : mode;
      }
    }

    const validFormats = ["json", "markdown", "both"];
    if (!validFormats.includes(format)) {
      consola.error(`Invalid format "${format}". Must be one of: ${validFormats.join(", ")}`);
      return;
    }

    // Validate template directory if specified
    if (templateDir && (!existsSync(templateDir) || !statSync(templateDir).isDirectory())) {
      consola.error(`Template directory not found: ${templateDir}`);
      return;
    }

    const resolvedSource = resolve(process.cwd(), source);

    // Multisite: directory input
    if (multisite) {
      if (!existsSync(resolvedSource) || !statSync(resolvedSource).isDirectory()) {
        consola.error("--multisite requires a directory path containing WXR files.");
        return;
      }
      const resolvedDir = resolve(resolvedSource);
      const xmlFiles = readdirSync(resolvedDir)
        .filter((f) => f.endsWith(".xml"))
        .map((f) => resolve(resolvedDir, f))
        .filter((f) => f.startsWith(resolvedDir));

      if (xmlFiles.length === 0) {
        consola.error("No XML files found in the directory.");
        return;
      }

      await analyzeMultisite(xmlFiles, output, format, multisiteMode, templateDir);
      return;
    }

    if (source.endsWith(".xml") && existsSync(resolvedSource)) {
      await analyzeFromWxr(resolvedSource, output, format, templateDir);
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

async function analyzeMultisite(
  xmlFiles: string[],
  output: string,
  format: string,
  multisiteMode: string,
  templateDir?: string,
): Promise<void> {
  consola.start(`Parsing ${xmlFiles.length} WXR files...`);

  const wxrResults: WxrParseResult[] = [];
  for (const file of xmlFiles) {
    const stream = createReadStream(file);
    const wxr = await parseWxr(stream);
    wxrResults.push(wxr);
    consola.success(`  ${file}: ${wxr.posts.length} posts, ${wxr.users.length} users`);
  }

  // Detect multisite structure
  const network = detectMultisite(wxrResults);
  consola.success(`Network: ${network.mode} mode, ${network.sites.length} sites`);

  // Determine scaffold mode
  const scaffoldMode = multisiteMode === "subdomain" ? "subdomain" as const
    : multisiteMode === "subpath" ? "subpath" as const
    : network.mode === "subdomain" ? "subdomain" as const
    : "subpath" as const;

  // Merge users
  const siteUserData = network.sites.map((site, i) => ({
    siteId: site.siteId,
    users: wxrResults[i]!.users,
    posts: wxrResults[i]!.posts,
  }));
  const { sharedUsers, userConflicts } = mergeUsers(siteUserData);
  network.sharedUsers = sharedUsers;
  network.userConflicts = userConflicts;
  consola.success(`Users: ${sharedUsers.length} unique (${userConflicts.length} conflicts)`);

  // Normalize media + collect remotePatterns
  const allRemotePatterns: { protocol: string; hostname: string }[] = [];
  for (const site of network.sites) {
    const siteWxr = wxrResults.find((w) => (w.blogUrl || w.siteUrl) === site.baseUrl);
    if (!siteWxr) continue;
    const { remotePatterns } = normalizeMedia(siteWxr.media, site.siteId);
    allRemotePatterns.push(...remotePatterns);
  }

  // Rewrite cross-site URLs
  const allLinks = [];
  for (const site of network.sites) {
    const siteWxr = wxrResults.find((w) => (w.blogUrl || w.siteUrl) === site.baseUrl);
    if (!siteWxr) continue;
    for (const post of siteWxr.posts) {
      const { links } = rewriteCrossSiteUrls(post.content, site.siteId, post.id, network.sites, scaffoldMode);
      allLinks.push(...links);
    }
  }
  network.crossSiteLinks = allLinks;
  consola.success(`Cross-site links: ${allLinks.length} rewritten`);

  // Generate output
  const outputDir = resolve(output);

  // Prisma schema
  const prismaSchema = generateMultisitePrismaSchema(network.sites);
  const prismaPath = resolve(outputDir, "prisma/schema.prisma");
  await mkdir(dirname(prismaPath), { recursive: true });
  await writeFile(prismaPath, prismaSchema, "utf-8");
  consola.success(`Written: ${prismaPath}`);

  // Scaffold files
  const deduped = [...new Map(allRemotePatterns.map((p) => [`${p.protocol}://${p.hostname}`, p])).values()];
  const scaffoldFiles = generateMultisiteScaffold({ sites: network.sites, mode: scaffoldMode, remotePatterns: deduped });
  for (const file of scaffoldFiles) {
    const content = await resolveTemplate(templateDir, file);
    const filePath = resolve(outputDir, file.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
  }
  consola.success(`Written: ${scaffoldFiles.length} scaffold files`);

  // Summary
  const sitesTable = network.sites
    .map((s) => `  ${s.siteId}. ${s.title} (${s.path})`)
    .join("\n");

  consola.box(
    [
      `Multisite Network: ${network.mode}`,
      `Network URL: ${network.networkUrl}`,
      `Scaffold Mode: ${scaffoldMode}`,
      `Sites:\n${sitesTable}`,
      `Users: ${sharedUsers.length} unique, ${userConflicts.length} conflicts`,
      `Cross-site links: ${allLinks.length} rewritten`,
    ].join("\n"),
  );
}

async function analyzeFromWxr(
  filePath: string,
  output: string,
  format: string,
  templateDir?: string,
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

  // WooCommerce: detect product posts and generate EC scaffold
  const productPosts = wxr.posts.filter((p) => p.type === "product");
  if (productPosts.length > 0) {
    consola.start(`WooCommerce detected: ${productPosts.length} products`);

    const wooProducts = transformProducts(wxr.posts, wxr.media);
    consola.success(`Transformed: ${wooProducts.length} products, ${wooProducts.reduce((s, p) => s + p.variations.length, 0)} variations`);

    // Write Prisma schema
    const prismaSchema = generateWooPrismaSchema(wooProducts);
    const outputDir = resolve(output);
    const prismaPath = resolve(outputDir, "prisma/schema.prisma");
    await mkdir(dirname(prismaPath), { recursive: true });
    await writeFile(prismaPath, prismaSchema, "utf-8");
    consola.success(`Written: ${prismaPath}`);

    // Write EC scaffold files
    const categories = [
      ...new Map(
        wooProducts.flatMap((p) => p.categories).map((c) => [c.slug, c]),
      ).values(),
    ];
    const scaffoldFiles = generateWooScaffold({
      siteTitle: wxr.siteTitle || "Shop",
      products: wooProducts,
      categories,
      mediaDomains: [],
    });

    for (const file of scaffoldFiles) {
      const content = await resolveTemplate(templateDir, file);
      const filePath = resolve(outputDir, file.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
    }
    consola.success(`Written: ${scaffoldFiles.length} EC scaffold files`);
  }

  // i18n: detect WPML/Polylang and generate i18n scaffold
  const i18nResult = detectI18n(wxr.posts);
  if (i18nResult.plugin) {
    consola.success(`i18n detected: ${i18nResult.plugin} (${i18nResult.locales.join(", ")}), default: ${i18nResult.defaultLocale}`);

    const i18nFiles = generateI18nScaffold({
      locales: i18nResult.locales,
      defaultLocale: i18nResult.defaultLocale,
    });

    const outputDir = resolve(output);
    for (const file of i18nFiles) {
      const content = await resolveTemplate(templateDir, file);
      const filePath = resolve(outputDir, file.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
    }
    consola.success(`Written: ${i18nFiles.length} i18n scaffold files`);
  }

  // Page builder detection
  const builderAnalysis = detectPageBuilder(wxr.posts);
  if (builderAnalysis.builder) {
    consola.success(`Page builder: ${builderAnalysis.builder} (${builderAnalysis.pageCount} pages)`);
    const outputDir = resolve(output);
    const guidePath = resolve(outputDir, "page-builder-guide.md");
    await mkdir(dirname(guidePath), { recursive: true });
    await writeFile(guidePath, builderAnalysis.migrationGuide, "utf-8");
    consola.success(`Written: ${guidePath}`);
  }

  // Meta Box: detect custom fields not belonging to known plugins
  const metaBoxResult = detectMetaBox(wxr.posts);
  if (metaBoxResult.detected) {
    consola.success(`Custom fields detected: ${metaBoxResult.fieldCount} fields (possible Meta Box)`);
  }

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
