import type { ErrorCode } from '@goldsmith/shared';
import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { QueryError, QueryStatus } from '../../query/query-client';
import { cn } from './cn';
import { ReadError } from './ReadError';
import { type StateSize, stateText } from './textSize';

export interface BoundaryQuery {
  status: QueryStatus;
  data: unknown;
  error: QueryError | undefined;
  refreshing: boolean;
  refetch: () => unknown;
}

/**
 * One area of a screen and its read (EP-08-S3, S4). While the first answer is on its way it shows
 * a skeleton and "Loading the {label}…", never an empty list. A failed read shows the server's
 * sentence and "Try again" (none for `forbidden`), and the data already held below it. Data that
 * may be out of date after a lost connection carries a "Possibly out of date" line. Each area
 * has its own boundary, so one failing area leaves the others alone.
 */
export function QueryBoundary({
  label,
  query,
  loading,
  size,
  children,
}: {
  label: string;
  query: BoundaryQuery;
  /** Replaces the grey bars with a skeleton shaped like the content. */
  loading?: ReactNode;
  size?: StateSize;
  children: ReactNode;
}) {
  const hasData = query.data !== undefined;
  if (query.status === 'loading' && !hasData) {
    return (
      <div role="status" className="space-y-3">
        <p className={cn('font-medium text-ink-2', stateText(size))}>Loading the {label}…</p>
        {loading ?? (
          <div aria-hidden="true" className="space-y-2">
            <div className="h-10 animate-pulse rounded-lg bg-closed-soft" />
            <div className="h-10 animate-pulse rounded-lg bg-closed-soft" />
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-closed-soft" />
          </div>
        )}
      </div>
    );
  }
  if (query.status === 'failed') {
    return (
      <div className="space-y-3">
        <ReadError
          label={label}
          message={query.error?.message ?? 'The data could not be read.'}
          code={query.error?.code as ErrorCode | undefined}
          onRetry={() => void query.refetch()}
          busy={query.refreshing}
          size={size}
        />
        {hasData && children}
      </div>
    );
  }
  if (query.status === 'possibly_stale') {
    return (
      <div className="space-y-2">
        <p className={cn('flex items-center gap-2 font-semibold text-wait', stateText(size))}>
          <Clock aria-hidden="true" className="size-4 shrink-0" />
          <span>Possibly out of date</span>
        </p>
        {children}
      </div>
    );
  }
  return <>{children}</>;
}
