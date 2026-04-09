import { z } from "zod";

export const MultisiteModeSchema = z.enum(["subdomain", "subdirectory", "unknown"]);
export type MultisiteMode = z.infer<typeof MultisiteModeSchema>;

export const WpSiteSchema = z.object({
  siteId: z.number(),
  slug: z.string(),
  title: z.string(),
  baseUrl: z.string(),
  networkUrl: z.string(),
  path: z.string(),
  subdomain: z.string().optional(),
});

export type WpSite = z.infer<typeof WpSiteSchema>;

export const MergedUserSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string(),
  login: z.string(),
  siteRoles: z.array(z.object({
    siteId: z.number(),
    role: z.string(),
  })),
});

export type MergedUser = z.infer<typeof MergedUserSchema>;

export const UserConflictSchema = z.object({
  email: z.string(),
  field: z.string(),
  values: z.array(z.object({
    siteId: z.number(),
    value: z.string(),
  })),
  resolved: z.string(),
});

export type UserConflict = z.infer<typeof UserConflictSchema>;

export const CrossSiteLinkSchema = z.object({
  sourceSiteId: z.number(),
  targetSiteId: z.number(),
  sourcePostId: z.number(),
  originalUrl: z.string(),
  rewrittenPath: z.string(),
});

export type CrossSiteLink = z.infer<typeof CrossSiteLinkSchema>;

export const MultisiteNetworkSchema = z.object({
  mode: MultisiteModeSchema,
  networkUrl: z.string(),
  sites: z.array(WpSiteSchema),
  sharedUsers: z.array(MergedUserSchema),
  userConflicts: z.array(UserConflictSchema),
  crossSiteLinks: z.array(CrossSiteLinkSchema),
});

export type MultisiteNetwork = z.infer<typeof MultisiteNetworkSchema>;

export const MultisiteConfigSchema = z.object({
  scaffoldMode: z.enum(["subpath", "subdomain"]),
});

export type MultisiteConfig = z.infer<typeof MultisiteConfigSchema>;
