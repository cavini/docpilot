# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# A pnpm workspace is awkward to containerise: the API depends on four local
# packages, so a naive `COPY apps/api` builds nothing. The stages below install
# once against the whole lockfile, build the workspace, then ship only what
# running the API needs.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=26.13.0
# Pinned to `packageManager` in the root package.json, because a lockfile is
# only reproducible against the pnpm that wrote it.
ARG PNPM_VERSION=10.11.0

# --- deps -------------------------------------------------------------------
# Manifests only, so this layer is reused whenever source changes but
# dependencies do not - which is almost every deploy.
FROM node:${NODE_VERSION}-slim AS deps
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Installed rather than enabled through corepack, which Node 26 no longer
# ships.
RUN npm install --global pnpm@${PNPM_VERSION}

WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/testing/package.json packages/testing/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/

# `--ignore-scripts`, because the root postinstall builds the workspace and
# there is no source in this layer yet. The native packages it also skips are
# rebuilt in the next stage, where there is.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# --- build ------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo
COPY . .

# What `--ignore-scripts` skipped, narrowed to what compiling the API needs.
# `--recursive` would also run Cypress's postinstall, which downloads and
# unzips a browser runner the API image will never open.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm rebuild @swc/core esbuild

# Only what the API needs. Building the web app here would pull in Next and
# double the image for something Vercel serves.
RUN pnpm --filter @docpilot/shared build \
 && pnpm --filter @docpilot/testing build \
 && pnpm --filter @docpilot/api build

# Prunes the workspace to the API and its real dependencies, rewriting the
# local links into the node_modules it ships with.
RUN pnpm --filter @docpilot/api deploy --prod --legacy /pruned

# --- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production

# Runs as a user that is not root. A container that never needs to write
# outside its own upload directory has no reason to be able to.
RUN useradd --create-home --uid 10001 docpilot
WORKDIR /app

COPY --from=build --chown=docpilot:docpilot /pruned/node_modules ./node_modules
COPY --from=build --chown=docpilot:docpilot /pruned/package.json ./package.json
COPY --from=build --chown=docpilot:docpilot /repo/apps/api/dist ./dist

# Migrations are files, not code: drizzle reads them at release time.
COPY --from=build --chown=docpilot:docpilot /repo/apps/api/drizzle ./drizzle
COPY --from=build --chown=docpilot:docpilot /repo/apps/api/drizzle.config.ts ./drizzle.config.ts

# Where STORAGE_DRIVER=local writes. Ephemeral on a free host, which costs
# nothing that matters: chunks and embeddings live in Postgres, and the
# original bytes are only read while a document is being ingested.
RUN mkdir -p /app/uploads && chown docpilot:docpilot /app/uploads
ENV LOCAL_STORAGE_DIR=/app/uploads

USER docpilot
EXPOSE 3001

# The platform's own health check uses this too, so a container that boots but
# cannot serve is replaced rather than left running.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations first, in the same command, because the free plan has no
# separate release phase. With one instance this is safe; with several it
# would need to move to a release step that runs once.
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/main.js"]
