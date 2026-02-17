---
title: Campus Task Manager
emoji: 📅
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# Campus Task Manager Backend

A NestJS-based backend application for managing tasks, schedules, and social features for campus students.

## Features

- **Authentication**: JWT-based user authentication system
- **Task Management**: Create, update, and manage tasks with reminders
- **Schedule Management**: Organize daily schedules and events
- **Chat System**: Real-time WebSocket-based chat functionality
- **Social Features**: Social networking and user interactions

## Tech Stack

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT
- **Real-time**: WebSocket (Socket.io)
- **API Documentation**: Swagger

## Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/campus_db
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=7d
PORT=3000
```

## Installation

```bash
# Install dependencies
bun install

# Generate Prisma client
bun run prisma generate

# Run migrations
bun run prisma migrate dev

# Seed database (optional)
bun run prisma db seed
```

## Running the Application

```bash
# Development mode
bun run start:dev

# Production mode
bun run start:prod
```

## API Documentation

Once the server is running, access the Swagger documentation at:
```
http://localhost:3000/api
```

## Docker Deployment

This application is configured for Docker deployment on Hugging Face Spaces.

```bash
# Build Docker image
docker build -t campus-task-manager .

# Run container
docker run -p 3000:3000 campus-task-manager
```

## Project Structure

```
src/
├── common/           # Shared utilities and decorators
├── modules/          # Feature modules
│   ├── auth/        # Authentication module
│   ├── chat/        # Chat/WebSocket module
│   ├── schedule/    # Schedule management
│   ├── social/      # Social features
│   ├── task/        # Task management
│   └── user/        # User management
├── prisma/          # Prisma service
└── main.ts          # Application entry point
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - User login
- `GET /auth/profile` - Get user profile

### Tasks
- `GET /tasks` - Get all tasks
- `POST /tasks` - Create new task
- `PATCH /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

### Schedule
- `GET /schedule` - Get schedules
- `POST /schedule` - Create schedule
- `PATCH /schedule/:id` - Update schedule
- `DELETE /schedule/:id` - Delete schedule

### Chat
- WebSocket connection at `/chat`
- Real-time messaging support

## License

MIT
