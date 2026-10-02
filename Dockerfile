FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY public ./public
COPY scripts ./scripts
COPY *.mjs ./
COPY .env.example ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4317 DEMO_DISABLE_ADMIN=1 DEMO_RUNTIME_DIR=/var/lib/explorer-qa
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./
RUN npm ci --omit=dev
RUN mkdir -p /var/lib/explorer-qa && chown node:node /var/lib/explorer-qa
USER node
EXPOSE 4317
CMD ["node", "server.mjs"]
