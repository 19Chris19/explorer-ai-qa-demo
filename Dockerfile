FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY public ./public
COPY scripts ./scripts
COPY *.mjs ./
COPY chat-presentation.cjs ./
COPY .env.example ./
RUN npm run build

FROM node:22-bookworm-slim
ARG SOURCE_REVISION=local-dev
ARG RELEASE_VERSION=local-dev
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
LABEL org.opencontainers.image.version=$RELEASE_VERSION
LABEL org.opencontainers.image.source="https://github.com/19Chris19/explorer-ai-qa-demo"
ENV NODE_ENV=production PORT=4317 DEMO_DISABLE_ADMIN=1 DEMO_RUNTIME_DIR=/var/lib/explorer-qa DEMO_RELEASE_REVISION=$SOURCE_REVISION
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./
COPY --chown=node:node deploy/release-config.mjs ./deploy/release-config.mjs
COPY --chown=node:node scripts/prepare-docker-lab.mjs ./scripts/prepare-docker-lab.mjs
RUN npm ci --omit=dev
RUN mkdir -p /var/lib/explorer-qa && chown node:node /var/lib/explorer-qa
USER node
EXPOSE 4317
CMD ["node", "server.mjs"]
