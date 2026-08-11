FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . ./

RUN mkdir -p /app/.mastra /app/.data && chown -R node:node /app

USER node

EXPOSE 4111

# `mastra dev` leaves this PID file in the persisted runtime volume. A stopped
# container can leave it behind, so remove that exact stale lock before boot.
CMD ["sh", "-c", "rm -f /app/.mastra/dev.lock && exec npm run studio"]
