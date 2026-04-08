import type { WpTaxonomyTerm } from "@wp-transfer/core";
import type { Tag } from "sax";
import type { WxrCollector } from "./stream-parser.js";

/**
 * Collects taxonomy terms (categories and tags) from WXR SAX events.
 *
 * Categories are inside <wp:category>, tags inside <wp:tag>.
 */
export class TaxonomyCollector implements WxrCollector {
  readonly taxonomies: WpTaxonomyTerm[] = [];

  /** Stores parent slug for each category (keyed by category slug) */
  private parentSlugMap = new Map<string, string>();

  private inCategory = false;
  private inTag = false;
  private textBuffer = "";

  // Category fields
  private catId = 0;
  private catNicename = "";
  private catName = "";
  private catDescription = "";
  private catParent = "";

  // Tag fields
  private tagId = 0;
  private tagSlug = "";
  private tagName = "";
  private tagDescription = "";

  onOpenTag(tag: Tag): void {
    const name = tag.name;

    if (name === "wp:category") {
      this.inCategory = true;
      this.catId = 0;
      this.catNicename = "";
      this.catName = "";
      this.catDescription = "";
      this.catParent = "";
    } else if (name === "wp:tag") {
      this.inTag = true;
      this.tagId = 0;
      this.tagSlug = "";
      this.tagName = "";
      this.tagDescription = "";
    }

    this.textBuffer = "";
  }

  onText(text: string): void {
    if (this.inCategory || this.inTag) {
      this.textBuffer += text;
    }
  }

  onCdata(cdata: string): void {
    if (this.inCategory || this.inTag) {
      this.textBuffer += cdata;
    }
  }

  onCloseTag(name: string): void {
    const text = this.textBuffer;

    if (this.inCategory) {
      switch (name) {
        case "wp:term_id":
          this.catId = parseInt(text, 10) || 0;
          break;
        case "wp:category_nicename":
          this.catNicename = text;
          break;
        case "wp:cat_name":
          this.catName = text;
          break;
        case "wp:category_description":
          this.catDescription = text;
          break;
        case "wp:category_parent":
          this.catParent = text;
          break;
        case "wp:category":
          this.taxonomies.push({
            id: this.catId,
            name: this.catName,
            slug: this.catNicename,
            taxonomy: "category",
            description: this.catDescription || undefined,
          });
          if (this.catParent) {
            this.parentSlugMap.set(this.catNicename, this.catParent);
          }
          this.inCategory = false;
          break;
      }
    }

    if (this.inTag) {
      switch (name) {
        case "wp:term_id":
          this.tagId = parseInt(text, 10) || 0;
          break;
        case "wp:tag_slug":
          this.tagSlug = text;
          break;
        case "wp:tag_name":
          this.tagName = text;
          break;
        case "wp:tag_description":
          this.tagDescription = text;
          break;
        case "wp:tag":
          this.taxonomies.push({
            id: this.tagId,
            name: this.tagName,
            slug: this.tagSlug,
            taxonomy: "post_tag",
            description: this.tagDescription || undefined,
          });
          this.inTag = false;
          break;
      }
    }

    this.textBuffer = "";
  }

  /**
   * Resolves parent slugs to parent IDs for categories.
   * Must be called after all categories have been collected.
   */
  resolveParentIds(): void {
    // Build a slug→id lookup from collected categories
    const slugToId = new Map<string, number>();
    for (const term of this.taxonomies) {
      if (term.taxonomy === "category") {
        slugToId.set(term.slug, term.id);
      }
    }

    // Resolve parentSlug → parentId
    for (const term of this.taxonomies) {
      if (term.taxonomy === "category") {
        const parentSlug = this.parentSlugMap.get(term.slug);
        if (parentSlug) {
          const parentId = slugToId.get(parentSlug);
          if (parentId !== undefined) {
            term.parentId = parentId;
          }
        }
      }
    }
  }
}
