# wp-transfer

WordPress-to-Next.js migration accelerator CLI. It analyzes WXR exports or WordPress REST metadata, generates migration scaffolds, and verifies generated projects in an isolated environment.

This package is alpha software. Generated code is a starting point and must be reviewed before production use.

```bash
wp-transfer analyze ./export.xml
wp-transfer analyze-php ./theme --schema ./database.md --output ./output/my-site
wp-transfer run ./output/my-site
```

See the [repository documentation](https://github.com/howlrs/wp-transfer#readme) for requirements, safety boundaries, and current limitations.
