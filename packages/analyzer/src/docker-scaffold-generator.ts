/**
 * Docker Scaffold Generator
 *
 * Generates Docker Compose, Dockerfile, .env.example, and .gitignore
 * for the Next.js project.
 */

// ── Types ──

export interface DockerScaffoldFile {
  path: string;
  content: string;
}

// ── File generators ──

function toDatabaseName(projectName: string): string {
  const normalized = projectName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized || "wp_transfer";
}

function generateDockerCompose(
  projectName: string,
  dbProvider: "mysql" | "postgresql",
): string {
  const dbName = toDatabaseName(projectName);
  const dbService =
    dbProvider === "mysql"
      ? `  db:
    image: mysql:8.0
    restart: unless-stopped
    ports:
      - "127.0.0.1:3306:3306"
    command: --default-authentication-plugin=mysql_native_password
    environment:
      MYSQL_ROOT_PASSWORD: \${DB_ROOT_PASSWORD:?Set DB_ROOT_PASSWORD before starting the database}
      MYSQL_DATABASE: ${dbName}
      MYSQL_USER: \${DB_USER:-appuser}
      MYSQL_PASSWORD: \${DB_PASSWORD:?Set DB_PASSWORD before starting the database}
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5`
      : `  db:
    image: postgres:16
    restart: unless-stopped
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      POSTGRES_DB: ${dbName}
      POSTGRES_USER: \${DB_USER:-appuser}
      POSTGRES_PASSWORD: \${DB_PASSWORD:?Set DB_PASSWORD before starting the database}
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USER:-appuser} -d ${dbName}"]
      interval: 10s
      timeout: 5s
      retries: 5`;

  const dbUrl =
    dbProvider === "mysql"
      ? `mysql://\${DB_USER:-appuser}:\${DB_PASSWORD:?Set DB_PASSWORD before starting the app}@db:3306/${dbName}`
      : `postgresql://\${DB_USER:-appuser}:\${DB_PASSWORD:?Set DB_PASSWORD before starting the app}@db:5432/${dbName}`;

  return `# wp-transfer-generated-compose: v1
services:
${dbService}

  app:
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - DATABASE_URL=${dbUrl}
      - AUTH_SECRET=\${AUTH_SECRET:?Set AUTH_SECRET before starting the app}
      - AUTH_TRUST_HOST=true
      - HOSTNAME=0.0.0.0
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    command: ["node", "server.js"]

volumes:
  db_data:
`;
}

function generateDockerfile(): string {
  return `# Stage 1: Install dependencies
FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Stage 2: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["node", "server.js"]
`;
}

function generateEnvExample(
  projectName: string,
  dbProvider: "mysql" | "postgresql",
): string {
  const dbName = toDatabaseName(projectName);
  const dbUrlTemplate =
    dbProvider === "mysql"
      ? `mysql://USER:PASSWORD@HOST:3306/${dbName}`
      : `postgresql://USER:PASSWORD@HOST:5432/${dbName}`;

  // Docker-ready URL uses Compose variables. The run command expands this in memory.
  const dbUrlDocker =
    dbProvider === "mysql"
      ? `mysql://\${DB_USER}:\${DB_PASSWORD}@db:3306/${dbName}`
      : `postgresql://\${DB_USER}:\${DB_PASSWORD}@db:5432/${dbName}`;

  return `# Database connection (Docker Compose — matches docker-compose.yml)
DB_USER="appuser"
DB_PASSWORD=""
DB_ROOT_PASSWORD=""
DATABASE_URL="${dbUrlDocker}"

# For production, replace with:
# DATABASE_URL="${dbUrlTemplate}"

# Runtime secrets. The wp-transfer run command generates ephemeral values in memory
# when these are blank. Set explicit values for manual or persistent environments.
# Generate with: openssl rand -base64 32
AUTH_SECRET=""
SEED_ADMIN_PASSWORD=""
SEED_EDITOR_PASSWORD=""
E2E_ADMIN_USERNAME="admin"
E2E_ADMIN_PASSWORD=""
`;
}

function generateGitignore(): string {
  return `# dependencies
node_modules/

# next.js
.next/
out/

# env files
.env*
!.env.example

# generated test and runtime data
.wp-transfer/
e2e/.auth/
test-results/
playwright-report/
public/uploads/*
!public/uploads/.gitkeep

# misc
*.pem
.DS_Store

# debug
npm-debug.log*
`;
}

function generateDockerignore(): string {
  return `node_modules
.next
.git
.gitignore
.env*
!.env.example
.wp-transfer
e2e/.auth
test-results
playwright-report
*.md
docker-compose*.yml
.dockerignore
`;
}

function generateHealthEndpoint(): string {
  return `import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
`;
}

function generateVerifyScript(
  projectName: string,
  dbProvider: "mysql" | "postgresql",
): string {
  const rootPasswordRequirement = dbProvider === "mysql"
    ? ': "\${DB_ROOT_PASSWORD:?Set DB_ROOT_PASSWORD in .env before verification}"\n'
    : "";
  const expectedProtocol = dbProvider === "mysql" ? "mysql:" : "postgresql:";
  const expectedPort = dbProvider === "mysql" ? "3306" : "5432";
  const expectedDatabaseName = toDatabaseName(projectName);
  const expectedCompose = generateDockerCompose(projectName, dbProvider);

  return `#!/bin/bash
set -euo pipefail

echo "=== wp-transfer: Migration Verification ==="

# Keep manual verification in the same kind of isolated Compose namespace as
# the CLI. The real path prevents same-basename projects under different
# parents from sharing a named database volume.
COMPOSE_PROJECT_NAME="$(node - <<'NODE'
const { createHash } = require("node:crypto");
const { realpathSync } = require("node:fs");
const { basename } = require("node:path");
const canonicalPath = realpathSync(process.cwd());
const readableName = basename(canonicalPath)
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, "-")
  .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
  .slice(0, 32) || "project";
const suffix = createHash("sha256").update(canonicalPath).digest("hex").slice(0, 12);
console.log("wp-transfer-" + readableName + "-" + suffix);
NODE
)"
export COMPOSE_PROJECT_NAME

# Preserve only host settings required to download and install tools. Capture
# them before loading .env so project values cannot broaden setup access.
SETUP_ENVIRONMENT=()
for setup_key in PATH HOME TMPDIR TMP TEMP XDG_CACHE_HOME NPM_CONFIG_CACHE npm_config_cache PLAYWRIGHT_BROWSERS_PATH \
  HTTP_PROXY HTTPS_PROXY NO_PROXY ALL_PROXY http_proxy https_proxy no_proxy all_proxy \
  NODE_EXTRA_CA_CERTS SSL_CERT_FILE SSL_CERT_DIR; do
  if [[ -v "$setup_key" ]]; then
    SETUP_ENVIRONMENT+=("$setup_key=\${!setup_key}")
  fi
done

if [[ ! -f .env ]]; then
  echo ".env is required; copy .env.example and set its secret values first" >&2
  exit 1
fi

set -a
source .env
set +a

: "\${AUTH_SECRET:?Set AUTH_SECRET in .env before verification}"
: "\${DB_USER:?Set DB_USER in .env before verification}"
: "\${DB_PASSWORD:?Set DB_PASSWORD in .env before verification}"
${rootPasswordRequirement}: "\${SEED_ADMIN_PASSWORD:?Set SEED_ADMIN_PASSWORD in .env before verification}"
: "\${SEED_EDITOR_PASSWORD:?Set SEED_EDITOR_PASSWORD in .env before verification}"
: "\${E2E_ADMIN_PASSWORD:?Set E2E_ADMIN_PASSWORD in .env before verification}"

if [[ ! "\${DB_USER}" =~ ^[A-Za-z0-9_-]+$ || ! "\${DB_PASSWORD}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "DB_USER and DB_PASSWORD must use only URL-safe letters, numbers, underscores, or hyphens" >&2
  exit 1
fi

if [[ -z "\${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be set in .env" >&2
  exit 1
fi

# Prisma runs on the host while Compose uses the db service hostname.
DATABASE_URL="\${DATABASE_URL/@db:/@localhost:}"
export DATABASE_URL

# Never let verification apply schema changes or seed data to a remote database.
# Use Node's URL parser rather than shell regexes so encoded credentials and IPv6
# hosts are handled consistently.
node - "$DATABASE_URL" "$DB_USER" "$DB_PASSWORD" "${expectedProtocol}" "${expectedPort}" "${expectedDatabaseName}" <<'NODE'
const fs = require("node:fs");
const [databaseUrl, expectedUser, expectedPassword, expectedProtocol, expectedPort, expectedDatabaseName] = process.argv.slice(2);
const expectedCompose = ${JSON.stringify(expectedCompose)};
try {
  if (fs.readFileSync("docker-compose.yml", "utf8") !== expectedCompose) {
    throw new Error("docker-compose.yml must match the canonical generated manifest");
  }
  const url = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  if (url.protocol !== expectedProtocol) {
    throw new Error("unexpected database protocol");
  }
  if (!localHosts.has(url.hostname)) {
    throw new Error("DATABASE_URL must target localhost, 127.0.0.1, or ::1");
  }
  if (url.port !== expectedPort) {
    throw new Error("DATABASE_URL must use the Docker database port");
  }
  if (url.pathname !== "/" + expectedDatabaseName) {
    throw new Error("DATABASE_URL must use the generated Docker database name");
  }
  if (url.search || url.hash) {
    throw new Error("DATABASE_URL must not include query parameters or fragments");
  }
  if (username !== expectedUser || password !== expectedPassword) {
    throw new Error("DATABASE_URL credentials must match DB_USER and DB_PASSWORD");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "invalid DATABASE_URL";
  console.error("Refusing verification before Docker/schema operations: " + message);
  process.exit(1);
}
NODE

# Setup commands can execute arbitrary lifecycle scripts from the local
# project. This reduces inherited credential exposure, but is not a sandbox or
# an on-disk credential boundary.
run_setup_without_secrets() {
  env -i "\${SETUP_ENVIRONMENT[@]}" "$@"
}

echo "[1/6] Installing dependencies..."
if [[ -f package-lock.json ]]; then
  run_setup_without_secrets npm ci
else
  run_setup_without_secrets npm install
fi

echo "[2/6] Installing Playwright browser..."
run_setup_without_secrets npx playwright install --with-deps chromium

cleanup() {
  docker compose down
}
trap cleanup EXIT

echo "[3/6] Starting Docker services..."
docker compose up -d --wait

echo "[4/6] Applying database schema..."
npx prisma db push

echo "[5/6] Seeding test data..."
npx prisma db seed

echo "[6/6] Running Playwright tests..."
npx playwright test --reporter=html

echo ""
echo "=== Verification Complete ==="
echo "Report: test-results/index.html"
echo "Run 'npx playwright show-report' to view."
`;
}

// ── Public API ──

export function generateDockerScaffold(
  projectName: string,
  dbProvider: "mysql" | "postgresql",
): DockerScaffoldFile[] {
  return [
    {
      path: "docker-compose.yml",
      content: generateDockerCompose(projectName, dbProvider),
    },
    {
      path: "Dockerfile",
      content: generateDockerfile(),
    },
    {
      path: ".env.example",
      content: generateEnvExample(projectName, dbProvider),
    },
    {
      path: ".gitignore",
      content: generateGitignore(),
    },
    {
      path: ".dockerignore",
      content: generateDockerignore(),
    },
    {
      path: "app/api/health/route.ts",
      content: generateHealthEndpoint(),
    },
    {
      path: "scripts/verify.sh",
      content: generateVerifyScript(projectName, dbProvider),
    },
  ];
}
