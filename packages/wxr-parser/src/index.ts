import type { Readable } from "node:stream";
import type { WpPost, WpUser, WpTaxonomyTerm, WpMedia } from "@wp-transfer/core";
import { createWxrSaxStream } from "./stream-parser.js";
import { PostCollector } from "./post-collector.js";
import { TaxonomyCollector } from "./taxonomy-collector.js";
import { UserCollector } from "./user-collector.js";
import { MediaCollector } from "./media-collector.js";
import { SiteCollector } from "./site-collector.js";

export interface WxrParseResult {
  siteTitle: string;
  siteUrl: string;
  wpVersion: string;
  posts: WpPost[];
  users: WpUser[];
  taxonomies: WpTaxonomyTerm[];
  media: WpMedia[];
}

/**
 * Parse a WXR (WordPress eXtended RSS) export file from a readable stream.
 *
 * Uses SAX streaming to handle large files without loading them entirely
 * into memory. The parser dispatches events to collectors that accumulate
 * posts, users, taxonomy terms, media, and site metadata.
 */
export async function parseWxr(stream: Readable): Promise<WxrParseResult> {
  const postCollector = new PostCollector();
  const taxonomyCollector = new TaxonomyCollector();
  const userCollector = new UserCollector();
  const mediaCollector = new MediaCollector();
  const siteCollector = new SiteCollector();

  await createWxrSaxStream(stream, [
    siteCollector,
    userCollector,
    taxonomyCollector,
    postCollector,
    mediaCollector,
  ]);

  return {
    siteTitle: siteCollector.siteTitle,
    siteUrl: siteCollector.siteUrl,
    wpVersion: siteCollector.wpVersion,
    posts: postCollector.posts,
    users: userCollector.users,
    taxonomies: taxonomyCollector.taxonomies,
    media: mediaCollector.media,
  };
}

// Re-export types and collectors for advanced usage
export type { WxrCollector } from "./stream-parser.js";
export { createWxrSaxStream } from "./stream-parser.js";
export { PostCollector } from "./post-collector.js";
export { TaxonomyCollector } from "./taxonomy-collector.js";
export { UserCollector } from "./user-collector.js";
export { MediaCollector } from "./media-collector.js";
export { SiteCollector } from "./site-collector.js";
