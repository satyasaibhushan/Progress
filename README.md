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
- 📆 Daily, weekly, and monthly habit types
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
- **Framework:** Next.js 16.1 (App Router)
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
   npm install
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
   docker-compose up -d

   # Or install PostgreSQL manually
   ```

5. **Run migrations**
   ```bash
   npx prisma migrate dev
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

# Database
npx prisma migrate dev        # Run migrations (dev)
npx prisma migrate deploy     # Run migrations (prod)
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
- **Habit:** Habits with daily/weekly/monthly tracking
- **HabitLog:** Individual habit completion logs
- **Group:** Organization groups for tasks and habits
- **Label:** Color-coded labels for categorization

See full schema: [prisma/schema.prisma](./prisma/schema.prisma)

---

