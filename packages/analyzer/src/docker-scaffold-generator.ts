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

function generateDockerCompose(
  projectName: string,
  dbProvider: "mysql" | "postgresql",
): string {
  const dbService =
    dbProvider === "mysql"
      ? `  db:
    image: mysql:8.0
    restart: unless-stopped
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: ${projectName}
      MYSQL_USER: appuser
      MYSQL_PASSWORD: apppassword
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
      - "5432:5432"
    environment:
      POSTGRES_DB: ${projectName}
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: apppassword
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d ${projectName}"]
      interval: 10s
      timeout: 5s
      retries: 5`;

  const dbDataVolume =
    dbProvider === "mysql"
      ? "db_data:/var/lib/mysql"
      : "db_data:/var/lib/postgresql/data";

  const dbPort = dbProvider === "mysql" ? "3306" : "5432";

  return `version: "3.9"

services:
${dbService}

  app:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=\${DATABASE_URL}
      - AUTH_SECRET=\${AUTH_SECRET}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    command: ["sh", "-c", "npx prisma migrate deploy && node server.js"]

volumes:
  db_data:
`;
}

function generateDockerfile(): string {
  return `# Stage 1: Install dependencies
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:20-slim AS runner
WORKDIR /app

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
  const dbUrl =
    dbProvider === "mysql"
      ? `mysql://USER:PASSWORD@HOST:3306/${projectName}`
      : `postgresql://USER:PASSWORD@HOST:5432/${projectName}`;

  return `# Database connection
DATABASE_URL="${dbUrl}"

# Auth secret — generate with: openssl rand -base64 32
AUTH_SECRET="your-secret-here"
`;
}

function generateGitignore(): string {
  return `# dependencies
node_modules/

# next.js
.next/
out/

# env files
.env
.env.local
.env.*.local

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
.env
.env.local
*.md
docker-compose*.yml
.dockerignore
`;
}

function generateHealthEndpoint(): string {
  return `import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw\`SELECT 1\`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
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
  ];
}
