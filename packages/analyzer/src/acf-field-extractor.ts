import type { WpPost } from "@wp-transfer/core";
import { phpUnserialize } from "./php-serialize.js";

// ── Types ──────────────────────────────────────────────────────────

export interface AcfFieldDefinition {
  key: string;        // "field_abc123"
  name: string;       // "hero_section"
  type: string;       // "flexible_content", "repeater", "group", "clone", "text", "image", etc.
  label: string;
  subFields?: AcfFieldDefinition[];  // For repeater, group, flexible_content
  layouts?: AcfLayoutDefinition[];   // For flexible_content only
  required?: boolean;
}

export interface AcfLayoutDefinition {
  key: string;
  name: string;       // Layout name (e.g., "hero", "cta", "gallery")
  label: string;
  subFields: AcfFieldDefinition[];
}

export interface AcfFieldGroup {
  title: string;
  key: string;
  fields: AcfFieldDefinition[];
}

// ── Constants ──────────────────────────────────────────────────────

const MAX_NESTING_DEPTH = 1;

// ── Helpers ────────────────────────────────────────────────────────

function parseFieldContent(content: string): Record<string, unknown> | null {
  const parsed = phpUnserialize(content);
  if (parsed === null || typeof parsed !== "object") return null;
  return parsed as Record<string, unknown>;
}

function buildFieldDefinition(
  data: Record<string, unknown>,
  childPosts: WpPost[],
  allPosts: WpPost[],
  depth: number,
): AcfFieldDefinition {
  const key = String(data.key ?? "");
  const name = String(data.name ?? "");
  const type = String(data.type ?? "text");
  const label = String(data.label ?? name);
  const required = data.required === 1 || data.required === true;

  const field: AcfFieldDefinition = { key, name, type, label, required };

  // Sub-fields for repeater, group, flexible_content
  if (type === "repeater" || type === "group") {
    if (depth < MAX_NESTING_DEPTH) {
      field.subFields = buildChildFields(childPosts, allPosts, depth + 1);
    }
  }

  if (type === "flexible_content") {
    field.layouts = buildLayouts(childPosts, allPosts, depth);
  }

  if (type === "clone") {
    // Clone fields reference other fields/groups — store the key for resolution
    // No sub-field expansion needed; template generator handles this
  }

  return field;
}

function buildChildFields(
  childPosts: WpPost[],
  allPosts: WpPost[],
  depth: number,
): AcfFieldDefinition[] {
  const fields: AcfFieldDefinition[] = [];

  for (const child of childPosts) {
    if (child.type !== "acf-field") continue;
    const data = parseFieldContent(child.content);
    if (!data) continue;

    const grandchildren = allPosts.filter(
      (p) => p.type === "acf-field" && p.parentId === child.id,
    );
    fields.push(buildFieldDefinition(data, grandchildren, allPosts, depth));
  }

  return fields;
}

function buildLayouts(
  layoutPosts: WpPost[],
  allPosts: WpPost[],
  depth: number,
): AcfLayoutDefinition[] {
  const layouts: AcfLayoutDefinition[] = [];

  for (const layoutPost of layoutPosts) {
    if (layoutPost.type !== "acf-field") continue;
    const data = parseFieldContent(layoutPost.content);
    if (!data) continue;

    const layoutChildren = allPosts.filter(
      (p) => p.type === "acf-field" && p.parentId === layoutPost.id,
    );

    const subFields: AcfFieldDefinition[] = [];
    if (depth < MAX_NESTING_DEPTH) {
      for (const child of layoutChildren) {
        const childData = parseFieldContent(child.content);
        if (!childData) continue;
        const grandchildren = allPosts.filter(
          (p) => p.type === "acf-field" && p.parentId === child.id,
        );
        subFields.push(
          buildFieldDefinition(childData, grandchildren, allPosts, depth + 1),
        );
      }
    }

    layouts.push({
      key: String(data.key ?? ""),
      name: String(data.name ?? ""),
      label: String(data.label ?? data.name ?? ""),
      subFields,
    });
  }

  return layouts;
}

// ── Main ───────────────────────────────────────────────────────────

export function extractAcfFieldGroups(posts: WpPost[]): AcfFieldGroup[] {
  const groups: AcfFieldGroup[] = [];

  const groupPosts = posts.filter((p) => p.type === "acf-field-group");
  if (groupPosts.length === 0) return groups;

  for (const groupPost of groupPosts) {
    const data = parseFieldContent(groupPost.content);
    // Field group content may be empty or minimal — title is in the post itself
    const key = data ? String(data.key ?? "") : "";

    // Find direct child fields belonging to this group
    const directChildren = posts.filter(
      (p) => p.type === "acf-field" && p.parentId === groupPost.id,
    );

    const fields = buildChildFields(directChildren, posts, 0);

    groups.push({
      title: groupPost.title,
      key,
      fields,
    });
  }

  return groups;
}
