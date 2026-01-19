"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useHeaderAction } from "../layout";
import { getHabits } from "@/lib/api/habits";
import { getHabitLogs, logHabit, deleteHabitLog, updateHabitLogCount } from "@/lib/api/habits";
import { getGroups } from "@/lib/api/groups";
import { getTasks } from "@/lib/api/tasks";
import { getLabels } from "@/lib/api/labels";
import { createHabit, updateHabit, deleteHabit, CreateHabitInput, UpdateHabitInput } from "@/lib/api/habits";
import { Habit, Group, Task, HabitLog, Label } from "@/types";
import { HabitCard } from "@/components/habits/habit-card";
import { HabitCalendar } from "@/components/habits/habit-calendar";
import { HabitForm } from "@/components/habits/habit-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Calendar as CalendarIcon, ListTodo } from "lucide-react";
import { isSameDay, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Calculate streak for a habit
function calculateStreak(logs: HabitLog[]): number {
  if (logs.length === 0) return 0;
  
  // Sort logs by date descending
  const sortedLogs = [...logs].sort((a, b) => {
    const dateA = parseISO(a.date);
    const dateB = parseISO(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  let streak = 0;
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  // Check if today is logged
  const todayLogged = sortedLogs.some(log => {
    const logDate = parseISO(log.date);
    logDate.setHours(0, 0, 0, 0);
    return isSameDay(logDate, currentDate);
  });

  if (!todayLogged) {
    // If today is not logged, start from yesterday
    currentDate.setDate(currentDate.getDate() - 1);
  }

  // Count consecutive days
  for (const log of sortedLogs) {
    const logDate = parseISO(log.date);
    logDate.setHours(0, 0, 0, 0);
    
    if (isSameDay(logDate, currentDate)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (logDate < currentDate) {
      // Gap found, break streak
      break;
    }
  }

  return streak;
}

// Calculate habit progress
function calculateHabitProgress(habit: Habit, logs: HabitLog[]): number {
  const totalCount = logs.reduce((sum, log) => sum + log.count, 0);
  if (habit.targetCount === 0) return 0;
  return Math.min(100, Math.round((totalCount / habit.targetCount) * 100));
}

export default function HabitsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setHeaderRightAction, setHeaderSubtitle } = useHeaderAction();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);
  const [creatingHabit, setCreatingHabit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const habitRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const processedHighlightRef = useRef<string | null>(null);

  // Set header action and subtitle on mount and when habits change
  useEffect(() => {
    setHeaderRightAction(
      <Button onClick={() => setCreatingHabit(true)}>
        <Plus className="w-4 h-4 mr-2" />
        New Habit
      </Button>
    );
    setHeaderSubtitle(habits.length > 0 ? `${habits.length} total` : null);
    return () => {
      setHeaderRightAction(null);
      setHeaderSubtitle(null);
    };
  }, [setHeaderRightAction, setHeaderSubtitle, habits.length]);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch habits with logs included in a single API call
        const [habitsData, groupsData, tasksData, labelsData] = await Promise.all([
          getHabits({ includeLogs: true }),
          getGroups(),
          getTasks({ includeChildren: true, parentId: null }),
          getLabels(),
        ]);
        setHabits(habitsData);
        setGroups(groupsData);
        setTasks(tasksData);
        setLabels(labelsData);
        
        // Extract logs from habits and flatten into a single array
        const allLogs = habitsData
          .filter(habit => habit.habitLogs && habit.habitLogs.length > 0)
          .flatMap(habit => habit.habitLogs!);
        setLogs(allLogs);
        
        // Only set first habit as selected if there's no highlight param
        if (habitsData.length > 0) {
          const urlParams = new URLSearchParams(window.location.search);
          const highlightId = urlParams.get("highlight");
          if (!highlightId) {
            setSelectedHabit(habitsData[0]);
          }
        }
      } catch (error) {
        console.error("Error loading habits:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Handle highlighting from URL params
  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    if (highlightId && habits.length > 0 && processedHighlightRef.current !== highlightId) {
      const habit = habits.find((h) => h.id === highlightId);
      if (habit) {
        // Mark as processed to prevent re-running
        processedHighlightRef.current = highlightId;
        
        // Always select the habit first (this triggers a re-render)
        setSelectedHabit(habit);
        
        // Wait for habit to be selected and rendered, then scroll
        const scrollToHabit = () => {
          const element = habitRefs.current[highlightId];
          if (element && element.offsetParent !== null) {
            // Element is visible in DOM
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            // Add subtle highlighting
            element.classList.add("bg-indigo-50");
            
            // Wait for scroll animation to complete (smooth scroll takes ~500ms)
            // Then remove highlight and URL param
            setTimeout(() => {
              element.classList.remove("bg-indigo-50");
              // Remove highlight parameter from URL after scroll completes
              // Use window.history.replaceState to avoid triggering re-renders
              const params = new URLSearchParams(searchParams.toString());
              params.delete("highlight");
              const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
              window.history.replaceState({}, '', newUrl);
              // Clear processed ref after URL is cleaned
              processedHighlightRef.current = null;
            }, 2000); // Longer highlight duration
            return true;
          }
          return false;
        };
        
        // Wait longer for selection to render (React state update + re-render)
        setTimeout(() => {
          if (!scrollToHabit()) {
            // Retry after a delay
            setTimeout(() => {
              if (!scrollToHabit()) {
                // Final retry
                setTimeout(() => {
                  scrollToHabit();
                }, 500);
              }
            }, 500);
          }
        }, 500); // Increased delay to ensure selection renders
      }
    } else if (!highlightId) {
      // Clear processed ref when highlight param is removed
      processedHighlightRef.current = null;
    }
  }, [searchParams, habits, selectedHabit?.id, router]);

  const [loggingDate, setLoggingDate] = useState<string | null>(null);

  const handleDateClick = async (date: Date, decrease: boolean = false) => {
    if (!selectedHabit || loggingDate) return; // Prevent multiple clicks
    
    // Create date string in YYYY-MM-DD format
    // Use the date components as displayed (don't convert timezone)
    // This ensures we log for the date the user actually clicked
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Create a unique key to prevent duplicate clicks on the same date
    const clickKey = `${selectedHabit.id}-${dateStr}`;
    setLoggingDate(clickKey);
    
    try {
      // Filter logs for the selected habit only
      const selectedHabitLogs = logs.filter(log => log.habitId === selectedHabit.id);
      
      // Find existing log for this date (compare dates properly)
      // Compare using formatted date strings to avoid timezone issues
      const existingLog = selectedHabitLogs.find(log => {
        const logDate = parseISO(log.date);
        // Format both dates consistently for comparison
        const logYear = logDate.getUTCFullYear();
        const logMonth = String(logDate.getUTCMonth() + 1).padStart(2, '0');
        const logDay = String(logDate.getUTCDate()).padStart(2, '0');
        const logDateStr = `${logYear}-${logMonth}-${logDay}`;
        return logDateStr === dateStr;
      });
      
      const countPerPeriod = selectedHabit.countPerPeriod || 1;
      
      if (existingLog && existingLog.habitId === selectedHabit.id) {
        if (decrease && countPerPeriod > 1) {
          // Decrease count (only for countPerPeriod > 1)
          const newCount = existingLog.count - 1;
          if (newCount <= 0) {
            // Delete log if count reaches 0
            await deleteHabitLog(selectedHabit.id, existingLog.id);
          } else {
            // Update log with decreased count
            await updateHabitLogCount(selectedHabit.id, existingLog.id, newCount);
          }
        } else if (countPerPeriod > 1) {
          // Increment count (allow going overboard only if countPerPeriod > 1)
          await logHabit(selectedHabit.id, { 
            date: dateStr + 'T00:00:00.000Z',
            count: 1 
          });
        } else {
          // Delete the log (toggle off for countPerPeriod === 1)
          await deleteHabitLog(selectedHabit.id, existingLog.id);
        }
      } else {
        // Create new log (only if not decreasing)
        if (!decrease) {
          await logHabit(selectedHabit.id, { 
            date: dateStr + 'T00:00:00.000Z',
            count: 1 
          });
        }
      }
      
      // Reload only the updated habit and its logs
      const [habitsData, updatedLogs] = await Promise.all([
        getHabits(),
        getHabitLogs(selectedHabit.id)
      ]);
      
      // Update habits state
      setHabits(habitsData);
      
      // Update logs state: remove old logs for this habit and add new ones
      setLogs(prevLogs => {
        const otherHabitsLogs = prevLogs.filter(log => log.habitId !== selectedHabit.id);
        return [...otherHabitsLogs, ...updatedLogs];
      });
      
      const updated = habitsData.find((h) => h.id === selectedHabit.id);
      if (updated) setSelectedHabit(updated);
    } catch (error: unknown) {
      console.error("Error toggling habit log:", error);
      // If log not found, it might have been deleted already - just reload data for this habit
      if (error instanceof Error && error.message.includes("Log not found") && selectedHabit) {
        // Reload logs for this habit only to sync state
        const [habitsData, updatedLogs] = await Promise.all([
          getHabits(),
          getHabitLogs(selectedHabit.id)
        ]);
        setHabits(habitsData);
        setLogs(prevLogs => {
          const otherHabitsLogs = prevLogs.filter(log => log.habitId !== selectedHabit.id);
          return [...otherHabitsLogs, ...updatedLogs];
        });
      }
    } finally {
      // Clear logging state after operation completes
      // Use a small delay to prevent rapid clicks
      setTimeout(() => {
        setLoggingDate(null);
      }, 300);
    }
  };

  const handleCreate = async (data: any) => {
    setSaving(true);
    try {
      const createData: CreateHabitInput = {
        title: data.title,
        type: data.type,
        targetCount: data.targetCount,
        importance: data.importance,
        description: data.description,
        endDate: data.endDate || undefined,
        activeDays: data.activeDays,
        groupId: data.groupId || undefined,
        parentTaskId: data.parentTaskId || undefined,
        labelIds: data.labelIds,
      };
      await createHabit(createData);
      const habitsData = await getHabits();
      setHabits(habitsData);
      if (habitsData.length > 0 && !selectedHabit) {
        setSelectedHabit(habitsData[0]);
      }
      setCreatingHabit(false);
    } catch (error) {
      console.error("Error creating habit:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: any) => {
    if (!editingHabit) return;
    setSaving(true);
    try {
      const updateData: UpdateHabitInput = {
        id: editingHabit.id,
        title: data.title,
        type: data.type,
        targetCount: data.targetCount,
        importance: data.importance,
        description: data.description,
        endDate: data.endDate || undefined,
        activeDays: data.activeDays,
        groupId: data.groupId || undefined,
        parentTaskId: data.parentTaskId || undefined,
        labelIds: data.labelIds,
      };
      await updateHabit(updateData);
      const habitsData = await getHabits();
      setHabits(habitsData);
      const updated = habitsData.find((h) => h.id === editingHabit.id);
      if (updated) {
        setSelectedHabit(updated);
        setEditingHabit(null);
      }
    } catch (error) {
      console.error("Error updating habit:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingHabit) return;
    try {
      await deleteHabit(deletingHabit.id);
      const habitsData = await getHabits();
      setHabits(habitsData);
      if (deletingHabit.id === selectedHabit?.id) {
        setSelectedHabit(habitsData.length > 0 ? habitsData[0] : null);
      }
      setDeletingHabit(null);
    } catch (error) {
      console.error("Error deleting habit:", error);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  // Calculate progress and streak for selected habit using only its logs
  const selectedHabitLogs = selectedHabit ? logs.filter(log => log.habitId === selectedHabit.id) : [];
  const selectedHabitProgress = selectedHabit ? calculateHabitProgress(selectedHabit, selectedHabitLogs) : 0;
  const selectedHabitStreak = selectedHabit ? calculateStreak(selectedHabitLogs) : 0;

  return (
    <div className="max-w-6xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Create Habit button will be in header via layout */}

      {habits.length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title="No habits yet"
          description="Start building good habits by creating your first one"
          action={{
            label: "Create Habit",
            onClick: () => setCreatingHabit(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Habits List - Left Column */}
          <div className="lg:col-span-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            {habits.map((habit) => {
              // Use habitLogs from habit if available, otherwise filter from logs
              const habitLogs = habit.habitLogs && habit.habitLogs.length > 0 
                ? habit.habitLogs.map(log => ({ ...log, habitId: habit.id }))
                : logs.filter(log => log.habitId === habit.id);
              const habitProgress = calculateHabitProgress(habit, habitLogs);
              const currentCount = habitLogs.reduce((sum, log) => sum + log.count, 0);
              const streak = calculateStreak(habitLogs);
              const group = groups.find((g) => g.id === habit.groupId);
              
              // Find linked task recursively (including child tasks)
              const findTaskRecursive = (taskList: Task[], targetId: string): Task | undefined => {
                for (const task of taskList) {
                  if (task.id === targetId) return task;
                  if (task.children) {
                    const found = findTaskRecursive(task.children, targetId);
                    if (found) return found;
                  }
                }
                return undefined;
              };
              const linkedTask = habit.parentTaskId ? findTaskRecursive(tasks, habit.parentTaskId) : undefined;

              return (
                <div
                  key={habit.id}
                  ref={(el) => {
                    if (el) {
                      habitRefs.current[habit.id] = el;
                    }
                  }}
                >
                  <HabitCard
                    habit={habit}
                    group={group}
                    streak={streak}
                    linkedTaskTitle={linkedTask?.title}
                    isSelected={selectedHabit?.id === habit.id}
                    onClick={() => setSelectedHabit(habit)}
                    onTaskClick={() => {
                      if (linkedTask) {
                        router.push(`/tasks?highlight=${linkedTask.id}`);
                      }
                    }}
                    onEdit={() => setEditingHabit(habit)}
                    onDelete={() => setDeletingHabit(habit)}
                    progress={habitProgress}
                    currentCount={currentCount}
                  />
                </div>
              );
            })}
            </div>
          </div>

          {/* Calendar View - Right Column */}
          {selectedHabit && (
            <div className="lg:col-span-1 flex flex-col h-full min-h-0">
              <Card className="flex flex-col h-full flex-1 min-h-0 !py-3 !gap-0">
                <CardHeader className="flex-shrink-0 !px-4 !pb-1 !pt-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{selectedHabit.title}</CardTitle>
                      {selectedHabit.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {selectedHabit.description}
                        </p>
                      )}
                                {(() => {
                                  // Find linked task recursively (including child tasks)
                                  const findTaskRecursive = (taskList: Task[], targetId: string): Task | undefined => {
                                    for (const task of taskList) {
                                      if (task.id === targetId) return task;
                                      if (task.children) {
                                        const found = findTaskRecursive(task.children, targetId);
                                        if (found) return found;
                                      }
                                    }
                                    return undefined;
                                  };
                                  const linkedTask = selectedHabit.parentTaskId ? findTaskRecursive(tasks, selectedHabit.parentTaskId) : undefined;
                                  return linkedTask ? (
                                    <button
                                      onClick={() => router.push(`/tasks?highlight=${linkedTask.id}`)}
                                      className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 mt-0.5 transition-colors"
                                    >
                                      <ListTodo className="w-4 h-4" />
                                      <span>{linkedTask.title}</span>
                                    </button>
                                  ) : null;
                                })()}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-sm text-muted-foreground">Importance:</span>
                      <ImportanceIndicator
                        importance={selectedHabit.importance}
                        size="md"
                        showValue
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col min-h-0 space-y-2.5 !px-4 !pt-2 !pb-2">
                  {/* Progress Overview */}
                  <div className="bg-muted rounded-lg p-2.5 flex-shrink-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-muted-foreground">Progress</span>
                      <span className="text-sm font-medium">{selectedHabitProgress}%</span>
                    </div>
                    <UnifiedProgressBar
                      value={selectedHabitProgress}
                      interactive={false}
                      showPercentageOnHover={false}
                    />
                              <div className="grid grid-cols-3 gap-2.5 text-sm">
                                <div>
                                  <p className="text-muted-foreground mb-0.5 text-xs">Current</p>
                                  <p className="text-base font-semibold">
                                    {selectedHabitLogs.reduce((sum, log) => sum + log.count, 0)}
                                  </p>
                                </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5 text-xs">Target</p>
                        <p className="text-base font-semibold">
                          {selectedHabit.targetCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5 text-xs">Streak</p>
                        <p className="text-base font-semibold">
                          {selectedHabitStreak} days
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Calendar - Fixed height, not scrollable, occupies remaining space */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <HabitCalendar
                      habit={selectedHabit}
                      logs={selectedHabitLogs}
                      onDateClick={handleDateClick}
                      currentMonth={currentMonth}
                      onMonthChange={setCurrentMonth}
                      isLogging={!!loggingDate}
                    />
                  </div>

                  {/* Labels - Removed to give more space to calendar */}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Create Habit Dialog */}
      <Dialog open={creatingHabit} onOpenChange={setCreatingHabit}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Habit</DialogTitle>
          </DialogHeader>
          <HabitForm
            groups={groups}
            labels={labels}
            availableTasks={tasks}
            onSubmit={handleCreate}
            onCancel={() => setCreatingHabit(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Habit Dialog */}
      <Dialog open={!!editingHabit} onOpenChange={(open) => !open && setEditingHabit(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Habit</DialogTitle>
          </DialogHeader>
          {editingHabit && (
            <HabitForm
              habit={editingHabit}
              groups={groups}
              labels={labels}
              availableTasks={tasks}
              onSubmit={handleEdit}
              onCancel={() => setEditingHabit(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingHabit} onOpenChange={(open) => !open && setDeletingHabit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the habit and all its logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
