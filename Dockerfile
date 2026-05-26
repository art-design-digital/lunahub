# Dockerfile
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
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

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY config.json ./config.json
COPY cli.js ./cli.js

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV CONFIG_PATH=/app/config.json
ENV VOLUME_PATH=/data/projekte
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000
CMD ["node", "server.js"]
