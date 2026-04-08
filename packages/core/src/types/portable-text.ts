import type { PortableTextBlock } from "@portabletext/types";

/**
 * Extended Portable Text block with optional locale field for i18n support.
 */
export interface WptPortableTextBlock extends PortableTextBlock {
  locale?: string;
}

/**
 * Image block for wp-transfer Portable Text.
 */
export interface WptImageBlock {
  _type: "image";
  _key: string;
  src: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  locale?: string;
}

/**
 * Embed block for external content (YouTube, Twitter, etc.).
 */
export interface WptEmbedBlock {
  _type: "embed";
  _key: string;
  url: string;
  provider?: string;
  html?: string;
  locale?: string;
}

/**
 * Code block for source code snippets.
 */
export interface WptCodeBlock {
  _type: "code";
  _key: string;
  code: string;
  language?: string;
  locale?: string;
}

/**
 * Raw HTML block for preserving WordPress block HTML that cannot be converted.
 */
export interface WptHtmlBlock {
  _type: "htmlBlock";
  _key: string;
  html: string;
  originalBlockName?: string;
  locale?: string;
}

/**
 * Union type of all wp-transfer content blocks.
 */
export type WptContentBlock =
  | WptPortableTextBlock
  | WptImageBlock
  | WptEmbedBlock
  | WptCodeBlock
  | WptHtmlBlock;
