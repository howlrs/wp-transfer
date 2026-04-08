import type { WpMedia } from "@wp-transfer/core";
import type { Tag } from "sax";
import type { WxrCollector } from "./stream-parser.js";

/**
 * Collects media attachments from WXR SAX events.
 *
 * Attachments are <item> elements with <wp:post_type>attachment</wp:post_type>.
 * The attachment URL is in <wp:attachment_url>.
 */
export class MediaCollector implements WxrCollector {
  readonly media: WpMedia[] = [];

  private inItem = false;
  private textBuffer = "";

  private postId = 0;
  private title = "";
  private attachmentUrl = "";
  private postType = "";
  private mimeType = "";

  onOpenTag(tag: Tag): void {
    if (tag.name === "item") {
      this.inItem = true;
      this.postId = 0;
      this.title = "";
      this.attachmentUrl = "";
      this.postType = "";
      this.mimeType = "";
    }

    this.textBuffer = "";
  }

  onText(text: string): void {
    if (this.inItem) {
      this.textBuffer += text;
    }
  }

  onCdata(cdata: string): void {
    if (this.inItem) {
      this.textBuffer += cdata;
    }
  }

  onCloseTag(name: string): void {
    if (!this.inItem) return;

    const text = this.textBuffer;

    switch (name) {
      case "wp:post_id":
        this.postId = parseInt(text, 10) || 0;
        break;
      case "title":
        this.title = text;
        break;
      case "wp:attachment_url":
        this.attachmentUrl = text;
        break;
      case "wp:post_type":
        this.postType = text;
        break;
      case "wp:post_mime_type":
        this.mimeType = text;
        break;
      case "item":
        if (this.postType === "attachment" && this.attachmentUrl) {
          this.media.push({
            id: this.postId,
            title: this.title,
            url: this.attachmentUrl,
            mimeType: this.mimeType || "application/octet-stream",
          });
        }
        this.inItem = false;
        break;
    }

    this.textBuffer = "";
  }
}
