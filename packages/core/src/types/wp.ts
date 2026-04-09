import { z } from "zod";

export const WpPostStatusSchema = z.enum([
  "publish",
  "draft",
  "pending",
  "private",
  "future",
  "trash",
  "inherit",
  "auto-draft",
]);

export type WpPostStatus = z.infer<typeof WpPostStatusSchema>;

export const WpPostTermSchema = z.object({
  domain: z.string(),
  slug: z.string(),
  name: z.string(),
});

export type WpPostTerm = z.infer<typeof WpPostTermSchema>;

export const WpPostSchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  status: WpPostStatusSchema,
  type: z.string(),
  content: z.string(),
  excerpt: z.string(),
  date: z.string(),
  modified: z.string(),
  author: z.number(),
  meta: z.record(z.string(), z.unknown()),
  locale: z.string().optional(),
  featuredMedia: z.number().optional(),
  parentId: z.number().optional(),
  menuOrder: z.number().optional(),
  commentStatus: z.string().optional(),
  categories: z.array(z.number()).optional(),
  tags: z.array(z.number()).optional(),
  terms: z.array(WpPostTermSchema).optional(),
});

export type WpPost = z.infer<typeof WpPostSchema>;

export const WpUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.string(),
  registered: z.string(),
});

export type WpUser = z.infer<typeof WpUserSchema>;

export const WpTaxonomyTermSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  taxonomy: z.string(),
  description: z.string().optional(),
  parentId: z.number().optional(),
  count: z.number().optional(),
  locale: z.string().optional(),
});

export type WpTaxonomyTerm = z.infer<typeof WpTaxonomyTermSchema>;

export const WpMediaSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  mimeType: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  fileSize: z.number().optional(),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export type WpMedia = z.infer<typeof WpMediaSchema>;
