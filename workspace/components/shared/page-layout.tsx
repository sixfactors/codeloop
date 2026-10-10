// Copied from chanl-admin components/page-layout.tsx. Dropped: the bulk-selection context (no
// bulk actions here) and the chanl Icon wrapper (lucide icons render directly). Breadcrumbs use the
// ui/breadcrumb primitive the app already ships instead of hand-written links. Same anatomy:
// breadcrumbs · 56px icon tile (back link when backHref) · title · description · badges · actions
// · tabs · content. Padding is the screen-margin token (20px → px-5) at every width.

import type { ReactNode } from 'react';
import { Fragment } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

export interface PageBreadcrumb {
  label: string;
  href?: string;
}

interface PageLayoutProps {
  icon?: LucideIcon;
  title: string | ReactNode;
  description?: string | ReactNode;
  actions?: ReactNode;
  actionsLoading?: boolean;
  contentClassName?: string;
  headerClassName?: string;
  breadcrumbs?: PageBreadcrumb[];
  badge?: ReactNode;
  tabs?: ReactNode;
  backHref?: string;
  children: ReactNode;
  className?: string;
}

export function PageLayout({
  icon: Icon,
  title,
  description,
  actions,
  actionsLoading,
  contentClassName,
  headerClassName,
  breadcrumbs,
  badge,
  tabs,
  backHref,
  children,
  className,
}: PageLayoutProps) {
  const renderActions = () => {
    if (actionsLoading) {
      return (
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      );
    }
    return actions ? <div className="flex items-center gap-2">{actions}</div> : null;
  };

  const iconNode = Icon ? <Icon className="size-6" /> : null;

  return (
    <div className={cn('flex h-full flex-col space-y-4 px-5 py-5', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                <BreadcrumbItem>
                  {crumb.href ? <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink> : <BreadcrumbPage>{crumb.label}</BreadcrumbPage>}
                </BreadcrumbItem>
                {i < breadcrumbs.length - 1 ? <BreadcrumbSeparator /> : null}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-3', headerClassName)} data-testid="page-header">
        {/* basis-full on phones: three action buttons otherwise crush the title to a letter a line. */}
        <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
          {Icon &&
            (backHref ? (
              <Link
                href={backHref}
                className="group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:text-primary"
                data-testid="page-back-icon"
                aria-label="Back"
              >
                <span className="transition-opacity duration-150 group-hover:opacity-0">{iconNode}</span>
                <ArrowLeft className="absolute h-6 w-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
              </Link>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-sm">{iconNode}</div>
            ))}
          <div className="min-w-0 flex-1">
            {typeof title === 'string' ? (
              <h2 className="line-clamp-2 text-xl font-semibold tracking-tight wrap-break-word sm:text-2xl" data-testid="page-title" title={title}>{title}</h2>
            ) : (
              <div className="line-clamp-2 min-w-0 text-xl font-semibold tracking-tight wrap-break-word sm:text-2xl" data-testid="page-title">{title}</div>
            )}
            {description && <div className="mt-0.5 line-clamp-2 text-sm text-muted-foreground wrap-break-word" data-testid="page-description">{description}</div>}
            {badge && <div className="mt-2 flex flex-wrap items-center gap-2 gap-y-1" data-testid="page-badges">{badge}</div>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{renderActions()}</div>
      </div>

      {tabs && <div className="pt-2">{tabs}</div>}

      <div className={cn('-mx-1 flex-1 px-1', contentClassName)}>{children}</div>
    </div>
  );
}
