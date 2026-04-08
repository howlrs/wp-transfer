# WordPress Version Compatibility Matrix

This document describes which WordPress versions, WXR export formats, plugins, and PHP versions are supported by wp-transfer's `analyze` (REST + WXR) and `analyze-php` modes.

---

## WXR Export Format Versions

| WXR Version | WordPress Range | Capabilities |
|-------------|----------------|--------------|
| 1.0 | WP 2.5 -- 2.9 | Basic posts, pages, comments |
| 1.1 | WP 3.0 -- 4.0 | Added custom post types, taxonomies, navigation menus |
| 1.2 | WP 4.1+ | Current format. Added term meta, improved encoding |

wp-transfer targets **WXR 1.2** as the primary format. WXR 1.0/1.1 files will parse but custom post types and term meta may be absent.

---

## WordPress Version Feature Support

| WP Version | WXR | Gutenberg | REST API | ACF Support | Yoast SEO | analyze | analyze-php |
|------------|-----|-----------|----------|-------------|-----------|---------|-------------|
| 4.1 -- 4.6 | 1.2 | No | No | Yes (v4+) | Yes | WXR only | Yes |
| 4.7 -- 4.9 | 1.2 | No | v2 | Yes (v5+) | Yes | Full | Yes |
| 5.0 -- 5.5 | 1.2 | Yes (Classic+Block) | v2 | Yes (v5+) | Yes | Full | Yes |
| 5.6 -- 5.9 | 1.2 | Yes | v2 + App Passwords | Yes | Yes | Full | Yes |
| 6.0 -- 6.7 | 1.2 | Yes (FSE) | v2 + App Passwords | Yes (v6+) | Yes | Full | Yes |

### Notes

- **WP < 4.7**: No built-in REST API. The `analyze` command can only work with WXR exports.
- **WP 5.0+**: Gutenberg block editor. Content contains `<!-- wp:blockName -->` comment markers. The WXR parser preserves these markers in `content` for downstream block-to-portable-text conversion.
- **WP 6.0+**: Full Site Editing (FSE) introduces `wp_template` and `wp_template_part` custom post types. These appear in WXR exports and are stored as regular posts with type `wp_template` / `wp_template_part`.

---

## Plugin Version Compatibility

| Plugin | Min Version | Tested Up To | Template Available | Notes |
|--------|-------------|-------------|-------------------|-------|
| ACF / ACF Pro | 4.0+ | 6.3 | Phase 2 | Field groups via JSON export |
| Yoast SEO | 14.0+ | 23.x | Phase 2 | `_yoast_wpseo_*` meta keys |
| Rank Math | 1.0+ | 1.0.x | Phase 2 | `rank_math_*` meta keys |
| Contact Form 7 | 5.0+ | 5.9 | Phase 2 | `wpcf7_contact_form` CPT |
| WooCommerce | 3.0+ | 9.x | Phase 3 | Complex -- separate project |
| Elementor | 3.0+ | 3.x | Phase 3 | Proprietary block format |
| WPML | 4.0+ | 4.6 | Phase 2 | locale meta fields |
| WPFront User Role Editor | 2.0+ | 3.x | Auto (auth scaffold) | Triggers auth generation |
| Adminimize | 1.0+ | 1.11 | Auto (auth scaffold) | RBAC menu filtering |

---

## analyze-php Mode -- PHP Version Support

The `analyze-php` mode uses regex-based static analysis on PHP source files. It detects PHP version hints from language feature usage.

| PHP Version | Support | Notes |
|-------------|---------|-------|
| 5.6 -- 7.4 | Full | Legacy WP sites, PDO/mysqli patterns |
| 8.0 -- 8.3 | Full | Modern WP sites, typed properties, match expressions |
| 8.4+ | Partial | New syntax patterns may need updates |

### Detected PHP Version Hints

| Pattern | Minimum PHP | Example |
|---------|-------------|---------|
| `match` expression | 8.0 | `match($x) { ... }` |
| Named arguments | 8.0 | `foo(name: $val)` |
| Typed properties | 7.4 | `public int $id;` |
| `readonly` keyword | 8.1 | `readonly class Foo` |
| Enum declarations | 8.1 | `enum Status: string` |
| `#[Attribute]` syntax | 8.0 | `#[Route('/api')]` |
| Null-safe operator | 8.0 | `$obj?->method()` |
| Arrow functions | 7.4 | `fn($x) => $x * 2` |
| Intersection types | 8.1 | `Foo&Bar $param` |
| Fiber usage | 8.1 | `new Fiber(...)` |

---

## Database Support

| Source DB | Target DB | Prisma Provider | Status |
|----------|-----------|----------------|--------|
| MySQL 5.7+ | MySQL 8.0 | mysql | Full |
| MySQL 5.7+ | PostgreSQL 14+ | postgresql | Full |
| MariaDB 10.3+ | MySQL 8.0 | mysql | Full |
| SQLite (WP local dev) | Any | -- | Phase 2 |

---

## WP Version Detection

### From WXR exports

The WP version is extracted from the `<generator>` tag in the WXR channel header:

```xml
<generator>https://wordpress.org/?v=6.7</generator>
```

The parser uses the regex `/?v=([\d.]+)/` to extract the version string. This is available as `wpVersion` in the parse result.

### From PHP source (analyze-php mode)

When scanning a WordPress installation directory, the analyzer checks for `wp-includes/version.php` which contains:

```php
$wp_version = '6.7';
```

---

## Known Limitations

- **WXR 1.0/1.1**: Custom post types and term meta are not available in these older formats.
- **Gutenberg blocks in WP < 5.0**: Content is stored as classic editor HTML without block comment markers. The parser handles this as plain HTML content.
- **Multisite**: Not supported. Only single-site exports are handled.
- **WP.com hosted sites**: WXR export via dashboard works. REST API may be limited by WP.com's hosting restrictions.
- **Large sites (>100k posts)**: The SAX streaming parser handles this without memory issues, but media downloads may require batch processing.
- **FSE templates**: `wp_template` and `wp_template_part` post types are preserved in the export but not yet converted to Next.js template equivalents.
