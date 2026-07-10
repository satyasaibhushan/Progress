# Progress - Personal Task & Habit Tracker

A full-stack productivity application built with Next.js for managing tasks, habits, groups, and labels with hierarchical organization and progress tracking.

## ✨ Features

### Task Management
- 📋 Hierarchical task structure with unlimited nesting
- 🎯 Progress tracking with automatic inheritance
- 📅 Start dates and deadlines
- 🏷️ Labels and groups for organization
- 🔍 Global search across all tasks

### Habit Tracking
- 📆 Daily, weekly, monthly, and yearly habit types
- 🔥 Streak tracking
- 📊 Visual calendar view with progress indicators
- 🎯 Target count and current count tracking
- 📈 Progress visualization

### Organization
- 📁 Groups for categorizing tasks and habits
- 🏷️ Custom colored labels
- 🔗 Link habits to parent tasks
- 🔄 Automatic progress inheritance in task hierarchies

### User Experience
- 🔐 Secure authentication with Google OAuth
- 🎨 Clean, modern UI with Tailwind CSS
- 📱 Responsive design
- 🚀 Fast search with debouncing
- 📊 Real-time progress updates

## 🛠️ Tech Stack

### Frontend
- **Framework:** Next.js 16.2 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4.0
- **UI Components:** Radix UI, Shadcn/ui
- **Forms:** React Hook Form + Zod
- **Icons:** Lucide React

### Backend
- **Runtime:** Node.js 20
- **Database:** PostgreSQL 16
- **ORM:** Prisma 6.19
- **Authentication:** NextAuth.js 5.0
- **API:** Next.js API Routes

### DevOps
- **Deployment:** Vercel / AWS Lightsail
- **Database Hosting:** Neon / Self-hosted
- **Containerization:** Docker
- **Reverse Proxy:** Nginx (for self-hosted)

---

## 📦 Local Development Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ (or Docker)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/satyasaibhushan/Progress.git
   cd Progress
   ```

2. **Install dependencies**
   ```bash
   npm ci
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add:
   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/progress_db"
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-here"  # Generate: openssl rand -base64 32
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   ```

4. **Set up database**
   ```bash
   # Using Docker (recommended for development)
   docker compose up -d

   # Or install PostgreSQL manually
   ```

5. **Run migrations**
   ```bash
   npm run db:deploy
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

7. **Open browser**
   - Navigate to `http://localhost:3000`
   - Sign in with Google

---

## 📚 Project Structure

```
Progress/
├── app/                      # Next.js app directory
│   ├── (dashboard)/         # Dashboard layout group
│   │   ├── tasks/          # Tasks page
│   │   ├── habits/         # Habits page
│   │   ├── groups/         # Groups page
│   │   └── labels/         # Labels page
│   ├── api/                # API routes
│   │   ├── auth/          # NextAuth handlers
│   │   ├── tasks/         # Task endpoints
│   │   ├── habits/        # Habit endpoints
│   │   ├── groups/        # Group endpoints
│   │   ├── labels/        # Label endpoints
│   │   └── search/        # Search endpoint
│   └── layout.tsx         # Root layout
├── components/              # React components
│   ├── tasks/             # Task components
│   ├── habits/            # Habit components
│   ├── groups/            # Group components
│   ├── labels/            # Label components
│   ├── shared/            # Shared components
│   ├── layout/            # Layout components
│   └── ui/                # Shadcn UI components
├── lib/                    # Utility libraries
│   ├── api/               # API client functions
│   ├── validations/       # Zod schemas
│   ├── prisma.ts          # Prisma client
│   ├── auth.ts            # NextAuth config
│   └── utils.ts           # Helper functions
├── prisma/                 # Database
│   └── schema.prisma      # Database schema
├── scripts/                # Deployment scripts
│   ├── deploy.sh          # Production deployment
│   ├── backup.sh          # Database backup
│   ├── restore.sh         # Database restore
│   └── monitor.sh         # System monitoring
└── public/                 # Static assets
```

---

## 📝 Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run typecheck    # Run TypeScript checks
npm test             # Run unit tests
npm run test:integration # Verify database invariants (requires DATABASE_URL)
npm run verify       # Run tests, lint, and type checks
npm run db:reconcile # Repair cached habit/task progress from source data

# Database
npm run db:deploy             # Run committed migrations (prod)
npx prisma migrate dev        # Create and run migrations (dev)
npx prisma studio             # Open Prisma Studio
npx prisma generate           # Generate Prisma Client

# Deployment (Self-hosted)
./scripts/deploy.sh    # Deploy to production
./scripts/backup.sh    # Backup database
./scripts/restore.sh   # Restore database
./scripts/monitor.sh   # View system stats
```

---

## 🗄️ Database Schema

Key models:
- **User:** User accounts (Google OAuth)
- **Task:** Hierarchical task structure with progress tracking
- **Habit:** Habits with daily/weekly/monthly/yearly tracking
- **HabitLog:** Individual habit completion logs
- **Group:** Organization groups for tasks and habits
- **Label:** Color-coded labels for categorization

See full schema: [prisma/schema.prisma](./prisma/schema.prisma)

### Data consistency

- Habit logs are the source of truth for habit counts and progress. A database trigger keeps the cached `currentCount` value synchronized.
- A task's progress is derived from its descendant leaf tasks and directly linked habits. Parent caches are reconciled after every hierarchy, importance, progress, or habit-log change.
- Labels and groups inherited through a task hierarchy retain provenance, so reparenting or detaching an item removes only inherited organization and preserves direct choices.
- A task or habit cannot escape an ancestor's date bounds. Reconciliation repairs older rows after migrations.

After upgrading an existing database, deploy migrations and run one reconciliation pass:

```bash
npm run db:deploy
npm run db:reconcile
```

The API smoke-test scripts require an explicit authenticated cookie and never contain a reusable token:

```bash
SESSION_COOKIE='authjs.session-token=…' ./tests/test-apis.sh
```

The cleanup helper additionally requires `ALLOW_DESTRUCTIVE_CLEANUP=true`.

---
