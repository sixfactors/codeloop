export interface TaskStep {
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'backlog' | 'planned' | 'in_progress' | 'review' | 'done';
  labels: string[];
  steps: TaskStep[];
  commits: string[];
  acceptanceCriteria?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Board {
  version: 1;
  columns: string[];
  tasks: Task[];
}

export type TaskStatus = Task['status'];

export const COLUMN_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  planned: 'Planned',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

export const COLUMN_COLORS: Record<string, string> = {
  backlog: 'bg-backlog',
  planned: 'bg-planned',
  in_progress: 'bg-in_progress',
  review: 'bg-review',
  done: 'bg-done',
};
