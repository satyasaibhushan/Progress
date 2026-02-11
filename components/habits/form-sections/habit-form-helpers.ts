import { Task } from "@/types";

export const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export const ALL_DAYS = DAYS_OF_WEEK.map((day) => day.value);

export function flattenTasks(taskList: Task[]): Task[] {
  const flattened: Task[] = [];
  const traverse = (tasks: Task[]) => {
    tasks.forEach((task) => {
      flattened.push(task);
      if (task.children && task.children.length > 0) {
        traverse(task.children);
      }
    });
  };
  traverse(taskList);
  return flattened;
}
