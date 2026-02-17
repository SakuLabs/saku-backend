# Multi-stage Dockerfile for Hugging Face Spaces
# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Set DATABASE_URL for Prisma generation (use placeholder for build)
# This is only needed for generating the Prisma client, not for actual database connection
ARG DATABASE_URL="postgresql://user:password@localhost:5432/campus_scheduler?schema=public"
ENV DATABASE_URL=${DATABASE_URL}

# Generate Prisma client first (before build, as it's needed for TypeScript compilation)
RUN npx prisma generate

# Build the NestJS application
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7860

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy Prisma schema and migrations
COPY --from=builder /app/prisma ./prisma

# Copy generated Prisma client from builder stage (custom output path)
COPY --from=builder /app/src/generated ./src/generated

# Copy Prisma client from node_modules (for runtime)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Expose Hugging Face default port
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7860/api', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["npm", "run", "start:prod"]
