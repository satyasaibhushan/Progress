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
│  │  - Hierarchical Tasks Management                    │   │
│  │  - Habits Management & Calendar View                │   │
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
│  │  - /api/tasks               (CRUD)                  │   │
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
│  - Users, Groups, Tasks (hierarchical)                      │
│  - Habits, HabitLogs, Labels                                │
│  - TaskLabel, HabitLabel (join tables)                      │
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
│   Task   │◄──────────┼────────────│  HabitLog    │
│ (Self-   │           │            └──────────────┘
│ Ref: ∞   │           │
│ Hierarchy│           │                    ▲
│ via      │           │                    │
│ parentId)│           │                    │ N:1
└────┬─────┘           │                    │
     │                 │            ┌───────┴──────┐
     │ 1:N             │            │    Habit     │
     │                 │            │ (can have    │
     │                 │            │ parentTaskId)│
     └─────────────────┼───────────>└──────────────┘
                       │
     ┌─────────────────┘
     │ N:M (Labels applied to Tasks and Habits)
     └────────────────────────────────────┐
                                          ▼
                              ┌──────────────────────┐
                              │  TaskLabel           │
                              │  HabitLabel          │
                              └──────────────────────┘

Key Changes:
- Goal model removed - root tasks (parentId = null) are "goals"
- Subtask model removed - tasks have infinite nesting via parentId
- Tasks are self-referential with parent-child relationships
- Habits can be children of tasks via parentTaskId
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
  tasks: Task[]
  habits: Habit[]
}
```

#### **Task** (Hierarchical - replaces Goal + Task + Subtask)
```typescript
{
  id: string (UUID)
  title: string
  description: string?
  importance: int (1-100 weightage)
  progress: float (0-100 percentage, manual entry)
  deadline: DateTime?
  groupId: string? (category)
  parentId: string? (null = root task/"goal", else = child task)
  userId: string
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  user: User
  group: Group?
  parent: Task? (parent task)
  children: Task[] (child tasks, infinite nesting)
  labels: TaskLabel[] (many-to-many)
  habits: Habit[] (habits can be children of tasks)
}
```

**Note:**
- Root tasks (`parentId = null`) effectively serve as "goals"
- Child tasks can have their own child tasks (infinite nesting)
- No separate Subtask model - just tasks with a parentId
- Importance is now 1-100 range (not fixed values)

#### **Habit**
```typescript
{
  id: string (UUID)
  title: string
  description: string?
  type: enum (DAILY, WEEKLY, MONTHLY)
  targetCount: int (required - total cumulative count, can be auto-calculated from endDate)
  importance: int (1-100 weightage)
  endDate: DateTime? (used for auto-calculating targetCount and urgency)
  activeDays: int[] (for WEEKLY habits: [0=Sun, 1=Mon, ..., 6=Sat])
  userId: string
  groupId: string?
  parentTaskId: string? (habit can be child of a task)
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  user: User
  group: Group?
  parentTask: Task? (parent task if this habit belongs to a task)
  labels: HabitLabel[] (many-to-many)
  logs: HabitLog[]
}
```

#### **HabitLog**
```typescript
{
  id: string (UUID)
  habitId: string
  date: Date (date when logged)
  count: int (number of times logged, increments if log exists for date)
  createdAt: DateTime
  updatedAt: DateTime

  // Relations
  habit: Habit

  // Note: All habit types allow multiple logs per day
  // If log exists for a date, count is incremented
  // Progress is cumulative: (total count of all logs / targetCount) × 100
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
  tasks: TaskLabel[] (many-to-many)
  habits: HabitLabel[] (many-to-many)
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
├── tasks                      (Hierarchical - includes "goals")
│   ├── route.ts              (GET all with filters, POST)
│   │                         (Filters: ?parentId=null for roots/"goals")
│   │                         (         ?parentId={id} for children)
│   │                         (         ?groupId={id} for category)
│   │                         (         ?include=children for nested)
│   └── [id]
│       ├── route.ts          (GET, PUT, DELETE)
│       └── labels
│           └── route.ts      (POST add, DELETE remove label)
├── habits
│   ├── route.ts              (GET all with filters, POST)
│   │                         (Filters: ?type={type}, ?groupId={id})
│   │                         (         ?parentTaskId={id})
│   │                         (POST: auto-calculates targetCount from endDate if not provided)
│   │                         (POST: validates activeDays for WEEKLY habits)
│   └── [id]
│       ├── route.ts          (GET, PUT, DELETE)
│       │                     (PUT: auto-calculates targetCount from endDate if changed)
│       ├── log
│       │   └── route.ts      (POST log, GET logs, DELETE log)
│       │                     (POST: increments count if log exists for date)
│       │                     (GET filters: ?startDate=, ?endDate=)
│       └── labels
│           └── route.ts      (POST add, DELETE remove label)
├── labels
│   ├── route.ts              (GET all, POST)
│   └── [id]
│       ├── route.ts          (GET, PUT, DELETE)
│       └── items
│           └── route.ts      (GET all tasks & habits with this label)
├── suggestions
│   └── route.ts              (GET suggestion - to be implemented)
└── analytics
    ├── overview
    │   └── route.ts          (GET dashboard stats - to be implemented)
    ├── by-label
    │   └── route.ts          (GET progress by label - to be implemented)
    └── by-group
        └── route.ts          (GET progress by group - to be implemented)
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

**Note:** With the simplified structure, progress is now manually entered for all tasks (leaf and parent). Future enhancements can implement automatic calculation.

### Task Progress (Current Implementation)

#### Manual Entry:
- All tasks have manual progress entry (0-100%)
- User updates via slider or input
- Progress is stored directly in the `progress` field

### Future: Automatic Progress Calculation

#### When Task Has Child Tasks:
```typescript
taskProgress = (
  Σ(childTask.progress × childTask.importance) /
  Σ(childTask.importance)
)

Where:
- childTask.progress: 0-100
- childTask.importance: 1-100 weightage
```

**Example:**
```
Task has 3 child tasks:
- Child 1: 50% complete, importance 80
- Child 2: 100% complete, importance 60
- Child 3: 0% complete, importance 40

Task Progress = (50×80 + 100×60 + 0×40) / (80 + 60 + 40)
              = (4000 + 6000 + 0) / 180
              = 10000 / 180
              = 55.56%
```

#### Root Task ("Goal") Progress with Linked Habits:
```typescript
rootTaskProgress = (
  (Σ(childTask.progress × childTask.importance) / Σ(childTask.importance)) × taskWeight +
  (habitCompletionRate × habitWeight)
)

Where:
- taskWeight: 0.7 (70% weight to child tasks)
- habitWeight: 0.3 (30% weight to linked habits via parentTaskId)
- habitCompletionRate: percentage of linked habits meeting their targets
```

**Habit Completion Rate Calculation:**
```typescript
For each linked habit (habit.parentTaskId = task.id):
  - All types use cumulative progress: (total count of all logs / targetCount) × 100
  - Progress is calculated on-demand, not stored
  - Capped at 100%

habitCompletionRate = Σ(habitCompletion) / numberOfLinkedHabits
```

**Habit Progress Details:**
- **DAILY:** Can be logged multiple times per day, progress = (total logs / targetCount) × 100
- **WEEKLY:** Can be logged n times per week on specific days (activeDays), progress = (total logs / targetCount) × 100
- **MONTHLY:** Can be logged n times per month, progress = (total logs / targetCount) × 100
- **targetCount:** Required, can be provided manually or auto-calculated from endDate:
  - DAILY: days between start and endDate
  - WEEKLY: count of active days in date range
  - MONTHLY: number of months between start and endDate
- **activeDays:** Required for WEEKLY habits (array of day numbers 0-6)
- **Logging:** All habits allow logging on any day (activeDays used for suggestions only)

**Example:**
```
Root Task ("Goal") has:
- 2 Child Tasks: Task1 (60%, importance 80), Task2 (80%, importance 40)
- 2 Linked Habits: Habit1 (100% - done today), Habit2 (50% - 1/2 daily targets)

Task Progress = (60×80 + 80×40) / (80 + 40) = 8000/120 = 66.67%
Habit Progress = (100 + 50) / 2 = 75%

Root Task Progress = (66.67 × 0.7) + (75 × 0.3)
                   = 46.67 + 22.5
                   = 69.17%
```

### Update Triggers (Future Implementation)
- **Child task update** → Recalculate parent Task progress
- **Habit log** → Recalculate parent Task (if parentTaskId set)
- Calculations will happen in API route or via database triggers

---

## Suggestion Algorithm

### Algorithm Logic

#### Step 1: Identify Leaf Nodes
```typescript
LeafNodes = {
  - Tasks with no child tasks (task.children.length === 0)
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

  labelTaskUnderachievement = {
    Average progress gap of all root tasks/labels this item belongs to
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
- Parent task information (if applicable)
- Root task ("goal") information
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
│   ├── tasks
│   │   ├── page.tsx            # Tasks list (can filter for roots/"goals")
│   │   ├── [id]
│   │   │   └── page.tsx        # Task detail with hierarchy
│   │   └── new
│   │       └── page.tsx        # Create task
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
├── tasks
│   ├── task-card.tsx
│   ├── task-form.tsx
│   ├── task-list.tsx
│   ├── task-tree.tsx           # Hierarchical task display
│   └── task-progress.tsx
├── habits
│   ├── habit-card.tsx
│   ├── habit-form.tsx
│   ├── habit-calendar.tsx
│   ├── habit-log-button.tsx
│   └── progress-indicator.tsx  # Visual for cumulative progress
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
async function TasksPage() {
  const tasks = await prisma.task.findMany({
    where: {
      userId: session.user.id,
      parentId: null  // Get root tasks ("goals")
    }
  })
  return <TasksList tasks={tasks} />
}
```

#### Client Components (Interactive)
```typescript
// Fetch via API route
async function TasksPage() {
  // Get root tasks ("goals")
  const { data } = await fetch('/api/tasks?parentId=null')
  return <TasksList tasks={data} />
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
  tasks    Task[]
  habits   Habit[]
  labels   Label[]

  @@map("users")
}

// ... (other models following similar pattern)
```

### Indexes for Performance

```prisma
model Task {
  // ... fields

  @@index([userId])
  @@index([groupId])
  @@index([parentId])      // For hierarchical queries
  @@index([deadline])
  @@index([createdAt])
  @@map("tasks")
}

model Habit {
  // ... fields

  @@index([userId])
  @@index([groupId])
  @@index([parentTaskId])  // For task-habit relationships
  @@map("habits")
}

model HabitLog {
  // ... fields

  @@index([habitId])
  @@index([completedAt])
  @@map("habit_logs")
}
```

### Database Constraints

- **Foreign Keys:** Cascade delete on user deletion
- **Unique Constraints:**
  - User email
  - TaskLabel (taskId, labelId) combination
  - HabitLabel (habitId, labelId) combination
- **Check Constraints:**
  - Progress values between 0-100
  - Importance values between 1-100
  - targetCount > 0 for all habits (required)
  - activeDays contains values 0-6 for WEEKLY habits
- **Self-Referential Constraint:**
  - Task.parentId references Task.id (allows infinite nesting)
  - Prevents circular references via application logic

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
