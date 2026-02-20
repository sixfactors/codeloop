'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task } from '@/lib/types';
import { COLUMN_LABELS } from '@/lib/types';
import { TaskCard } from './task-card';
import { cn } from '@/lib/cn';

interface ColumnProps {
  id: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const DOT_COLORS: Record<string, string> = {
  backlog: 'bg-backlog',
  planned: 'bg-planned',
  in_progress: 'bg-in_progress',
  review: 'bg-review',
  done: 'bg-done',
};

export function Column({ id, tasks, onTaskClick }: ColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-w-[280px] w-[280px] bg-background rounded-xl border border-border',
        isOver && 'column-drop-active',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
        <div className={cn('w-2 h-2 rounded-full', DOT_COLORS[id] ?? 'bg-muted')} />
        <h3 className="text-sm font-medium text-foreground">{COLUMN_LABELS[id] ?? id}</h3>
        <span className="text-xs text-muted ml-auto">{tasks.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-muted/50">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}
