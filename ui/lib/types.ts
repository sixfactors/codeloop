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

export interface CardEvent {
  at: string;
  actor: string;
  human: boolean;
  action: string;
  stage?: string;
  note?: string;
}

export interface LaneCard {
  id: string;
  title: string;
  lane: string;
  laneVersion: number;
  stage: string;
  spec?: string;
  /** Where the board serves the card's mock, when it has one. */
  mock?: string;
  gate?: string;
  awaiting?: string;
  retries: Record<string, number>;
  evidence: string[];
  events: CardEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface LaneStage {
  id: string;
  skill?: string;
  output?: string;
  gate?: { name: string; approver: string; outward?: boolean };
}

export interface CardsPayload {
  version: number;
  owner: boolean;
  cards: LaneCard[];
  lanes: { id: string; version: number; stages: LaneStage[] }[];
  inbox: { summary: string; needs_you: { id: string; read?: string; last_check: string }[] };
}
