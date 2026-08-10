FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV MASTRA_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src/ ./src/

RUN npm run build:mastra

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4111 \
    MASTRA_HOST=0.0.0.0 \
    MASTRA_TELEMETRY_DISABLED=1

RUN mkdir -p /app/data && chown node:node /app/data

COPY --from=builder --chown=node:node /app/.mastra/output/ ./

USER node

EXPOSE 4111

CMD ["node", "index.mjs"]
