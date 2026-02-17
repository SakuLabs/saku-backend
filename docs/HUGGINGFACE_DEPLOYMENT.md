# Hugging Face Spaces Deployment Guide

This guide explains how to deploy the NestJS backend to Hugging Face Spaces.

## Prerequisites

- A Hugging Face account
- A Space created on Hugging Face (Docker runtime)

## Deployment Steps

### 1. Create a Hugging Face Space

1. Go to [huggingface.co/spaces](https://huggingface.co/spaces)
2. Click "Create new Space"
3. Choose **Docker** as the Space SDK
4. Give your Space a name (e.g., `campus-scheduler-backend`)
5. Set it to **Public** or **Private** based on your needs
6. Click "Create Space"

### 2. Upload Files to Your Space

You can upload files in several ways:

#### Option A: Using Git (Recommended)

```bash
# Clone your Space
git clone https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE_NAME
cd YOUR_SPACE_NAME

# Copy your backend files
cp -r /path/to/backend/* .

# Add and commit
git add .
git commit -m "Initial backend deployment"
git push
```

#### Option B: Using Hugging Face Web Interface

1. Go to your Space page
2. Click "Files and versions"
3. Click "Upload files"
4. Upload these files:
   - `Dockerfile`
   - `package.json`
   - `package-lock.json`
   - All files in `src/` directory
   - `prisma/` directory
   - `.dockerignore`
   - `tsconfig.json`
   - `tsconfig.build.json`
   - `nest-cli.json`

### 3. Configure Environment Variables

Hugging Face Spaces allows you to set environment variables through the web interface:

1. Go to your Space settings
2. Click "Variables" or "Secrets"
3. Add the following environment variables:

**Required Variables:**
```
PORT=7860
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-jwt-secret-key
```

**Optional Variables:**
```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 4. Database Setup

Since Hugging Face Spaces doesn't provide a built-in database, you have several options:

#### Option A: External PostgreSQL Database (Recommended)

Use a cloud database service like:
- [Supabase](https://supabase.com)
- [Neon](https://neon.tech)
- [Railway](https://railway.app)
- [Render](https://render.com)

Set the `DATABASE_URL` environment variable with your connection string.

#### Option B: SQLite for Development

For testing purposes, you can modify the Prisma schema to use SQLite:

```prisma
// In prisma/schema.prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

Then set `DATABASE_URL=file:./dev.db`

### 5. Run Database Migrations

The Dockerfile doesn't automatically run migrations. You have two options:

#### Option A: Manual Migration (Recommended for Production)

1. SSH into your Space (if available) or use the Space's terminal
2. Run: `npx prisma migrate deploy`

#### Option B: Automatic Migration in Dockerfile

Add this to your Dockerfile before the CMD:

```dockerfile
# Run migrations on startup
RUN npx prisma migrate deploy || true
```

### 6. Access Your API

Once deployed, your API will be available at:
```
https://YOUR_USERNAME-YOUR_SPACE_NAME.hf.space
```

API endpoints:
- Main API: `https://YOUR_USERNAME-YOUR_SPACE_NAME.hf.space/`
- Swagger Documentation: `https://YOUR_USERNAME-YOUR_SPACE_NAME.hf.space/api`

## Troubleshooting

### Build Failures

Check the "Logs" tab in your Space to see build errors. Common issues:

1. **Missing dependencies**: Ensure `package-lock.json` is uploaded
2. **Port conflicts**: The Dockerfile sets PORT=7860 by default
3. **Database connection**: Verify DATABASE_URL is correct

### Runtime Errors

1. **Database not connected**: Check DATABASE_URL environment variable
2. **Prisma client not generated**: Ensure `npx prisma generate` runs during build
3. **CORS issues**: Update CORS origins in `src/main.ts` to include your Space URL

### Health Check

The Dockerfile includes a health check that verifies the API is running. You can monitor this in the Space's status indicator.

## Local Testing

Before deploying, test the Docker image locally:

```bash
# Build the image
docker build -t campus-scheduler-backend .

# Run the container
docker run -p 7860:7860 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="your-secret" \
  campus-scheduler-backend
```

## Best Practices

1. **Use environment variables**: Never hardcode secrets in your code
2. **Keep images small**: The multi-stage Dockerfile helps reduce image size
3. **Monitor logs**: Regularly check the Space logs for errors
4. **Update dependencies**: Keep dependencies updated for security
5. **Use HTTPS**: Hugging Face Spaces automatically provides HTTPS

## Additional Resources

- [Hugging Face Spaces Documentation](https://huggingface.co/docs/hub/spaces)
- [NestJS Docker Deployment](https://docs.nestjs.com/faq/docker)
- [Prisma Docker Deployment](https://www.prisma.io/docs/guides/deployment/deploying-to-docker)
