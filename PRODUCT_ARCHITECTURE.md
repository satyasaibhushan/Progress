# Progress App - Product Architecture

## Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Data Model](#data-model)
4. [Architecture Patterns](#architecture-patterns)
5. [API Design](#api-design)
6. [Authentication Flow](#authentication-flow)
7. [Progress Calculation Logic](#progress-calculation-logic)
8. [Suggestion Algorithm](#suggestion-algorithm)
9. [Frontend Architecture](#frontend-architecture)
10. [Database Design](#database-design)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │     Next.js 14+ (App Router) + React + TypeScript   │   │
│  │                                                       │   │
│  │  Components:                                         │   │
│  │  - Dashboard                                         │   │
│  │  - Goals/Tasks/Habits Management                    │   │
│  │  - Calendar View                                     │   │
│  │  - Analytics & Charts                               │   │
│  │  - Suggestion Widget                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Next.js)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │     API Routes (/app/api/*)                         │   │
│  │                                                       │   │
│  │  - /api/auth/[...nextauth]  (Authentication)       │   │
│  │  - /api/groups              (CRUD)                  │   │
│  │  - /api/goals               (CRUD)                  │   │
│  │  - /api/tasks               (CRUD)                  │   │
│  │  - /api/subtasks            (CRUD)                  │   │
│  │  - /api/habits              (CRUD + Logging)        │   │
│  │  - /api/labels              (CRUD)                  │   │
│  │  - /api/suggestions         (Algorithm)             │   │
│  │  - /api/analytics           (Queries)               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                     Business Logic Layer                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  - Progress Calculation Engine                       │   │
│  │  - Suggestion Algorithm                             │   │
│  │  - Validation Logic (Zod schemas)                   │   │
│  │  - Utility Functions                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                      Data Access Layer                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Prisma ORM                               │   │
│  │  - Type-safe queries                                │   │
│  │  - Migrations                                        │   │
│  │  - Relations handling                               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                     │
│  - Users, Groups, Goals, Tasks, Subtasks                    │
│  - Habits, HabitLogs, Labels                                │
│  - Sessions, Accounts                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **UI Library:** React 18+
- **Styling:** Tailwind CSS
- **Component Library:** shadcn/ui
- **State Management:** React Context API + hooks (or Zustand if needed)
- **Forms:** React Hook Form + Zod validation
- **Date Handling:** date-fns
- **Charts:** Recharts

### Backend
- **Runtime:** Node.js (via Next.js)
- **API:** Next.js API Routes (REST)
- **Language:** TypeScript

### Database
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Adapter:** Prisma Adapter for NextAuth

### Authentication
- **Library:** NextAuth.js v5
- **Provider:** Google OAuth 2.0
- **Session Storage:** Database (PostgreSQL via Prisma)

### Development Tools
- **Package Manager:** npm or pnpm
- **Code Quality:** ESLint, Prettier
- **Version Control:** Git

### Deployment
- **Platform:** Vercel (recommended) or Railway/Render
- **Database Hosting:** Neon, Supabase, or Railway

---

## Data Model

### Entity Relationship Diagram

```
┌──────────────┐
│     User     │
└──────┬───────┘
       │
       │ 1:N
       │
       ├─────────────────┬─────────────────┬──────────────┐
       │                 │                 │              │
       ▼                 ▼                 ▼              ▼
┌──────────┐      ┌──────────┐      ┌──────────┐  ┌──────────┐
│  Group   │      │  Label   │      │  Habit   │  │ Account  │
└────┬─────┘      └────┬─────┘      └────┬─────┘  │ (OAuth)  │
     │                 │                  │        └──────────┘
     │ 1:N             │ N:M              │ 1:N
     │                 │                  │
     ▼                 │                  ▼
┌──────────┐           │            ┌──────────────┐
│   Goal   │◄──────────┼────────────│  HabitLog    │
└────┬─────┘           │            └──────────────┘
     │                 │
     │ 1:N             │
     │                 │
     ▼                 │
┌──────────┐           │
│   Task   │◄──────────┤
└────┬─────┘           │
     │                 │
     │ 1:N             │
     │                 │
     ▼                 │
┌──────────┐           │
│ Subtask  │           │
└──────────┘           │
                       │
     ┌─────────────────┘
     │ N:M (Labels applied to Goals, Tasks, Habits)
     └────────────────────────────────────┐
                                          ▼
                              ┌──────────────────────┐
                              │  GoalLabel           │
                              │  TaskLabel           │
                              │  HabitLabel          │
                              └──────────────────────┘

Additional Relations:
- Goal ←→ Habit (N:M): Habits can be linked to goals
```

### Entity Specifications

#### **User**
```typescript
{
  id: string (UUID)
  email: string (unique)
  name: string?
  image: string? (profile picture from Google)
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  groups: Group[]
  goals: Goal[]
  habits: Habit[]
  labels: Label[]
  accounts: Account[] (OAuth)
  sessions: Session[]
}
```

#### **Group/Category**
```typescript
{
  id: string (UUID)
  name: string
  description: string?
  color: string? (hex color for UI)
  userId: string
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  user: User
  goals: Goal[]
  habits: Habit[]
}
```

#### **Goal**
```typescript
{
  id: string (UUID)
  title: string
  description: string?
  deadline: DateTime?
  progress: float (0-100, calculated)
  userId: string
  groupId: string?
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  user: User
  group: Group?
  tasks: Task[]
  labels: Label[] (many-to-many)
  linkedHabits: Habit[] (many-to-many)
}
```

#### **Task**
```typescript
{
  id: string (UUID)
  title: string
  description: string?
  importance: int (33, 66, 100 for green/yellow/red)
  progress: float (0-100, auto from subtasks or manual)
  isManualProgress: boolean (true if no subtasks)
  deadline: DateTime?
  goalId: string
  userId: string
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  user: User
  goal: Goal
  subtasks: Subtask[]
  labels: Label[] (many-to-many)
}
```

#### **Subtask**
```typescript
{
  id: string (UUID)
  title: string
  description: string?
  importance: int (33, 66, 100)
  progress: float (0-100, manual)
  deadline: DateTime?
  taskId: string
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  task: Task
}
```

#### **Habit**
```typescript
{
  id: string (UUID)
  title: string
  description: string?
  type: enum (DAILY, N_PER_DAY, WEEKLY, MONTHLY)
  targetCount: int? (for N_PER_DAY type)
  endDate: DateTime?
  userId: string
  groupId: string?
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  user: User
  group: Group?
  labels: Label[] (many-to-many)
  linkedGoals: Goal[] (many-to-many)
  habitLogs: HabitLog[]
}
```

#### **HabitLog**
```typescript
{
  id: string (UUID)
  habitId: string
  date: Date (day level, no time)
  count: int (number of times logged that day)
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  habit: Habit

  // Unique constraint on (habitId, date)
}
```

#### **Label**
```typescript
{
  id: string (UUID)
  name: string
  color: string? (hex color)
  userId: string
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  user: User
  goals: Goal[] (many-to-many)
  tasks: Task[] (many-to-many)
  habits: Habit[] (many-to-many)
}
```

---

## Architecture Patterns

### 1. **Monolithic Full-Stack Architecture**
- Single codebase for frontend and backend
- Shared TypeScript types across layers
- Simplified deployment and development

### 2. **API-First Approach**
- All data mutations go through API routes
- Clear separation between client and server
- API routes can be versioned if needed

### 3. **Server Components + Client Components**
- Use React Server Components for data fetching
- Client Components for interactivity
- Minimize client-side JavaScript

### 4. **Progressive Enhancement**
- Core functionality works without JavaScript
- Enhanced experience with client-side interactivity

### 5. **Type Safety**
- End-to-end type safety with TypeScript
- Prisma generates database types
- Zod for runtime validation
- Shared types in `/types` directory

---

## API Design

### API Structure

```
/api
├── auth
│   └── [...nextauth]
│       └── route.ts
├── groups
│   ├── route.ts              (GET all, POST)
│   └── [id]
│       └── route.ts          (GET, PUT, DELETE)
├── goals
│   ├── route.ts              (GET all, POST)
│   └── [id]
│       ├── route.ts          (GET, PUT, DELETE)
│       └── progress
│           └── route.ts      (GET calculated progress)
├── tasks
│   ├── route.ts              (GET all, POST)
│   └── [id]
│       ├── route.ts          (GET, PUT, DELETE)
│       └── progress
│           └── route.ts      (PUT manual progress)
├── subtasks
│   ├── route.ts              (GET all, POST)
│   └── [id]
│       └── route.ts          (GET, PUT, DELETE)
├── habits
│   ├── route.ts              (GET all, POST)
│   └── [id]
│       ├── route.ts          (GET, PUT, DELETE)
│       ├── log
│       │   └── route.ts      (POST log entry)
│       └── stats
│           └── route.ts      (GET habit statistics)
├── labels
│   ├── route.ts              (GET all, POST)
│   └── [id]
│       └── route.ts          (GET, PUT, DELETE)
├── suggestions
│   └── route.ts              (GET suggestion)
└── analytics
    ├── overview
    │   └── route.ts          (GET dashboard stats)
    ├── by-label
    │   └── route.ts          (GET progress by label)
    └── by-group
        └── route.ts          (GET progress by group)
```

### API Conventions

#### Request/Response Format
- **Content-Type:** `application/json`
- **Authentication:** Session-based via NextAuth

#### Standard Responses

**Success (200 OK):**
```json
{
  "data": { /* entity or array */ },
  "message": "Optional success message"
}
```

**Created (201 Created):**
```json
{
  "data": { /* created entity */ },
  "message": "Resource created successfully"
}
```

**Error (4xx, 5xx):**
```json
{
  "error": "Error message",
  "details": { /* optional validation errors */ }
}
```

#### Authentication
- All API routes (except auth) require authentication
- Use `getServerSession()` to validate user
- Return 401 Unauthorized if not authenticated

#### Authorization
- Users can only access their own data
- Filter all queries by `userId`
- Validate ownership on mutations

---

## Authentication Flow

### Google OAuth Flow with NextAuth.js

```
┌──────────┐                 ┌──────────────┐                ┌──────────┐
│  User    │                 │   Next.js    │                │  Google  │
│ (Browser)│                 │  (NextAuth)  │                │   OAuth  │
└────┬─────┘                 └───────┬──────┘                └────┬─────┘
     │                               │                            │
     │  1. Click "Sign in with      │                            │
     │     Google"                   │                            │
     ├──────────────────────────────>│                            │
     │                               │                            │
     │  2. Redirect to Google        │                            │
     │     OAuth                     │                            │
     │                               ├───────────────────────────>│
     │                               │                            │
     │  3. Google Login Page         │                            │
     │<──────────────────────────────┼────────────────────────────┤
     │                               │                            │
     │  4. User approves             │                            │
     ├───────────────────────────────┼───────────────────────────>│
     │                               │                            │
     │  5. Authorization code        │                            │
     │<──────────────────────────────┼────────────────────────────┤
     │                               │                            │
     │  6. Callback to NextAuth      │                            │
     ├──────────────────────────────>│                            │
     │                               │                            │
     │                               │  7. Exchange code for      │
     │                               │     access token           │
     │                               ├───────────────────────────>│
     │                               │                            │
     │                               │  8. Access token +         │
     │                               │     User info              │
     │                               │<───────────────────────────┤
     │                               │                            │
     │                               │  9. Create/update user     │
     │                               │     in database            │
     │                               │                            │
     │  10. Set session cookie       │                            │
     │      Redirect to dashboard    │                            │
     │<──────────────────────────────┤                            │
     │                               │                            │
```

### Session Management
- **Type:** Database sessions (stored in PostgreSQL)
- **Duration:** 30 days (configurable)
- **Storage:** Session table via Prisma
- **Cookie:** HttpOnly, Secure, SameSite

### Protected Routes
- Middleware checks session on protected routes
- Redirect to login if not authenticated
- Store original URL for post-login redirect

---

## Progress Calculation Logic

### Task Progress Calculation

#### When Task Has Subtasks:
```typescript
taskProgress = (
  Σ(subtask.progress × subtask.importance) /
  Σ(subtask.importance)
)

Where:
- subtask.progress: 0-100
- subtask.importance: 33 (green), 66 (yellow), or 100 (red)
```

**Example:**
```
Task has 3 subtasks:
- Subtask 1: 50% complete, Red importance (100)
- Subtask 2: 100% complete, Yellow importance (66)
- Subtask 3: 0% complete, Green importance (33)

Task Progress = (50×100 + 100×66 + 0×33) / (100 + 66 + 33)
              = (5000 + 6600 + 0) / 199
              = 11600 / 199
              = 58.29%
```

#### When Task Has No Subtasks:
- Manual progress entry (0-100%)
- User updates via slider

### Goal Progress Calculation

```typescript
goalProgress = (
  (Σ(task.progress × task.importance) / Σ(task.importance)) × taskWeight +
  (habitCompletionRate × habitWeight)
)

Where:
- taskWeight: 0.7 (70% weight to tasks)
- habitWeight: 0.3 (30% weight to linked habits)
- habitCompletionRate: percentage of linked habits meeting their targets
```

**Habit Completion Rate Calculation:**
```typescript
For each linked habit:
  - DAILY: completed if logged today
  - N_PER_DAY: (logsToday / targetCount) × 100
  - WEEKLY: completed if logged ≥ 1 day this week
  - MONTHLY: completed if logged ≥ 1 day this month

habitCompletionRate = Σ(habitCompletion) / numberOfLinkedHabits
```

**Example:**
```
Goal has:
- 2 Tasks: Task1 (60%, Red), Task2 (80%, Green)
- 2 Linked Habits: Habit1 (100% - done today), Habit2 (50% - 1/2 daily targets)

Task Progress = (60×100 + 80×33) / (100 + 33) = 8640/133 = 64.96%
Habit Progress = (100 + 50) / 2 = 75%

Goal Progress = (64.96 × 0.7) + (75 × 0.3)
              = 45.47 + 22.5
              = 67.97%
```

### Update Triggers
- **Subtask update** → Recalculate parent Task
- **Task update** → Recalculate parent Goal
- **Habit log** → Recalculate linked Goals
- Calculations happen in API route before response

---

## Suggestion Algorithm

### Algorithm Logic

#### Step 1: Identify Leaf Nodes
```typescript
LeafNodes = {
  - Tasks with no incomplete subtasks
  - All habits
}
```

#### Step 2: Calculate Under-Achievement Score

```typescript
For each leaf node:
  underAchievementScore = (
    deadlineUrgency × 0.4 +
    progressGap × 0.4 +
    labelGoalUnderachievement × 0.2
  ) × randomFactor

Where:
  deadlineUrgency = {
    No deadline: 0
    Overdue: 100
    Due today: 90
    Due this week: 70
    Due this month: 50
    Due later: 30
  }

  progressGap = {
    expectedProgress = (daysPassed / totalDays) × 100
    actualProgress = current progress
    gap = max(0, expectedProgress - actualProgress)
  }

  labelGoalUnderachievement = {
    Average progress gap of all goals/labels this item belongs to
  }

  randomFactor = random(0.8, 1.2) // 20% randomness
```

#### Step 3: Sort and Return
- Sort all leaf nodes by `underAchievementScore` (descending)
- Return top result
- Track dismissed suggestions to avoid repeating

### Suggestion Context
Return suggestion with:
- Leaf node (task/habit) details
- Parent goal information
- Group/category
- Labels
- Reason for suggestion
- Expected vs actual progress visualization

---

## Frontend Architecture

### Component Structure

```
/app
├── (auth)
│   ├── login
│   │   └── page.tsx
│   └── layout.tsx
├── (dashboard)
│   ├── layout.tsx              # Main layout with sidebar
│   ├── page.tsx                # Dashboard/Overview
│   ├── goals
│   │   ├── page.tsx            # Goals list
│   │   ├── [id]
│   │   │   └── page.tsx        # Goal detail
│   │   └── new
│   │       └── page.tsx        # Create goal
│   ├── habits
│   │   ├── page.tsx            # Habits list
│   │   ├── [id]
│   │   │   └── page.tsx        # Habit detail with calendar
│   │   └── new
│   │       └── page.tsx        # Create habit
│   ├── analytics
│   │   └── page.tsx            # Analytics dashboard
│   └── settings
│       └── page.tsx            # User settings
└── api
    └── [...]                   # API routes (see API Design)

/components
├── ui                          # shadcn/ui components
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   └── [...]
├── layout
│   ├── sidebar.tsx
│   ├── header.tsx
│   └── navigation.tsx
├── goals
│   ├── goal-card.tsx
│   ├── goal-form.tsx
│   ├── goal-list.tsx
│   └── goal-progress.tsx
├── tasks
│   ├── task-item.tsx
│   ├── task-form.tsx
│   ├── task-list.tsx
│   └── subtask-list.tsx
├── habits
│   ├── habit-card.tsx
│   ├── habit-form.tsx
│   ├── habit-calendar.tsx
│   ├── habit-log-button.tsx
│   └── filling-circle.tsx     # Visual for n-per-day
├── shared
│   ├── label-selector.tsx
│   ├── importance-selector.tsx
│   ├── progress-bar.tsx
│   ├── date-picker.tsx
│   └── loading-skeleton.tsx
├── analytics
│   ├── overview-stats.tsx
│   ├── progress-chart.tsx
│   └── label-breakdown.tsx
└── suggestions
    └── suggestion-widget.tsx

/lib
├── prisma.ts                   # Prisma client instance
├── auth.ts                     # NextAuth config
├── utils.ts                    # Utility functions
├── validations.ts              # Zod schemas
├── progress-calculator.ts      # Progress logic
└── suggestion-algorithm.ts     # Suggestion logic

/types
├── index.ts                    # Shared TypeScript types
└── api.ts                      # API request/response types
```

### State Management Strategy

#### Server State (Data from DB)
- Use React Server Components for initial data
- Client components fetch via API routes
- Consider using SWR or React Query for caching (optional)

#### Client State
- Local component state for UI interactions
- React Context for global UI state (theme, sidebar collapsed, etc.)
- Zustand if complex client state needed (unlikely for MVP)

### Data Fetching Patterns

#### Server Components (Default)
```typescript
// Fetch data directly in server component
async function GoalsPage() {
  const goals = await prisma.goal.findMany({
    where: { userId: session.user.id }
  })
  return <GoalsList goals={goals} />
}
```

#### Client Components (Interactive)
```typescript
// Fetch via API route
async function GoalsPage() {
  const { data } = await fetch('/api/goals')
  return <GoalsList goals={data} />
}
```

---

## Database Design

### Prisma Schema Structure

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  emailVerified DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts Account[]
  sessions Session[]
  groups   Group[]
  goals    Goal[]
  tasks    Task[]
  habits   Habit[]
  labels   Label[]

  @@map("users")
}

// ... (other models following similar pattern)
```

### Indexes for Performance

```prisma
model Goal {
  // ... fields

  @@index([userId])
  @@index([groupId])
  @@index([deadline])
  @@index([createdAt])
}

model Task {
  // ... fields

  @@index([userId])
  @@index([goalId])
  @@index([deadline])
}

model HabitLog {
  // ... fields

  @@unique([habitId, date])
  @@index([habitId])
  @@index([date])
}
```

### Database Constraints

- **Foreign Keys:** Cascade delete on user deletion
- **Unique Constraints:**
  - User email
  - HabitLog (habitId, date) combination
- **Check Constraints:**
  - Progress values between 0-100
  - Importance values in [33, 66, 100]
  - Target count > 0 for N_PER_DAY habits

---

## Security Considerations

### Authentication Security
- **Session Management:** Secure, HttpOnly cookies
- **CSRF Protection:** Built into NextAuth
- **OAuth Tokens:** Never exposed to client

### Authorization
- **Row-Level Security:** All queries filtered by userId
- **API Route Protection:** Validate user session on every request
- **Client-Side Validation:** UX only, never trust client

### Data Validation
- **Input Validation:** Zod schemas on all API inputs
- **SQL Injection:** Prevented by Prisma ORM
- **XSS Protection:** React escapes by default

### Environment Variables
- Never commit `.env.local`
- Use separate credentials for dev/prod
- Rotate secrets regularly

---

## Performance Optimization

### Database
- Proper indexing on foreign keys and query fields
- Use `select` to fetch only needed fields
- Pagination for large lists
- Connection pooling (Prisma built-in)

### Frontend
- Server Components for initial render
- Code splitting (Next.js automatic)
- Image optimization (Next.js Image component)
- Lazy load non-critical components

### API
- Efficient Prisma queries (avoid N+1)
- Response caching where appropriate
- Rate limiting (consider if public)

---

## Monitoring & Observability

### Logging
- Server-side errors logged to console
- Client-side errors caught by error boundaries
- Consider: Sentry for production error tracking

### Analytics
- Optional: Vercel Analytics
- Optional: Google Analytics for user behavior

### Performance Monitoring
- Vercel Speed Insights
- Core Web Vitals tracking

---

## Deployment Architecture

### Vercel Deployment

```
┌─────────────────────────────────────────┐
│          Vercel Edge Network             │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │     Next.js Application            │ │
│  │  - Server Components               │ │
│  │  - API Routes                      │ │
│  │  - Static Assets                   │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│      PostgreSQL Database (Neon)         │
│  - Production data                      │
│  - Automatic backups                    │
│  - Connection pooling                   │
└─────────────────────────────────────────┘
```

### Environment Variables in Production
```
DATABASE_URL=postgresql://...
NEXTAUTH_URL=https://yourdomain.com
NEXTAUTH_SECRET=random_secret_here
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## Future Scalability

### Horizontal Scaling
- Stateless API design enables multiple instances
- Database connection pooling
- CDN for static assets

### Vertical Scaling
- Database can scale resources as needed
- Serverless functions auto-scale

### Potential Microservices
If app grows significantly:
- Separate suggestion algorithm service
- Separate analytics service
- Message queue for async operations

---

## Development Workflow

### Local Development
1. Clone repository
2. Install dependencies: `npm install`
3. Set up `.env.local` with local PostgreSQL
4. Run migrations: `npx prisma migrate dev`
5. Start dev server: `npm run dev`

### Git Workflow
- Feature branches for new features
- Pull requests for code review
- Merge to main triggers deployment

### Testing Strategy
- Unit tests for utility functions
- Integration tests for API routes
- E2E tests for critical user flows (optional for MVP)

---

## Conclusion

This architecture provides:
- **Scalability:** Can handle growth in users and data
- **Maintainability:** Clear separation of concerns
- **Type Safety:** End-to-end TypeScript
- **Developer Experience:** Modern tooling and patterns
- **Performance:** Optimized at every layer
- **Security:** Best practices for auth and data protection

Ready to implement step by step!
