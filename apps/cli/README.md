# wp-transfer

WordPress-to-Next.js migration accelerator CLI. It analyzes WXR exports or WordPress REST metadata, generates migration scaffolds, and verifies generated projects in an isolated environment.

v0.4.1 is a usable pre-1.0 stabilization release. It is not an automatic
production migration tool: generated code is a starting point and must be
reviewed before production use.

Install the GitHub Release tarball:

```bash
npm install --global https://github.com/howlrs/wp-transfer/releases/download/v0.4.1/wp-transfer-0.4.1.tgz
```

The npm registry package is not published yet; publication is pending npm
authentication and trusted-publisher setup. Build from source as an alternative:

```bash
git clone --branch v0.4.1 https://github.com/howlrs/wp-transfer.git
cd wp-transfer
pnpm install --frozen-lockfile
pnpm build
```

```bash
wp-transfer analyze ./export.xml
wp-transfer analyze-php ./theme --schema ./database.md --output ./output/my-site
wp-transfer run ./output/my-site
```

`analyze-php` also accepts a JSON config file:

```json
{
  "source": {
    "type": "php",
    "path": "./legacy-app",
    "schema": "./database.md"
  },
  "output": {
    "dir": "./generated-app"
  },
  "templates": "./templates",
  "features": {
    "aiAssist": false,
    "aiModel": "claude-sonnet-4-20250514"
  }
}
```

```bash
wp-transfer analyze-php --config ./migration.json
```

Paths declared in the config are resolved from the config file's directory;
paths passed on the command line are resolved from the current working
directory. Explicit `--output`, `--schema`, `--templates`, `--ai-assist` /
`--no-ai-assist`, and `--ai-model` flags override config values. String values
support `${ENV_VAR}` expansion.

See the [repository documentation](https://github.com/howlrs/wp-transfer#readme)
for supported workflows, safety boundaries, and current limitations. The release
notes are in [CHANGELOG.md](https://github.com/howlrs/wp-transfer/blob/v0.4.1/CHANGELOG.md).
