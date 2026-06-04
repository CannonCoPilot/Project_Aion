# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx tsc

# Stage 3: Production
FROM node:20-alpine AS production
RUN apk add --no-cache wget git \
    && git config --global --add safe.directory /aiprojects
WORKDIR /app

# Install server production dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy built assets
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy types (needed at runtime for imports)
COPY server/types.ts ./server/

ENV NODE_ENV=production
ENV PORT=8600
EXPOSE 8600

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8600/api/health || exit 1

WORKDIR /app/server
CMD ["node", "dist/index.js"]
