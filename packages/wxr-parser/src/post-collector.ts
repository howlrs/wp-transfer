import type { WpPost } from "@wp-transfer/core";
import type { Tag } from "sax";
import type { WxrCollector } from "./stream-parser.js";

interface PostMetaEntry {
  key: string;
  value: string;
}

interface PostBuildState {
  id: number;
  title: string;
  slug: string;
  status: string;
  type: string;
  content: string;
  excerpt: string;
  date: string;
  modified: string;
  author: string;
  commentStatus: string;
  parentId: number;
  menuOrder: number;
  meta: Record<string, unknown>;
  categories: string[];
  tags: string[];
}

function createEmptyPost(): PostBuildState {
  return {
    id: 0,
    title: "",
    slug: "",
    status: "draft",
    type: "post",
    content: "",
    excerpt: "",
    date: "",
    modified: "",
    author: "",
    commentStatus: "open",
    parentId: 0,
    menuOrder: 0,
    meta: {},
    categories: [],
    tags: [],
  };
}

/**
 * Collects WordPress posts/pages from WXR SAX events.
 *
 * Posts live inside <item> elements. Post meta is nested inside
 * <wp:postmeta> sub-elements with <wp:meta_key> and <wp:meta_value>.
 */
export class PostCollector implements WxrCollector {
  readonly posts: WpPost[] = [];

  private inItem = false;
  private inPostMeta = false;
  private currentPost: PostBuildState = createEmptyPost();
  private currentMeta: PostMetaEntry = { key: "", value: "" };
  private textBuffer = "";
  private currentTag = "";

  onOpenTag(tag: Tag): void {
    const name = tag.name;

    if (name === "item") {
      this.inItem = true;
      this.currentPost = createEmptyPost();
    } else if (this.inItem && name === "wp:postmeta") {
      this.inPostMeta = true;
      this.currentMeta = { key: "", value: "" };
    }

    if (this.inItem && name === "category") {
      const domain = tag.attributes["domain"] as string | undefined;
      const nicename = tag.attributes["nicename"] as string | undefined;
      if (domain && nicename) {
        // We'll capture the text content in onCloseTag for category name,
        // but we track the nicename from attributes for taxonomy assignment.
        // Store temporarily — will be resolved in closetag.
        if (domain === "category") {
          this.currentPost.categories.push(nicename);
        } else if (domain === "post_tag") {
          this.currentPost.tags.push(nicename);
        }
      }
    }

    this.currentTag = name;
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

    if (this.inPostMeta) {
      if (name === "wp:meta_key") {
        this.currentMeta.key = text;
      } else if (name === "wp:meta_value") {
        this.currentMeta.value = text;
      } else if (name === "wp:postmeta") {
        if (this.currentMeta.key) {
          this.currentPost.meta[this.currentMeta.key] = this.currentMeta.value;
        }
        this.inPostMeta = false;
      }
      this.textBuffer = "";
      return;
    }

    switch (name) {
      case "title":
        this.currentPost.title = text;
        break;
      case "wp:post_id":
        this.currentPost.id = parseInt(text, 10) || 0;
        break;
      case "wp:post_name":
        this.currentPost.slug = text;
        break;
      case "wp:status":
        this.currentPost.status = text;
        break;
      case "wp:post_type":
        this.currentPost.type = text;
        break;
      case "content:encoded":
        this.currentPost.content = text;
        break;
      case "excerpt:encoded":
        this.currentPost.excerpt = text;
        break;
      case "wp:post_date":
        this.currentPost.date = text;
        break;
      case "wp:post_modified":
        this.currentPost.modified = text;
        break;
      case "dc:creator":
        this.currentPost.author = text;
        break;
      case "wp:comment_status":
        this.currentPost.commentStatus = text;
        break;
      case "wp:post_parent":
        this.currentPost.parentId = parseInt(text, 10) || 0;
        break;
      case "wp:menu_order":
        this.currentPost.menuOrder = parseInt(text, 10) || 0;
        break;
      case "item":
        this.posts.push(this.buildPost());
        this.inItem = false;
        break;
    }

    this.textBuffer = "";
  }

  private buildPost(): WpPost {
    const p = this.currentPost;
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status as WpPost["status"],
      type: p.type,
      content: p.content,
      excerpt: p.excerpt,
      date: p.date,
      modified: p.modified,
      author: 0, // Will be resolved by author login later if needed
      meta: p.meta,
      commentStatus: p.commentStatus,
      parentId: p.parentId || undefined,
      menuOrder: p.menuOrder || undefined,
    };
  }
}
