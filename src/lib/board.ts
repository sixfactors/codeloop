import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join, dirname } from 'path';

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

const DEFAULT_COLUMNS = ['backlog', 'planned', 'in_progress', 'review', 'done'];

export function createBoard(): Board {
  return {
    version: 1,
    columns: [...DEFAULT_COLUMNS],
    tasks: [],
  };
}

export function nextId(board: Board): string {
  if (board.tasks.length === 0) return 't-001';

  const maxNum = board.tasks.reduce((max, t) => {
    const num = parseInt(t.id.replace('t-', ''), 10);
    return num > max ? num : max;
  }, 0);

  return `t-${String(maxNum + 1).padStart(3, '0')}`;
}

export interface AddTaskInput {
  title: string;
  description?: string;
  labels?: string[];
  steps?: TaskStep[];
  acceptanceCriteria?: string[];
}

export function addTask(board: Board, input: AddTaskInput): Board {
  const now = new Date().toISOString();
  const task: Task = {
    id: nextId(board),
    title: input.title,
    description: input.description,
    status: 'backlog',
    labels: input.labels ?? [],
    steps: input.steps ? [...input.steps] : [],
    commits: [],
    acceptanceCriteria: input.acceptanceCriteria,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...board,
    tasks: [...board.tasks, task],
  };
}

export function updateTask(board: Board, id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Board {
  const index = board.tasks.findIndex(t => t.id === id);
  if (index === -1) throw new Error(`Task ${id} not found`);

  const now = new Date().toISOString();
  const updated: Task = {
    ...board.tasks[index],
    ...patch,
    updatedAt: now,
  };

  const tasks = [...board.tasks];
  tasks[index] = updated;

  return { ...board, tasks };
}

export function moveTask(board: Board, id: string, newStatus: Task['status']): Board {
  return updateTask(board, id, { status: newStatus });
}

export function deleteTask(board: Board, id: string): Board {
  const index = board.tasks.findIndex(t => t.id === id);
  if (index === -1) throw new Error(`Task ${id} not found`);

  return {
    ...board,
    tasks: board.tasks.filter(t => t.id !== id),
  };
}

export function getTask(board: Board, id: string): Task | undefined {
  return board.tasks.find(t => t.id === id);
}

const BOARD_PATH = '.codeloop/board.json';

export function loadBoard(dir: string): Board {
  const filePath = join(dir, BOARD_PATH);
  if (!existsSync(filePath)) return createBoard();

  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as Board;
}

export function saveBoard(dir: string, board: Board): void {
  const filePath = join(dir, BOARD_PATH);
  const dirPath = dirname(filePath);

  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(board, null, 2) + '\n', 'utf-8');
  renameSync(tmpPath, filePath);
}
