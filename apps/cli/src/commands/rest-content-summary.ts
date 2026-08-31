import type { WpRestPostType } from "@wp-transfer/analyzer";
import type { ContentSummary, CustomPostType } from "@wp-transfer/core";

const NON_CONTENT_POST_TYPES = new Set([
  "revision",
  "nav_menu_item",
  "wp_block",
  "wp_template",
  "wp_template_part",
  "wp_navigation",
  "wp_font_family",
  "wp_font_face",
]);

export interface RestContentAnalysis {
  contentSummary: Pick<
    ContentSummary,
    "posts" | "pages" | "media" | "customPostTypes"
  >;
  customPostTypes: CustomPostType[];
  /** All migratable written content, including pages and custom post types. */
  postCountForEstimate: number;
}

export type PostTypeCountFetcher = (
  restBase: string,
  restNamespace?: string,
) => Promise<number>;
export type PostTypeCountWarning = (message: string) => void;

/**
 * Fetches totals for every REST-exposed post type. A single unavailable endpoint
 * is represented as zero so that the remainder of the site can still be analysed.
 */
export async function fetchRestPostTypeCounts(
  postTypes: WpRestPostType[],
  fetchCount: PostTypeCountFetcher,
  warn: PostTypeCountWarning = () => {},
): Promise<Map<string, number>> {
  const counts = await Promise.all(
    postTypes.map(async (postType) => {
      const restBase = postType.restBase || postType.slug;
      try {
        const count = postType.restNamespace
          ? await fetchCount(restBase, postType.restNamespace)
          : await fetchCount(restBase);
        return [postType.slug, count] as const;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        warn(`Could not fetch count for post type "${postType.slug}": ${reason}`);
        return [postType.slug, 0] as const;
      }
    }),
  );

  return new Map(counts);
}

/** Maps REST post-type totals into the schema summary and cost-estimate inputs. */
export function summarizeRestContent(
  postTypes: WpRestPostType[],
  counts: ReadonlyMap<string, number>,
): RestContentAnalysis {
  const countFor = (slug: string): number => counts.get(slug) ?? 0;
  const customPostTypes = postTypes
    .filter((postType) =>
      !["post", "page", "attachment"].includes(postType.slug) &&
      !NON_CONTENT_POST_TYPES.has(postType.slug),
    )
    .map((postType) => ({
      slug: postType.slug,
      name: postType.name || postType.slug,
      count: countFor(postType.slug),
    }));

  const posts = countFor("post");
  const pages = countFor("page");
  const media = countFor("attachment");
  const postCountForEstimate = posts + pages + customPostTypes.reduce(
    (total, postType) => total + postType.count,
    0,
  );

  return {
    contentSummary: { posts, pages, media, customPostTypes },
    customPostTypes,
    postCountForEstimate,
  };
}
