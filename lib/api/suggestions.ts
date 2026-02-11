import { Group, Label } from "@/types";

export interface Suggestion {
  id: string;
  type: "task" | "habit";
  title: string;
  description?: string;
  progress: number;
  expectedProgress: number;
  progressGap: number;
  importance: number;
  score: number;
  deadline?: string;
  endDate?: string;
  parent?: {
    id: string;
    title: string;
    progress: number;
  };
  rootTask?: {
    id: string;
    title: string;
  };
  group?: Group;
  labels: Label[];
}

export interface SuggestionsOptions {
  limit?: number;
  randomize?: boolean;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.data || data;
}

export async function getSuggestions(options?: SuggestionsOptions): Promise<Suggestion[]> {
  const params = new URLSearchParams();
  if (options?.limit) {
    params.append("limit", options.limit.toString());
  }
  if (options?.randomize !== undefined) {
    params.append("randomize", options.randomize.toString());
  }

  const response = await fetch(`/api/suggestions?${params.toString()}`);
  return handleResponse<Suggestion[]>(response);
}
