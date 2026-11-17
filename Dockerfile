FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages -U yt-dlp \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build Mynil Music (dist/) and Mynil Mono (dist-mono/)
RUN npm run build \
  && cp -r src src.bak \
  && rm -rf src \
  && cp -r src-mono src \
  && npx vite build --outDir dist-mono \
  && rm -rf src \
  && mv src.bak src

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "backend/server.js"]
