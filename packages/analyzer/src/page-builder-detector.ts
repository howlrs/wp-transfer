import type { WpPost } from "@wp-transfer/core";

export interface PageBuilderAnalysis {
  builder: "elementor" | "divi" | "wpbakery" | null;
  pageCount: number;
  widgetUsage: Record<string, number>;
  maxDepth: number;
  migrationGuide: string;
}

const EMPTY: PageBuilderAnalysis = {
  builder: null,
  pageCount: 0,
  widgetUsage: {},
  maxDepth: 0,
  migrationGuide: "",
};

// --- Elementor ---

interface ElementorNode {
  elType?: string;
  widgetType?: string;
  elements?: ElementorNode[];
}

function parseElementorData(raw: unknown): ElementorNode[] | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as ElementorNode[];
  } catch {
    return null;
  }
}

function walkElementor(
  nodes: ElementorNode[],
  usage: Record<string, number>,
  depth: number,
): number {
  let maxDepth = depth;
  for (const node of nodes) {
    if (node.widgetType) {
      usage[node.widgetType] = (usage[node.widgetType] ?? 0) + 1;
    }
    if (node.elements && node.elements.length > 0) {
      const childDepth = walkElementor(node.elements, usage, depth + 1);
      if (childDepth > maxDepth) maxDepth = childDepth;
    }
  }
  return maxDepth;
}

function tryElementor(posts: WpPost[]): PageBuilderAnalysis | null {
  const usage: Record<string, number> = {};
  let pageCount = 0;
  let maxDepth = 0;

  for (const post of posts) {
    const nodes = parseElementorData(post.meta["_elementor_data"]);
    if (!nodes || nodes.length === 0) continue;
    pageCount++;
    const depth = walkElementor(nodes, usage, 1);
    if (depth > maxDepth) maxDepth = depth;
  }

  if (pageCount === 0) return null;

  return {
    builder: "elementor",
    pageCount,
    widgetUsage: usage,
    maxDepth,
    migrationGuide: generateGuide("elementor", pageCount, usage, maxDepth),
  };
}

// --- Divi / WPBakery shortcode detection ---

const DIVI_RE = /\[et_pb_(\w+)/g;
const WPBAKERY_RE = /\[vc_(\w+)/g;

interface ShortcodeNesting {
  tag: string;
  depth: number;
}

function countShortcodes(
  content: string,
  prefix: "et_pb" | "vc",
): { usage: Record<string, number>; maxDepth: number } {
  const usage: Record<string, number> = {};
  const openRe = new RegExp(`\\[${prefix}_(\\w+)`, "g");

  // Count occurrences
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(content)) !== null) {
    const tag = `${prefix}_${match[1]}`;
    usage[tag] = (usage[tag] ?? 0) + 1;
  }

  // Estimate depth by tracking open/close shortcodes
  const tokenRe = new RegExp(`\\[(/?)${prefix}_(\\w+)[^\\]]*\\]`, "g");
  let depth = 0;
  let maxDepth = 0;
  while ((match = tokenRe.exec(content)) !== null) {
    const isClose = match[1] === "/";
    if (isClose) {
      depth--;
    } else {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    }
  }

  return { usage, maxDepth };
}

function tryDivi(posts: WpPost[]): PageBuilderAnalysis | null {
  const totalUsage: Record<string, number> = {};
  let pageCount = 0;
  let maxDepth = 0;

  for (const post of posts) {
    if (!DIVI_RE.test(post.content)) continue;
    DIVI_RE.lastIndex = 0;
    pageCount++;
    const { usage, maxDepth: depth } = countShortcodes(post.content, "et_pb");
    for (const [key, count] of Object.entries(usage)) {
      totalUsage[key] = (totalUsage[key] ?? 0) + count;
    }
    if (depth > maxDepth) maxDepth = depth;
  }

  if (pageCount === 0) return null;

  return {
    builder: "divi",
    pageCount,
    widgetUsage: totalUsage,
    maxDepth,
    migrationGuide: generateGuide("divi", pageCount, totalUsage, maxDepth),
  };
}

function tryWpbakery(posts: WpPost[]): PageBuilderAnalysis | null {
  const totalUsage: Record<string, number> = {};
  let pageCount = 0;
  let maxDepth = 0;

  for (const post of posts) {
    if (!WPBAKERY_RE.test(post.content)) continue;
    WPBAKERY_RE.lastIndex = 0;
    pageCount++;
    const { usage, maxDepth: depth } = countShortcodes(post.content, "vc");
    for (const [key, count] of Object.entries(usage)) {
      totalUsage[key] = (totalUsage[key] ?? 0) + count;
    }
    if (depth > maxDepth) maxDepth = depth;
  }

  if (pageCount === 0) return null;

  return {
    builder: "wpbakery",
    pageCount,
    widgetUsage: totalUsage,
    maxDepth,
    migrationGuide: generateGuide("wpbakery", pageCount, totalUsage, maxDepth),
  };
}

// --- Main ---

export function detectPageBuilder(posts: WpPost[]): PageBuilderAnalysis {
  if (posts.length === 0) return EMPTY;
  return tryElementor(posts) ?? tryDivi(posts) ?? tryWpbakery(posts) ?? EMPTY;
}

// --- Migration Guide Generator ---

const COMPONENT_MAP: Record<string, Record<string, string>> = {
  elementor: {
    heading: "`<h1>` - `<h6>`",
    "text-editor": "`<div>` with sanitized HTML",
    image: "`next/image` `<Image>`",
    video: "`<iframe>` / `<video>`",
    button: "`<Link>` / `<button>`",
    divider: "`<hr>`",
    spacer: "CSS margin/padding",
    icon: "react-icons or lucide-react",
    "icon-box": "Custom `<div>` + icon",
    "image-box": "Custom `<figure>` + `<Image>`",
    "star-rating": "Custom rating component",
    "image-carousel": "`embla-carousel` / `swiper`",
    "image-gallery": "CSS grid + `<Image>`",
    tabs: "Radix UI `<Tabs>`",
    accordion: "Radix UI `<Accordion>`",
    toggle: "Radix UI `<Accordion>`",
    alert: "Custom alert `<div>`",
    html: "`dangerouslySetInnerHTML`",
    shortcode: "Manual conversion required",
    "social-icons": "Custom social links",
    testimonial: "Custom testimonial component",
    counter: "Custom animated counter",
    "progress-bar": "`<progress>` / custom bar",
    "google-maps": "`@vis.gl/react-google-maps`",
    form: "`react-hook-form` + `zod`",
  },
  divi: {
    et_pb_text: "`<p>` / `<div>` with HTML",
    et_pb_image: "`next/image` `<Image>`",
    et_pb_button: "`<Link>` / `<button>`",
    et_pb_video: "`<iframe>` / `<video>`",
    et_pb_divider: "`<hr>`",
    et_pb_slider: "`embla-carousel` / `swiper`",
    et_pb_blurb: "Custom card `<div>`",
    et_pb_testimonial: "Custom testimonial component",
    et_pb_cta: "Custom CTA `<section>`",
    et_pb_gallery: "CSS grid + `<Image>`",
    et_pb_tabs: "Radix UI `<Tabs>`",
    et_pb_accordion: "Radix UI `<Accordion>`",
    et_pb_toggle: "Radix UI `<Accordion>`",
    et_pb_contact_form: "`react-hook-form` + `zod`",
    et_pb_signup: "Custom newsletter form",
    et_pb_map: "`@vis.gl/react-google-maps`",
    et_pb_social_media_follow: "Custom social links",
    et_pb_blog: "Dynamic blog listing component",
    et_pb_shop: "Product listing component",
    et_pb_code: "`dangerouslySetInnerHTML`",
    et_pb_section: "`<section>`",
    et_pb_row: "Flex/grid layout `<div>`",
    et_pb_column: "Grid column `<div>`",
  },
  wpbakery: {
    vc_column_text: "`<div>` with sanitized HTML",
    vc_single_image: "`next/image` `<Image>`",
    vc_btn: "`<Link>` / `<button>`",
    vc_video: "`<iframe>` / `<video>`",
    vc_separator: "`<hr>`",
    vc_gallery: "CSS grid + `<Image>`",
    vc_images_carousel: "`embla-carousel` / `swiper`",
    vc_tabs: "Radix UI `<Tabs>`",
    vc_accordion: "Radix UI `<Accordion>`",
    vc_tta_tabs: "Radix UI `<Tabs>`",
    vc_tta_accordion: "Radix UI `<Accordion>`",
    vc_toggle: "Radix UI `<Accordion>`",
    vc_progress_bar: "`<progress>` / custom bar",
    vc_pie: "Custom chart component",
    vc_gmaps: "`@vis.gl/react-google-maps`",
    vc_custom_heading: "`<h1>` - `<h6>`",
    vc_icon: "react-icons or lucide-react",
    vc_message: "Custom alert `<div>`",
    vc_raw_html: "`dangerouslySetInnerHTML`",
    vc_row: "Flex/grid layout `<div>`",
    vc_column: "Grid column `<div>`",
  },
};

const BUILDER_DISPLAY_NAME: Record<string, string> = {
  elementor: "Elementor",
  divi: "Divi",
  wpbakery: "WPBakery",
};

function estimateEffort(
  pageCount: number,
  widgetCount: number,
  uniqueWidgets: number,
  maxDepth: number,
): number {
  // Base: 0.5h per page + 1h per unique widget type + depth complexity
  const base = pageCount * 0.5 + uniqueWidgets * 1;
  const depthMultiplier = maxDepth > 4 ? 1.5 : maxDepth > 2 ? 1.2 : 1;
  return Math.ceil(base * depthMultiplier);
}

function generateGuide(
  builder: "elementor" | "divi" | "wpbakery",
  pageCount: number,
  usage: Record<string, number>,
  maxDepth: number,
): string {
  const displayName = BUILDER_DISPLAY_NAME[builder];
  const mapping = COMPONENT_MAP[builder] ?? {};
  const widgetTotal = Object.values(usage).reduce((s, n) => s + n, 0);
  const uniqueWidgets = Object.keys(usage).length;
  const effort = estimateEffort(pageCount, widgetTotal, uniqueWidgets, maxDepth);

  const sorted = Object.entries(usage).sort((a, b) => b[1] - a[1]);

  const rows = sorted
    .map(([name, count]) => {
      const component = mapping[name] ?? "Custom component (manual)";
      return `| ${name} | ${count} | ${component} |`;
    })
    .join("\n");

  return `# Page Builder Migration Guide: ${displayName}

## Overview
- Builder: ${displayName}
- Pages using builder: ${pageCount}
- Total widgets/modules: ${widgetTotal}
- Unique widget types: ${uniqueWidgets}
- Max nesting depth: ${maxDepth}
- Estimated migration effort: ${effort} hours

## Widget/Module Usage

| Widget | Count | Suggested Next.js Component |
|--------|-------|----------------------------|
${rows}

## Migration Strategy

1. Export content from WordPress
2. For each page, manually map builder widgets to React components
3. Use the widget usage table above to prioritize component development
4. Start with the most frequently used widgets to maximize coverage
5. Complex widgets (forms, sliders, maps) may need third-party React libraries
6. Structural elements (sections, rows, columns) map to CSS grid/flexbox layouts

## Recommended Libraries
- Forms: react-hook-form + zod
- Sliders: swiper or embla-carousel
- Maps: @vis.gl/react-google-maps or react-leaflet
- Icons: lucide-react or react-icons
- UI primitives: Radix UI (tabs, accordion, dialog)
- Image optimization: next/image (built-in)
`;
}
