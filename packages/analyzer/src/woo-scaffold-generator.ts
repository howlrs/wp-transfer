/**
 * WooCommerce EC Scaffold Generator
 *
 * Generates a complete Next.js App Router EC scaffold from WooCommerce product data.
 * Each ScaffoldFile contains a relative path and content string to be written to disk.
 */

import type { WooProduct } from "@wp-transfer/core";
import type { ScaffoldFile } from "./blog-scaffold-generator.js";
import { escapeForStringLiteral } from "./sanitize.js";

// ── Types ──

export interface WooScaffoldInput {
  siteTitle: string;
  products: WooProduct[];
  categories: { slug: string; name: string }[];
  mediaDomains: string[];
}

// ── File generators ──

function generateShopLayout(siteTitle: string): string {
  const safeTitle = escapeForStringLiteral(siteTitle);
  return `import type { ReactNode } from "react";
import Link from "next/link";
import { CartProvider } from "@/lib/cart-context";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <header style={{ padding: "1rem", borderBottom: "1px solid #e5e7eb" }}>
        <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link href="/" style={{ fontWeight: "bold" }}>${safeTitle}</Link>
          <Link href="/products">Products</Link>
          <Link href="/cart" aria-label="View cart" style={{ marginLeft: "auto" }}>
            🛒 cart
          </Link>
        </nav>
      </header>
      <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
        {children}
      </main>
    </CartProvider>
  );
}
`;
}

function generateProductListPage(): string {
  return `import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  const products = await prisma.product.findMany({
    where: {
      status: "publish",
      ...(category ? { categories: { some: { slug: category } } } : {}),
    },
    include: { images: true, categories: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1>Products</h1>
      {products.length === 0 ? (
        <p>No products found.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1.5rem" }}>
          {products.map((product) => (
            <li key={product.slug} style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", overflow: "hidden" }}>
              {product.images[0] && (
                <img
                  src={product.images[0].url}
                  alt={product.images[0].alt ?? product.name}
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }}
                />
              )}
              <div style={{ padding: "1rem" }}>
                <Link href={\`/products/\${product.slug}\`}>
                  <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>{product.name}</h2>
                </Link>
                <p style={{ color: "#374151" }}>
                  {product.salePrice ? (
                    <>
                      <span style={{ textDecoration: "line-through", color: "#9ca3af", marginRight: "0.5rem" }}>
                        \${product.regularPrice?.toString()}
                      </span>
                      <span style={{ color: "#dc2626" }}>\${product.salePrice?.toString()}</span>
                    </>
                  ) : (
                    <span>\${product.price?.toString()}</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
`;
}

function generateProductDetailPage(): string {
  return `import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DOMPurify from "isomorphic-dompurify";
import { AddToCartButton } from "@/components/add-to-cart-button";

export async function generateStaticParams() {
  const products = await prisma.product.findMany({
    where: { status: "publish" },
    select: { slug: true },
  });
  return products.map((p) => ({ slug: p.slug }));
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const product = await prisma.product.findUnique({
    where: { slug },
    include: { images: true, variations: true, categories: true },
  });

  if (!product) notFound();

  const sanitizedDescription = DOMPurify.sanitize(product.description);

  const isVariable = product.type === "variable";
  const isExternal = product.type === "external";
  const isGrouped = product.type === "grouped";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
      {/* Images */}
      <div>
        {product.images.length > 0 ? (
          <img
            src={product.images[0]!.url}
            alt={product.images[0]!.alt ?? product.name}
            style={{ width: "100%", borderRadius: "0.5rem" }}
          />
        ) : (
          <div style={{ background: "#f3f4f6", aspectRatio: "1", borderRadius: "0.5rem" }} />
        )}
      </div>

      {/* Details */}
      <div>
        <h1>{product.name}</h1>
        {product.sku && <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>SKU: {product.sku}</p>}

        {/* Price */}
        <div style={{ margin: "1rem 0", fontSize: "1.5rem", fontWeight: "bold" }}>
          {product.salePrice ? (
            <>
              <span style={{ textDecoration: "line-through", color: "#9ca3af", fontSize: "1rem", marginRight: "0.5rem" }}>
                \${product.regularPrice?.toString()}
              </span>
              <span style={{ color: "#dc2626" }}>\${product.salePrice?.toString()}</span>
            </>
          ) : (
            <span>\${product.price?.toString()}</span>
          )}
        </div>

        {/* Stock status */}
        <p style={{ color: product.stockStatus === "instock" ? "#16a34a" : "#dc2626" }}>
          {product.stockStatus === "instock" ? "In Stock" : product.stockStatus === "onbackorder" ? "On Backorder" : "Out of Stock"}
        </p>

        {/* Variation selector for variable products */}
        {isVariable && product.variations.length > 0 && (
          <div style={{ margin: "1rem 0" }}>
            <h3>Select variation</h3>
            <select name="variation" style={{ padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #d1d5db" }}>
              {product.variations.map((variation) => (
                <option key={variation.id} value={variation.id}>
                  {JSON.stringify(variation.attributes)} — \${variation.price?.toString()}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* External product link */}
        {isExternal && product.productUrl && (
          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer external"
            style={{ display: "inline-block", padding: "0.75rem 1.5rem", background: "#2563eb", color: "#fff", borderRadius: "0.5rem", textDecoration: "none", marginTop: "1rem" }}
          >
            {product.buttonText || "Buy Now"}
          </a>
        )}

        {/* Grouped product note */}
        {isGrouped && (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>This is a grouped product. See individual items below.</p>
        )}

        {/* Add to cart for simple/variable */}
        {!isExternal && !isGrouped && (
          <AddToCartButton productId={product.id} productName={product.name} price={product.price?.toString() ?? "0"} />
        )}

        {/* Description */}
        <div
          style={{ marginTop: "2rem" }}
          dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
        />
      </div>
    </div>
  );
}
`;
}

function generateCategoryPage(): string {
  return `import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function generateStaticParams() {
  const categories = await prisma.productCategory.findMany({ select: { slug: true } });
  return categories.map((c) => ({ slug: c.slug }));
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const category = await prisma.productCategory.findUnique({ where: { slug } });
  if (!category) notFound();

  const products = await prisma.product.findMany({
    where: {
      status: "publish",
      categories: { some: { slug } },
    },
    include: { images: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1>{category.name}</h1>
      {products.length === 0 ? (
        <p>No products in this category.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1.5rem" }}>
          {products.map((product) => (
            <li key={product.slug} style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", overflow: "hidden" }}>
              {product.images[0] && (
                <img src={product.images[0].url} alt={product.images[0].alt ?? product.name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
              )}
              <div style={{ padding: "1rem" }}>
                <Link href={\`/products/\${product.slug}\`}>
                  <h2 style={{ fontSize: "1rem" }}>{product.name}</h2>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
`;
}

function generateCartPage(): string {
  return `"use client";

import { useCart } from "@/lib/cart-context";
import Link from "next/link";

export default function CartPage() {
  const { items, removeFromCart, updateQuantity, clearCart } = useCart();

  const total = items.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
        <h1>Your cart is empty</h1>
        <Link href="/products" style={{ color: "#2563eb" }}>Continue shopping</Link>
      </div>
    );
  }

  return (
    <div>
      <h1>Cart</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            <th style={{ textAlign: "left", padding: "0.75rem" }}>Product</th>
            <th style={{ textAlign: "center", padding: "0.75rem" }}>Quantity</th>
            <th style={{ textAlign: "right", padding: "0.75rem" }}>Price</th>
            <th style={{ padding: "0.75rem" }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.productId} style={{ borderBottom: "1px solid #e5e7eb" }}>
              <td style={{ padding: "0.75rem" }}>{item.name}</td>
              <td style={{ padding: "0.75rem", textAlign: "center" }}>
                <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} disabled={item.quantity <= 1}>−</button>
                <span style={{ margin: "0 0.5rem" }}>{item.quantity}</span>
                <button onClick={() => updateQuantity(item.productId, item.quantity + 1)}>+</button>
              </td>
              <td style={{ padding: "0.75rem", textAlign: "right" }}>
                \${(parseFloat(item.price) * item.quantity).toFixed(2)}
              </td>
              <td style={{ padding: "0.75rem" }}>
                <button onClick={() => removeFromCart(item.productId)} style={{ color: "#dc2626" }}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={clearCart} style={{ color: "#6b7280" }}>Clear cart</button>
        <div>
          <p style={{ fontSize: "1.25rem", fontWeight: "bold" }}>Total: \${total.toFixed(2)}</p>
          <Link
            href="/checkout"
            style={{ display: "block", padding: "0.75rem 2rem", background: "#2563eb", color: "#fff", borderRadius: "0.5rem", textDecoration: "none", textAlign: "center", marginTop: "0.5rem" }}
          >
            Proceed to Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
`;
}

function generateCheckoutPage(): string {
  return `"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useRouter } from "next/navigation";

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const total = items.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // TODO: Integrate payment gateway (e.g. Stripe, PayPal) here.
      // TODO: Create order record in database.
      // TODO: Send order confirmation email.
      await new Promise((resolve) => setTimeout(resolve, 500)); // placeholder
      clearCart();
      router.push("/checkout/success");
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return <p>Your cart is empty. <a href="/products">Continue shopping</a></p>;
  }

  return (
    <div style={{ maxWidth: "36rem", margin: "0 auto" }}>
      <h1>Checkout</h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "1rem" }}>
          <legend style={{ fontWeight: "bold" }}>Contact information</legend>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Full name
            <input type="text" name="name" required style={{ display: "block", width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", marginTop: "0.25rem" }} />
          </label>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Email
            <input type="email" name="email" required style={{ display: "block", width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", marginTop: "0.25rem" }} />
          </label>
        </fieldset>

        <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "1rem" }}>
          <legend style={{ fontWeight: "bold" }}>Shipping address</legend>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Address
            <input type="text" name="address" required style={{ display: "block", width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", marginTop: "0.25rem" }} />
          </label>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            City
            <input type="text" name="city" required style={{ display: "block", width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", marginTop: "0.25rem" }} />
          </label>
          <label style={{ display: "block" }}>
            Postal code
            <input type="text" name="postalCode" required style={{ display: "block", width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", marginTop: "0.25rem" }} />
          </label>
        </fieldset>

        {/* TODO: Add payment fields here. Use a PCI-compliant provider such as Stripe Elements or PayPal SDK. */}
        <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "0.5rem", padding: "1rem", fontSize: "0.875rem" }}>
          Payment integration not yet configured. TODO: Add payment gateway.
        </div>

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "1rem" }}>
          <p style={{ fontWeight: "bold", fontSize: "1.125rem" }}>Order total: \${total.toFixed(2)}</p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{ padding: "0.75rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "0.5rem", fontSize: "1rem", cursor: submitting ? "not-allowed" : "pointer" }}
        >
          {submitting ? "Placing order…" : "Place order"}
        </button>
      </form>
    </div>
  );
}
`;
}

function generateCartContext(): string {
  return `"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

export interface CartItem {
  productId: number;
  name: string;
  price: string;
  quantity: number;
  imageUrl?: string;
}

interface CartContextValue {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = useCallback((incoming: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    const qty = incoming.quantity ?? 1;
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === incoming.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === incoming.productId
            ? { ...i, quantity: i.quantity + qty }
            : i,
        );
      }
      return [...prev, { ...incoming, quantity: qty }];
    });
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: number, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, totalItems }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
`;
}

function generatePrismaClient(): string {
  return `import { PrismaClient } from "@prisma/client";

// PrismaClient singleton — prevents multiple instances during hot reload in development.
// See: https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
`;
}

// ── Public API ──

export function generateWooScaffold(input: WooScaffoldInput): ScaffoldFile[] {
  const files: ScaffoldFile[] = [];

  files.push({ path: "app/(shop)/layout.tsx", content: generateShopLayout(input.siteTitle) });
  files.push({ path: "app/(shop)/products/page.tsx", content: generateProductListPage() });
  files.push({ path: "app/(shop)/products/[slug]/page.tsx", content: generateProductDetailPage() });
  files.push({ path: "app/(shop)/categories/[slug]/page.tsx", content: generateCategoryPage() });
  files.push({ path: "app/(shop)/cart/page.tsx", content: generateCartPage() });
  files.push({ path: "app/(shop)/checkout/page.tsx", content: generateCheckoutPage() });
  files.push({ path: "lib/cart-context.tsx", content: generateCartContext() });
  files.push({ path: "lib/prisma.ts", content: generatePrismaClient() });

  return files;
}
