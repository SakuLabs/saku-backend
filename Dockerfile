# Multi-stage Dockerfile for Railway (or any container platform)
# Stage 1: Build stage
FROM oven/bun:1.3-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies (including devDependencies for build)
RUN bun install

# Copy source code
COPY . .

# Set DATABASE_URL for Prisma generation (use placeholder for build)
# This is only needed for generating the Prisma client, not for actual database connection
ARG DATABASE_URL="postgresql://user:password@localhost:5432/campus_scheduler?schema=public"
ENV DATABASE_URL=${DATABASE_URL}

# Generate Prisma client first (before build, as it's needed for TypeScript compilation)
RUN bunx prisma generate

# Build the NestJS application using NestJS CLI
RUN bunx nest build

# Verify the build output exists
RUN ls -la dist/ && test -f dist/main.js || (echo "Build failed - dist/main.js not found" && exit 1)

# Stage 2: Production stage
FROM oven/bun:1.3-alpine

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
# Railway injects PORT at runtime; fallback for local docker run
ENV PORT=3001

# Copy package files
COPY package.json bun.lock ./

# Install only production dependencies
RUN bun install --production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Verify the dist directory was copied correctly
RUN ls -la dist/ && test -f dist/main.js || (echo "dist/main.js not found after copy" && exit 1)

# Copy Prisma schema and migrations
COPY --from=builder /app/prisma ./prisma

# Copy generated Prisma client from builder stage (correct path: src/generated/prisma)
COPY --from=builder /app/src/generated ./src/generated

EXPOSE 3001

# Health check — hits the OpenAPI JSON endpoint (no auth needed for spec? actually behind basic auth).
# Use a lightweight TCP-style check instead.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3001) + '/', (r) => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application
CMD ["bun", "run", "start:prod"]
