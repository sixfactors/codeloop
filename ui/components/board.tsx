'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Task, Board as BoardType, TaskStatus } from '@/lib/types';
import { useBoard } from '@/hooks/use-board';
import { Column } from './column';
import { TaskCard } from './task-card';
import { TaskDetail } from './task-detail';
import { cn } from '@/lib/cn';

export function Board() {
  const { board, connected, moveTask } = useBoard();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = (event.active.data.current as { task: Task })?.task;
    if (task) setActiveTask(task);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;

    // Only move if the target is a column (not another task)
    const columns = board?.columns ?? [];
    if (!columns.includes(newStatus)) return;

    // Find the task's current status
    const task = board?.tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    moveTask(taskId, newStatus);
  }, [board, moveTask]);

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  if (!board) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted">Connecting to board...</p>
        </div>
      </div>
    );
  }

  const tasksByColumn = board.columns.reduce<Record<string, Task[]>>((acc, col) => {
    acc[col] = board.tasks.filter(t => t.status === col);
    return acc;
  }, {});

  const totalTasks = board.tasks.length;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">Codeloop Board</h1>
          {totalTasks > 0 && (
            <span className="text-xs text-muted">{totalTasks} task{totalTasks !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-2 h-2 rounded-full',
            connected ? 'bg-done' : 'bg-review animate-pulse',
          )} />
          <span className="text-xs text-muted">{connected ? 'Live' : 'Reconnecting...'}</span>
        </div>
      </header>

      {/* Board */}
      <main className="flex-1 overflow-x-auto p-4">
        {totalTasks === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <div className="text-4xl mb-4 opacity-20">&#9744;</div>
              <h2 className="text-lg font-medium text-foreground/80 mb-2">No tasks yet</h2>
              <p className="text-sm text-muted">
                Tasks appear here when you use <code className="text-accent/80 bg-card px-1 rounded">/plan</code> to create them.
                The board updates in real-time as the agent works.
              </p>
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-full">
              {board.columns.map(col => (
                <Column
                  key={col}
                  id={col}
                  tasks={tasksByColumn[col] ?? []}
                  onTaskClick={handleTaskClick}
                />
              ))}
            </div>

            <DragOverlay>
              {activeTask && (
                <div className="w-[264px] opacity-90">
                  <TaskCard task={activeTask} onClick={() => {}} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetail
          task={
            // Use latest version from board state
            board.tasks.find(t => t.id === selectedTask.id) ?? selectedTask
          }
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
