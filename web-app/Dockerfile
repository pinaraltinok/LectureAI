# ── Stage 1: Build Frontend ───────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 2: Production Backend + Frontend ────────────────────
FROM node:20-alpine
WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy backend package files and install production deps only
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source code
COPY backend/ .

# Generate Prisma client
RUN npx prisma generate

# Copy frontend build output into backend's public directory
COPY --from=frontend-build /app/frontend/dist ./public

# Cloud Run will set PORT env var (defaults to 3001)
EXPOSE 3001

# Auto-apply schema changes on startup, then start server
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss 2>&1 || echo '[WARN] prisma db push failed'; node src/server.js"]
