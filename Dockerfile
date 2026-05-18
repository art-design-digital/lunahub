# Dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app

# System-Tools: ghostscript, poppler-utils (pdftotext), binutils (strings), imagemagick
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    poppler-utils \
    binutils \
    imagemagick \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY config.json ./config.json
COPY cli.js ./cli.js

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV CONFIG_PATH=/app/config.json
ENV PORT=3000

EXPOSE 3000
CMD ["node", "build/index.js"]
