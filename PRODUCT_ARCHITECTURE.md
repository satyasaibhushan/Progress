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
- Subtask model removed - tasks have infinite nesting via parentId
- Tasks are self-referential with parent-child relationships
- Root tasks (parentId = null) are top-level tasks
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

#### **Task** (Hierarchical - replaces Task + Subtask)
```typescript
{
  id: string (UUID)
  title: string
  description: string?
  importance: int (1-100 weightage)
  progress: float (0-100 percentage, manual entry)
  deadline: DateTime?
  groupId: string? (category)
  parentId: string? (null = root task, else = child task)
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
- Root tasks (`parentId = null`) are top-level tasks
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
├── tasks                      (Hierarchical)
│   ├── route.ts              (GET all with filters, POST)
│   │                         (Filters: ?parentId=null for root tasks)
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
│   └── route.ts              (GET suggestion - ✅ implemented)
│                             (Query params: ?limit=N, ?randomize=false)
└── groups
    └── [id]
        └── items
            └── route.ts      (GET all tasks & habits in group with tree structure)
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

### Task Progress (Aggregate-Based Implementation)

#### Current Implementation:
- **Leaf Tasks:** Store manual progress (0-100%) in `progress` field
- **Parent Tasks:** Use aggregate-based calculation with `total_weight` and `weighted_progress` fields
- **Progress Calculation:** `weighted_progress / total_weight` calculated on-demand
- **Automatic Updates:** When leaf task progress/importance changes, aggregates propagate up the hierarchy
- **BIGINT Storage:** Uses BigInt to prevent overflow with large hierarchies

#### Aggregate System:
- Leaf tasks: Store `importance` (weight) and `progress` (0-100)
- Parent tasks: Store `total_weight` (Σ weights of descendant leaves) and `weighted_progress` (Σ(progress × weight))
- Progress calculated on-demand: `weighted_progress / total_weight`
- Changes propagate automatically up the hierarchy

### Habit Progress (Cumulative Implementation)

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

#### Root Task Progress with Linked Habits:
Root tasks use the same aggregate system as parent tasks, with habits contributing to aggregates:
- **Habit Contribution:** Habits linked via `parentTaskId` contribute their `importance` as weight and `completion × importance` as weighted progress
- **Formula:** `weighted_progress / total_weight` where:
  - `total_weight = Σ(child_task.total_weight) + Σ(habit.importance)`
  - `weighted_progress = Σ(child_task.weighted_progress) + Σ(habit.completion × habit.importance)`

**Habit Completion Calculation:**
```typescript
For each linked habit (habit.parentTaskId = task.id):
  - All types use cumulative progress: (total count of all logs / targetCount) × 100
  - Progress is calculated on-demand, not stored
  - Capped at 100%
  - Completion = min(100, (totalLogs / targetCount) × 100)
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
Root Task has:
- 2 Child Tasks: Task1 (total_weight=80, weighted_progress=4800), Task2 (total_weight=40, weighted_progress=3200)
- 2 Linked Habits: Habit1 (importance=50, completion=100%), Habit2 (importance=30, completion=50%)

total_weight = 80 + 40 + 50 + 30 = 200
weighted_progress = 4800 + 3200 + (100×50) + (50×30) = 8000 + 5000 + 1500 = 14500

Root Task Progress = 14500 / 200 = 72.5%
```

### Update Triggers (Implemented)
- **Child task update** → Automatically recalculates parent Task aggregates via `propagateAggregates()`
- **Habit log/update** → Automatically updates parent Task aggregates (if parentTaskId set)
- **Task importance change** → Updates aggregates up the hierarchy
- **Task/habit added/removed** → Updates parent aggregates
- All calculations happen in API routes using `lib/progress-calculator.ts` functions

---

## Suggestion Algorithm

### Algorithm Logic (Implemented)

#### Step 1: Identify Leaf Nodes
```typescript
LeafNodes = {
  - Tasks with no child tasks and no habits (task._count.children === 0 && task._count.habits === 0)
  - All habits (habits are always leaf nodes)
}
```

**Filtering:**
- Only includes items with deadlines (tasks) or endDate (habits)
- Excludes completed items (progress >= 100%)

#### Step 2: Calculate Under-Achievement Score

```typescript
For each leaf node:
  score = importance × (expectedProgress - currentProgress) × randomFactor

Where:
  expectedProgress = (daysPassed / totalDays) × 100
    - daysPassed = currentDate - createdAt
    - totalDays = deadline/endDate - createdAt
  
  progressGap = max(0, expectedProgress - currentProgress)
  
  randomFactor = random(0.8, 1.2) // 20% randomness (optional, can be disabled)
```

**Implementation Details:**
- Uses `createdAt` as start date for both tasks and habits
- Uses `deadline` for tasks, `endDate` for habits as end date
- Progress gap ensures only under-achieved items get positive scores
- Randomness adds variety but can be disabled for deterministic results

#### Step 3: Sort and Return
- Sort all leaf nodes by `score` (descending)
- Return top N results (default: 1)
- No dismissed tracking (as per requirements)

### Suggestion Context (API Response)
Returns suggestion with:
- **Item details:** id, type, title, progress, expectedProgress, progressGap, importance, score
- **Parent task information** (if item is a child)
- **Root task** (traverses up hierarchy to find root task)
- **Group/category** information
- **Labels** associated with the item
- **Deadline/endDate** for reference

### API Endpoint

**GET /api/suggestions**

**Query Parameters:**
- `limit` (optional): Number of suggestions to return (default: 1)
- `randomize` (optional): Enable/disable randomness (default: true, set to "false" to disable)

**Response:**
```json
{
  "data": {
    "id": "task_id",
    "type": "task",
    "title": "Task Title",
    "progress": 30,
    "expectedProgress": 50,
    "progressGap": 20,
    "importance": 80,
    "score": 1600,
    "deadline": "2024-12-31T23:59:59Z",
    "parent": { "id": "...", "title": "...", "progress": 45 },
    "rootTask": { "id": "...", "title": "..." },
    "group": { "id": "...", "name": "...", "color": "#..." },
    "labels": [...]
  }
}
```

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
│   ├── layout.tsx              # Main layout with sidebar and header
│   ├── page.tsx                # Dashboard/Overview with analytics
│   ├── tasks
│   │   ├── page.tsx            # Tasks list with filtering and search
│   │   ├── [id]
│   │   │   ├── page.tsx        # Task detail with hierarchy
│   │   │   └── edit
│   │   │       └── page.tsx    # Edit task
│   │   └── new
│   │       └── page.tsx        # Create task
│   ├── habits
│   │   ├── page.tsx            # Habits list
│   │   ├── [id]
│   │   │   └── edit
│   │   │       └── page.tsx    # Edit habit
│   │   └── new
│   │       └── page.tsx        # Create habit
│   ├── groups
│   │   ├── page.tsx            # Groups list with pagination
│   │   ├── [id]
│   │   │   ├── page.tsx        # Group detail with stats and tree
│   │   │   └── edit
│   │   │       └── page.tsx    # Edit group (modal-based)
│   │   └── new
│   │       └── page.tsx        # Create group
│   ├── labels
│   │   ├── page.tsx            # Labels list with stats (modal-based editing)
│   │   ├── [id]
│   │   │   ├── page.tsx        # Label detail (removed - shown in listing)
│   │   │   └── edit
│   │   │       └── page.tsx    # Edit label (modal-based)
│   │   └── new
│   │       └── page.tsx        # Create label
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
│   ├── dialog.tsx
│   ├── progress.tsx
│   ├── select.tsx
│   ├── calendar.tsx
│   ├── badge.tsx
│   └── [...]
├── layout
│   ├── dashboard-layout.tsx    # Main dashboard wrapper
│   ├── sidebar.tsx             # Navigation sidebar
│   ├── header.tsx              # Top header with user menu
│   └── user-menu.tsx           # User dropdown menu
├── tasks
│   ├── task-card.tsx           # Task card with progress and labels
│   ├── task-form.tsx           # Task create/edit form
│   └── task-tree.tsx           # Hierarchical task display
├── habits
│   ├── habit-card.tsx          # Habit card with progress
│   ├── habit-form.tsx          # Habit create/edit form
│   └── habit-calendar.tsx      # Habit calendar view
├── groups
│   ├── group-card.tsx          # Group card with progress
│   └── group-form.tsx          # Group create/edit form
├── shared
│   ├── tasks-habits-tree.tsx   # Unified tree component for tasks & habits
│   ├── label-selector.tsx      # Label selection component
│   ├── importance-indicator.tsx # Importance visual indicator
│   ├── date-picker.tsx         # Date picker component
│   ├── loading-skeleton.tsx    # Loading skeleton component
│   ├── empty-state.tsx         # Empty state component
│   ├── progress-bar.tsx        # Base progress bar
│   ├── unified-progress-bar.tsx # Unified progress bar styling
│   ├── interactive-progress-bar.tsx # Interactive progress with hover/click
│   └── habit-progress-bar.tsx  # Habit-specific progress bar
├── analytics
│   ├── overview-stats.tsx      # Dashboard overview statistics
│   ├── progress-chart.tsx      # Time-series progress chart
│   ├── group-breakdown.tsx     # Group progress breakdown
│   └── label-stats.tsx         # Label statistics and filtering
└── suggestions
    └── suggestions-carousel.tsx # Suggestions carousel with navigation

/lib
├── prisma.ts                   # Prisma client instance
├── auth.ts                     # NextAuth config
├── utils.ts                    # Utility functions (cn, etc.)
├── api/
│   ├── tasks.ts                # Task API client
│   ├── habits.ts                 # Habit API client
│   ├── groups.ts               # Group API client
│   ├── labels.ts               # Label API client
│   ├── suggestions.ts          # Suggestions API client
│   └── analytics.ts            # Analytics API client
├── inheritance-helpers.ts      # Label/group inheritance logic
├── progress-calculator.ts      # Progress calculation engine
└── suggestion-algorithm.ts     # Suggestion algorithm

/types
└── index.ts                    # Shared TypeScript types (Task, Habit, Group, Label, etc.)
```

### State Management Strategy

#### Server State (Data from DB)
- Client components fetch via API routes using custom API client functions
- API client functions in `/lib/api/*` handle all data fetching
- Data fetched on component mount using `useEffect` hooks
- Optimized updates: Only fetch changed items and their children when updating

#### Client State
- Local component state (`useState`) for UI interactions and form data
- React Context for global UI state:
  - `useHeaderAction` context for dashboard header interactions
  - Session provider for authentication state
- No external state management library needed (Zustand/Redux) - React hooks sufficient

### Data Fetching Patterns

#### Server Components (Default)
```typescript
// Fetch data directly in server component
async function TasksPage() {
  const tasks = await prisma.task.findMany({
    where: {
      userId: session.user.id,
      parentId: null  // Get root tasks
    }
  })
  return <TasksList tasks={tasks} />
}
```

#### Client Components (Interactive)
```typescript
// Fetch via API route
async function TasksPage() {
  // Get root tasks
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
