import type { WpTaxonomyTerm } from "@wp-transfer/core";
import type { Tag } from "sax";
import type { WxrCollector } from "./stream-parser.js";

/**
 * Collects taxonomy terms (categories, tags, and generic terms) from WXR SAX
 * events.
 *
 * Categories are inside <wp:category>, tags inside <wp:tag>, and custom
 * taxonomies use the standard outer <wp:term> representation.
 */
export class TaxonomyCollector implements WxrCollector {
  readonly taxonomies: WpTaxonomyTerm[] = [];

  /** Stores parent slugs keyed by taxonomy and term slug. */
  private parentSlugMap = new Map<string, string>();

  private inCategory = false;
  private inTag = false;
  private inTerm = false;
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

  // Generic <wp:term> fields
  private termId = 0;
  private termTaxonomy = "";
  private termSlug = "";
  private termName = "";
  private termDescription = "";
  private termParent = "";

  private parentKey(taxonomy: string, slug: string): string {
    return `${taxonomy}\u0000${slug}`;
  }

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
    } else if (name === "wp:term") {
      this.inTerm = true;
      this.termId = 0;
      this.termTaxonomy = "";
      this.termSlug = "";
      this.termName = "";
      this.termDescription = "";
      this.termParent = "";
    }

    this.textBuffer = "";
  }

  onText(text: string): void {
    if (this.inCategory || this.inTag || this.inTerm) {
      this.textBuffer += text;
    }
  }

  onCdata(cdata: string): void {
    if (this.inCategory || this.inTag || this.inTerm) {
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
            this.parentSlugMap.set(
              this.parentKey("category", this.catNicename),
              this.catParent,
            );
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

    if (this.inTerm) {
      switch (name) {
        case "wp:term_id":
          this.termId = parseInt(text, 10) || 0;
          break;
        case "wp:term_taxonomy":
          this.termTaxonomy = text;
          break;
        case "wp:term_slug":
          this.termSlug = text;
          break;
        case "wp:term_name":
          this.termName = text;
          break;
        case "wp:term_description":
          this.termDescription = text;
          break;
        case "wp:term_parent":
          this.termParent = text;
          break;
        case "wp:term":
          this.taxonomies.push({
            id: this.termId,
            name: this.termName,
            slug: this.termSlug,
            taxonomy: this.termTaxonomy,
            description: this.termDescription || undefined,
          });
          if (this.termParent) {
            this.parentSlugMap.set(
              this.parentKey(this.termTaxonomy, this.termSlug),
              this.termParent,
            );
          }
          this.inTerm = false;
          break;
      }
    }

    this.textBuffer = "";
  }

  /**
   * Resolves parent slugs to parent IDs within their own taxonomy.
   * Must be called after all terms have been collected.
   */
  resolveParentIds(): void {
    // Build a taxonomy+slug→id lookup from all collected terms.
    const slugToId = new Map<string, number>();
    for (const term of this.taxonomies) {
      slugToId.set(this.parentKey(term.taxonomy, term.slug), term.id);
    }

    // Resolve parentSlug → parentId in the same taxonomy.
    for (const term of this.taxonomies) {
      const parentSlug = this.parentSlugMap.get(
        this.parentKey(term.taxonomy, term.slug),
      );
      if (parentSlug) {
        const parentId = slugToId.get(
          this.parentKey(term.taxonomy, parentSlug),
        );
        if (parentId !== undefined) {
          term.parentId = parentId;
        }
      }
    }
  }
}
