import type {
  WpPost,
  WpMedia,
  WooProduct,
  WooProductType,
  WooProductVariation,
  WooProductAttribute,
  WooStockStatus,
} from "@wp-transfer/core";
import { phpUnserialize } from "./php-serialize.js";

type PhpValue = string | number | boolean | null | { [key: string]: PhpValue };

export function transformProducts(posts: WpPost[], media: WpMedia[]): WooProduct[] {
  const mediaMap = new Map<number, WpMedia>(media.map((m) => [m.id, m]));

  const productPosts = posts.filter((p) => p.type === "product");
  const variationPosts = posts.filter((p) => p.type === "product_variation");

  const variationsByParent = new Map<number, WpPost[]>();
  for (const v of variationPosts) {
    const parentId = v.parentId ?? 0;
    if (!variationsByParent.has(parentId)) {
      variationsByParent.set(parentId, []);
    }
    variationsByParent.get(parentId)!.push(v);
  }

  return productPosts.map((post) =>
    buildProduct(post, variationsByParent.get(post.id) ?? [], mediaMap),
  );
}

function buildProduct(
  post: WpPost,
  variationPosts: WpPost[],
  mediaMap: Map<number, WpMedia>,
): WooProduct {
  const categories = (post.terms ?? [])
    .filter((t) => t.domain === "product_cat")
    .map((t) => ({ slug: t.slug, name: t.name }));

  return {
    id: post.id,
    name: post.title,
    slug: post.slug,
    type: getProductType(post),
    status: post.status,
    description: post.content,
    shortDescription: post.excerpt,
    sku: getMeta(post, "_sku"),
    price: getMeta(post, "_price"),
    regularPrice: getMeta(post, "_regular_price"),
    salePrice: getMeta(post, "_sale_price"),
    stockStatus: getStockStatus(getMeta(post, "_stock_status")),
    weight: getMeta(post, "_weight"),
    categories,
    attributes: extractAttributes(post),
    variations: variationPosts.map(buildVariation),
    images: resolveImages(post, mediaMap),
    productUrl: getMeta(post, "_product_url"),
    buttonText: getMeta(post, "_button_text"),
  };
}

function getMeta(post: WpPost, key: string): string {
  const val = post.meta[key];
  if (typeof val === "string") return val;
  return "";
}

function getProductType(post: WpPost): WooProductType {
  const term = post.terms?.find((t) => t.domain === "product_type");
  const raw = term?.slug ?? "";
  if (raw === "variable" || raw === "grouped" || raw === "external") return raw;
  return "simple";
}

function getStockStatus(raw: string): WooStockStatus {
  if (raw === "outofstock" || raw === "onbackorder") return raw;
  return "instock";
}

function resolveImages(
  post: WpPost,
  mediaMap: Map<number, WpMedia>,
): { url: string; alt: string }[] {
  const images: { url: string; alt: string }[] = [];
  const seenIds = new Set<number>();

  const thumbnailId = parseInt(getMeta(post, "_thumbnail_id"), 10);
  if (thumbnailId && mediaMap.has(thumbnailId)) {
    const m = mediaMap.get(thumbnailId)!;
    images.push({ url: m.url, alt: m.alt ?? m.title });
    seenIds.add(thumbnailId);
  }

  const galleryRaw = getMeta(post, "_product_image_gallery");
  if (galleryRaw) {
    for (const part of galleryRaw.split(",")) {
      const id = parseInt(part.trim(), 10);
      if (id && !seenIds.has(id) && mediaMap.has(id)) {
        const m = mediaMap.get(id)!;
        images.push({ url: m.url, alt: m.alt ?? m.title });
        seenIds.add(id);
      }
    }
  }

  return images;
}

function extractAttributes(post: WpPost): WooProductAttribute[] {
  const rawMeta = getMeta(post, "_product_attributes");
  const parsed = rawMeta ? phpUnserialize(rawMeta) : null;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return buildAttributesFromTerms(post);
  }

  const attrDefs = parsed as { [key: string]: PhpValue };
  const termsByDomain = new Map<string, string[]>();

  for (const term of post.terms ?? []) {
    if (!term.domain.startsWith("pa_")) continue;
    if (!termsByDomain.has(term.domain)) {
      termsByDomain.set(term.domain, []);
    }
    termsByDomain.get(term.domain)!.push(term.slug);
  }

  return Object.entries(attrDefs).map(([slug, def]) => {
    const defObj = def as { [key: string]: PhpValue };
    const isVariation = defObj["is_variation"] === 1 || defObj["is_variation"] === true;
    const displayName = slugToDisplayName(slug);

    // Use pa_* term slugs if available; otherwise fall back to pipe-split value
    let values: string[] = termsByDomain.get(slug) ?? [];
    if (values.length === 0) {
      const valRaw = typeof defObj["value"] === "string" ? defObj["value"] : "";
      values = valRaw ? valRaw.split("|").map((v) => v.trim()).filter(Boolean) : [];
    }

    return {
      name: displayName,
      slug,
      values,
      isVariation,
    };
  });
}

function buildAttributesFromTerms(post: WpPost): WooProductAttribute[] {
  const byDomain = new Map<string, string[]>();
  for (const term of post.terms ?? []) {
    if (!term.domain.startsWith("pa_")) continue;
    if (!byDomain.has(term.domain)) byDomain.set(term.domain, []);
    byDomain.get(term.domain)!.push(term.slug);
  }
  return Array.from(byDomain.entries()).map(([slug, values]) => ({
    name: slugToDisplayName(slug),
    slug,
    values,
    isVariation: false,
  }));
}

function slugToDisplayName(slug: string): string {
  const base = slug.startsWith("pa_") ? slug.slice(3) : slug;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function buildVariation(post: WpPost): WooProductVariation {
  const attributes: { name: string; value: string }[] = [];
  for (const [key, val] of Object.entries(post.meta)) {
    if (key.startsWith("attribute_") && typeof val === "string") {
      attributes.push({ name: key.slice("attribute_".length), value: val });
    }
  }
  return {
    id: post.id,
    sku: getMeta(post, "_sku"),
    price: getMeta(post, "_price"),
    regularPrice: getMeta(post, "_regular_price"),
    salePrice: getMeta(post, "_sale_price"),
    stockStatus: getStockStatus(getMeta(post, "_stock_status")),
    attributes,
  };
}
