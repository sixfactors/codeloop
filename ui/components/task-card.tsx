'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '@/lib/types';
import { cn } from '@/lib/cn';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

const LABEL_COLORS: Record<string, string> = {
  feat: 'bg-purple-500/20 text-purple-300',
  fix: 'bg-red-500/20 text-red-300',
  refactor: 'bg-blue-500/20 text-blue-300',
  docs: 'bg-green-500/20 text-green-300',
  test: 'bg-yellow-500/20 text-yellow-300',
  chore: 'bg-gray-500/20 text-gray-300',
  backend: 'bg-orange-500/20 text-orange-300',
  frontend: 'bg-cyan-500/20 text-cyan-300',
};

function getLabelColor(label: string): string {
  return LABEL_COLORS[label.toLowerCase()] ?? 'bg-gray-500/20 text-gray-300';
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const doneSteps = task.steps.filter(s => s.done).length;
  const totalSteps = task.steps.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing',
        'hover:bg-card-hover transition-colors',
        isDragging && 'opacity-50 shadow-lg shadow-accent/10',
      )}
    >
      <p className="text-sm font-medium text-foreground leading-snug">{task.title}</p>

      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.labels.map(label => (
            <span
              key={label}
              className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', getLabelColor(label))}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {totalSteps > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${(doneSteps / totalSteps) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted">{doneSteps}/{totalSteps}</span>
        </div>
      )}

      {task.commits.length > 0 && (
        <div className="mt-2 flex items-center gap-1">
          <svg className="w-3 h-3 text-muted" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
          </svg>
          <span className="text-[10px] text-muted">{task.commits.length}</span>
        </div>
      )}
    </div>
  );
}
