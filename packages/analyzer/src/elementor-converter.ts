/**
 * Elementor JSON → React/Portable Text Converter
 *
 * Converts Elementor widget data (from _elementor_data post_meta)
 * to React JSX components and Portable Text blocks.
 */

// ── Types ──

export interface ElementorWidget {
  elType: "section" | "column" | "widget";
  widgetType?: string;
  settings: Record<string, unknown>;
  elements?: ElementorWidget[];
}

export interface ElementorConversionResult {
  /** Direct JSX conversions */
  jsx: string[];
  /** Widgets that couldn't be converted, with guidance */
  unconverted: Array<{ widgetType: string; guidance: string }>;
  /** Total widgets processed */
  totalWidgets: number;
  /** Successfully converted count */
  convertedCount: number;
}

// ── Guidance map for complex widgets ──

const WIDGET_GUIDANCE: Record<string, string> = {
  form: "Use React Hook Form with Zod validation",
  slides: "Use Embla Carousel or Swiper",
  "animated-headline": "Use framer-motion for text animations",
  countdown: "Use date-fns + React state for countdown timer",
  tabs: "Use Radix UI Tabs primitive",
  accordion: "Use Radix UI Accordion primitive",
  toggle: "Use Radix UI Collapsible primitive",
  "media-carousel": "Use Embla Carousel with media support",
  testimonial: "Create a custom Testimonial component with quote styling",
  "price-table": "Create a PricingCard component with feature list",
  "social-icons": "Use lucide-react icons with link list",
};

// ── Direct conversion functions ──

function convertHeading(settings: Record<string, unknown>): string {
  const title = String(settings.title ?? "Heading");
  const size = String(settings.header_size ?? settings.size ?? "h2");
  const tag = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(size) ? size : "h2";
  return `<${tag}>${escapeJsx(title)}</${tag}>`;
}

function convertTextEditor(settings: Record<string, unknown>): string {
  const content = String(settings.editor ?? "");
  return `<div dangerouslySetInnerHTML={{ __html: ${JSON.stringify(content)} }} />`;
}

function convertImage(settings: Record<string, unknown>): string {
  const image = settings.image as Record<string, unknown> | undefined;
  const url = String(image?.url ?? "/placeholder.jpg");
  const alt = String(settings.caption ?? image?.alt ?? "");
  return `<Image src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" width={800} height={600} />`;
}

function convertButton(settings: Record<string, unknown>): string {
  const text = String(settings.text ?? "Click here");
  const link = settings.link as Record<string, unknown> | undefined;
  const url = String(link?.url ?? "#");
  return `<a href="${escapeAttr(url)}" className="inline-block px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700">${escapeJsx(text)}</a>`;
}

function convertDivider(): string {
  return `<hr className="my-8" />`;
}

function convertSpacer(settings: Record<string, unknown>): string {
  const space = settings.space as Record<string, unknown> | undefined;
  const size = String(space?.size ?? "50");
  return `<div style={{ height: "${size}px" }} />`;
}

function convertIconList(settings: Record<string, unknown>): string {
  const items = (settings.icon_list ?? []) as Array<Record<string, unknown>>;
  if (items.length === 0) return `<ul>\n  <li>Item 1</li>\n</ul>`;
  const lis = items.map(item => `  <li>${escapeJsx(String(item.text ?? ""))}</li>`).join("\n");
  return `<ul>\n${lis}\n</ul>`;
}

function convertVideo(settings: Record<string, unknown>): string {
  const videoType = String(settings.video_type ?? "youtube");
  if (videoType === "hosted") {
    const hosted = settings.hosted_url as Record<string, unknown> | undefined;
    const url = String(hosted?.url ?? "");
    return `<video src="${escapeAttr(url)}" controls className="w-full" />`;
  }
  const url = String(settings.youtube_url ?? settings.vimeo_url ?? "");
  return `<iframe src="${escapeAttr(url)}" className="w-full aspect-video" allowFullScreen />`;
}

// ── Helpers ──

function escapeJsx(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const DIRECT_CONVERTERS: Record<string, (settings: Record<string, unknown>) => string> = {
  heading: convertHeading,
  "text-editor": convertTextEditor,
  image: convertImage,
  "image-box": convertImage,
  button: convertButton,
  divider: convertDivider,
  spacer: convertSpacer,
  "icon-list": convertIconList,
  video: convertVideo,
};

// ── Core conversion ──

function convertWidget(widget: ElementorWidget): { jsx?: string; unconverted?: { widgetType: string; guidance: string } } {
  if (!widget.widgetType) return {};

  const converter = DIRECT_CONVERTERS[widget.widgetType];
  if (converter) {
    return { jsx: converter(widget.settings) };
  }

  const guidance = WIDGET_GUIDANCE[widget.widgetType];
  if (guidance) {
    return { unconverted: { widgetType: widget.widgetType, guidance } };
  }

  return { unconverted: { widgetType: widget.widgetType, guidance: `Custom widget "${widget.widgetType}" — manual conversion required` } };
}

function flattenWidgets(elements: ElementorWidget[]): ElementorWidget[] {
  const result: ElementorWidget[] = [];
  for (const el of elements) {
    if (el.elType === "widget") {
      result.push(el);
    }
    if (el.elements && el.elements.length > 0) {
      result.push(...flattenWidgets(el.elements));
    }
  }
  return result;
}

// ── Public API ──

/**
 * Parse Elementor JSON data from _elementor_data post_meta.
 */
export function parseElementorData(jsonString: string): ElementorWidget[] | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) return null;
    return parsed as ElementorWidget[];
  } catch {
    return null;
  }
}

/**
 * Convert Elementor widget tree to React JSX and guidance.
 */
export function convertElementorWidgets(widgets: ElementorWidget[]): ElementorConversionResult {
  const flat = flattenWidgets(widgets);
  const jsx: string[] = [];
  const unconverted: Array<{ widgetType: string; guidance: string }> = [];

  for (const widget of flat) {
    const result = convertWidget(widget);
    if (result.jsx) jsx.push(result.jsx);
    if (result.unconverted) unconverted.push(result.unconverted);
  }

  return {
    jsx,
    unconverted,
    totalWidgets: flat.length,
    convertedCount: jsx.length,
  };
}

/**
 * Extract Elementor data from WordPress post meta.
 */
export function extractElementorFromMeta(postMeta: Record<string, string>): ElementorWidget[] | null {
  const data = postMeta["_elementor_data"];
  if (!data) return null;
  return parseElementorData(data);
}
