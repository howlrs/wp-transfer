import type { WpPost } from "@wp-transfer/core";

export interface PodsDetectionResult {
  detected: boolean;
  storageMode: "meta" | "table" | "unknown";
  podTypes: string[];
  fieldCount: number;
  warning?: string;
}

const PODS_META_KEYS = /^(_pods_|pods_)/;
const TABLE_STORAGE_KEY = "_pods_meta";

export function detectPods(posts: WpPost[]): PodsDetectionResult {
  if (posts.length === 0) {
    return { detected: false, storageMode: "unknown", podTypes: [], fieldCount: 0 };
  }

  const podTypes = new Set<string>();
  let fieldCount = 0;
  let storageMode: "meta" | "table" | "unknown" = "unknown";
  let tableStorageFound = false;

  for (const post of posts) {
    let hasPodsData = false;

    for (const [key, value] of Object.entries(post.meta)) {
      if (!PODS_META_KEYS.test(key)) continue;

      hasPodsData = true;
      fieldCount++;

      if (key === TABLE_STORAGE_KEY) {
        const raw = typeof value === "string" ? value : JSON.stringify(value);
        if (raw.includes("table")) {
          tableStorageFound = true;
        }
        storageMode = tableStorageFound ? "table" : "meta";
      }
    }

    if (hasPodsData) {
      podTypes.add(post.type);
    }
  }

  if (fieldCount === 0) {
    return { detected: false, storageMode: "unknown", podTypes: [], fieldCount: 0 };
  }

  if (storageMode === "unknown") {
    storageMode = "meta";
  }

  const result: PodsDetectionResult = {
    detected: true,
    storageMode,
    podTypes: [...podTypes],
    fieldCount,
  };

  if (tableStorageFound) {
    result.warning =
      "Pods Table Storage detected: custom table data is not included in WXR exports and cannot be extracted. Manual migration required.";
  }

  return result;
}
