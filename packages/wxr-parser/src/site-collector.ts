import type { Tag } from "sax";
import type { WxrCollector } from "./stream-parser.js";

/**
 * Collects site-level metadata from WXR SAX events.
 *
 * - <title> (inside <channel>, not inside <item>) -> siteTitle
 * - <wp:base_site_url> -> siteUrl
 * - <generator> -> wpVersion (extracted via regex)
 */
export class SiteCollector implements WxrCollector {
  siteTitle = "";
  siteUrl = "";
  blogUrl = "";
  wpVersion = "";

  private textBuffer = "";
  private inChannel = false;
  private inItem = false;
  private currentTag = "";

  onOpenTag(tag: Tag): void {
    if (tag.name === "channel") {
      this.inChannel = true;
    } else if (tag.name === "item") {
      this.inItem = true;
    }

    this.currentTag = tag.name;
    this.textBuffer = "";
  }

  onText(text: string): void {
    if (this.inChannel) {
      this.textBuffer += text;
    }
  }

  onCdata(cdata: string): void {
    if (this.inChannel) {
      this.textBuffer += cdata;
    }
  }

  onCloseTag(name: string): void {
    if (name === "channel") {
      this.inChannel = false;
      this.textBuffer = "";
      return;
    }

    if (name === "item") {
      this.inItem = false;
      this.textBuffer = "";
      return;
    }

    // Only collect channel-level elements, not inside <item>
    if (!this.inChannel || this.inItem) {
      this.textBuffer = "";
      return;
    }

    const text = this.textBuffer;

    switch (name) {
      case "title":
        if (!this.siteTitle) {
          this.siteTitle = text;
        }
        break;
      case "wp:base_site_url":
        this.siteUrl = text;
        break;
      case "wp:base_blog_url":
        this.blogUrl = text;
        break;
      case "generator": {
        const match = text.match(/\?v=([\d.]+)/);
        if (match) {
          this.wpVersion = match[1] ?? "";
        }
        break;
      }
    }

    this.textBuffer = "";
  }
}
