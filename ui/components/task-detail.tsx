'use client';

import type { Task } from '@/lib/types';
import { COLUMN_LABELS } from '@/lib/types';
import { cn } from '@/lib/cn';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
}

export function TaskDetail({ task, onClose }: TaskDetailProps) {
  const doneSteps = task.steps.filter(s => s.done).length;
  const totalSteps = task.steps.length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Panel */}
      <div
        className="relative w-full max-w-md bg-card border-l border-border h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted font-mono">{task.id}</span>
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                task.status === 'done' ? 'bg-done/20 text-green-300' :
                task.status === 'in_progress' ? 'bg-in_progress/20 text-blue-300' :
                task.status === 'review' ? 'bg-review/20 text-yellow-300' :
                task.status === 'planned' ? 'bg-planned/20 text-purple-300' :
                'bg-backlog/20 text-gray-300'
              )}>
                {COLUMN_LABELS[task.status]}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-foreground">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Description */}
          {task.description && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Description</h3>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Labels */}
          {task.labels.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Labels</h3>
              <div className="flex flex-wrap gap-1.5">
                {task.labels.map(label => (
                  <span key={label} className="text-xs px-2 py-1 rounded-md bg-border text-foreground/70">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Steps */}
          {totalSteps > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Steps ({doneSteps}/{totalSteps})
              </h3>
              <div className="space-y-1.5">
                {task.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={cn(
                      'mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                      step.done
                        ? 'bg-done/20 border-done/40 text-done'
                        : 'border-border'
                    )}>
                      {step.done && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className={cn(step.done && 'line-through text-muted')}>{step.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acceptance Criteria */}
          {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Acceptance Criteria</h3>
              <ul className="space-y-1 text-sm text-foreground/80">
                {task.acceptanceCriteria.map((ac, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted mt-0.5">-</span>
                    <span>{ac}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Commits */}
          {task.commits.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Commits ({task.commits.length})
              </h3>
              <div className="space-y-1">
                {task.commits.map((sha, i) => (
                  <div key={i} className="text-xs font-mono text-accent/80 bg-background rounded px-2 py-1">
                    {sha.slice(0, 7)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="pt-2 border-t border-border">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
              <span>Updated {new Date(task.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
