import type { WpUser } from "@wp-transfer/core";
import type { Tag } from "sax";
import type { WxrCollector } from "./stream-parser.js";

/**
 * Collects WordPress authors from WXR SAX events.
 *
 * Authors are inside <wp:author> elements.
 */
export class UserCollector implements WxrCollector {
  readonly users: WpUser[] = [];

  private inAuthor = false;
  private textBuffer = "";

  private authorId = 0;
  private authorLogin = "";
  private authorEmail = "";
  private authorDisplayName = "";

  onOpenTag(tag: Tag): void {
    if (tag.name === "wp:author") {
      this.inAuthor = true;
      this.authorId = 0;
      this.authorLogin = "";
      this.authorEmail = "";
      this.authorDisplayName = "";
    }

    this.textBuffer = "";
  }

  onText(text: string): void {
    if (this.inAuthor) {
      this.textBuffer += text;
    }
  }

  onCdata(cdata: string): void {
    if (this.inAuthor) {
      this.textBuffer += cdata;
    }
  }

  onCloseTag(name: string): void {
    if (!this.inAuthor) return;

    const text = this.textBuffer;

    switch (name) {
      case "wp:author_id":
        this.authorId = parseInt(text, 10) || 0;
        break;
      case "wp:author_login":
        this.authorLogin = text;
        break;
      case "wp:author_email":
        this.authorEmail = text;
        break;
      case "wp:author_display_name":
        this.authorDisplayName = text;
        break;
      case "wp:author":
        this.users.push({
          id: this.authorId,
          login: this.authorLogin,
          email: this.authorEmail,
          displayName: this.authorDisplayName,
          role: "author",
          registered: "",
        });
        this.inAuthor = false;
        break;
    }

    this.textBuffer = "";
  }
}
