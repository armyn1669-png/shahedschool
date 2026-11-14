# School site (Next.js 16 monorepo) — container deploy for hosts that build
# from a Dockerfile (e.g. dadehat PaaS). Node 22 is required
# (apps/web engines: >=22.13). Env vars (Turso URL/token, setup token,
# REGISTRATION_HOURLY_LIMIT) are passed by the host, never baked in.
# NOTE: not build-tested locally (no Docker on this VM); the host build is the test.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "run", "start"]
