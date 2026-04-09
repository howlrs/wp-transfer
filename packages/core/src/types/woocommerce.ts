import { z } from "zod";

export const WooProductTypeSchema = z.enum(["simple", "variable", "grouped", "external"]);
export type WooProductType = z.infer<typeof WooProductTypeSchema>;

export const WooStockStatusSchema = z.enum(["instock", "outofstock", "onbackorder"]);
export type WooStockStatus = z.infer<typeof WooStockStatusSchema>;

export const WooProductAttributeSchema = z.object({
  name: z.string(),
  slug: z.string(),
  values: z.array(z.string()),
  isVariation: z.boolean(),
});
export type WooProductAttribute = z.infer<typeof WooProductAttributeSchema>;

export const WooProductVariationSchema = z.object({
  id: z.number(),
  sku: z.string(),
  price: z.string(),
  regularPrice: z.string(),
  salePrice: z.string(),
  stockStatus: z.string(),
  attributes: z.array(z.object({ name: z.string(), value: z.string() })),
});
export type WooProductVariation = z.infer<typeof WooProductVariationSchema>;

export const WooProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  type: WooProductTypeSchema,
  status: z.string(),
  description: z.string(),
  shortDescription: z.string(),
  sku: z.string(),
  price: z.string(),
  regularPrice: z.string(),
  salePrice: z.string(),
  stockStatus: WooStockStatusSchema,
  weight: z.string(),
  categories: z.array(z.object({ slug: z.string(), name: z.string() })),
  attributes: z.array(WooProductAttributeSchema),
  variations: z.array(WooProductVariationSchema),
  images: z.array(z.object({ url: z.string(), alt: z.string() })),
  productUrl: z.string(),
  buttonText: z.string(),
});
export type WooProduct = z.infer<typeof WooProductSchema>;
