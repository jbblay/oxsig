# syntax=docker/dockerfile:1.7
# OXSIG production image for AWS (ECS Fargate behind an ALB).
#
# Runs the custom server (server.mjs): Next.js plus the native WebSocket
# terminal bridge, so the Vercel-only experimental_upgradeWebSocket route is
# never used off Vercel. Build for Graviton with --platform linux/arm64.
#
#   docker build --platform linux/arm64 \
#     --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_... \
#     --build-arg NEXT_PUBLIC_SENTRY_DSN=https://... \
#     -t oxsig:$(git rev-parse --short HEAD) .

ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Public, build-time inlined values only. Never pass secrets as build args.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build && pnpm prune --prod

FROM ${NODE_IMAGE} AS runtime
# node-postgres verifies TLS against Node's CA store, which does not include the
# Amazon RDS CA. Trust the RDS bundle so DATABASE_URL can use sslmode=verify-full.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem \
    OXSIG_HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts /app/server.mjs ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts ./scripts
# server.mjs imports the terminal-bridge ticket and workspace-control modules directly.
COPY --from=build --chown=node:node /app/src/lib/labs ./src/lib/labs
# Migrations ship with the image so the same artifact runs `pnpm db:migrate` as a one-off ECS task.
COPY --from=build --chown=node:node /app/migrations ./migrations
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "scripts/start-production.mjs", "--prod"]
