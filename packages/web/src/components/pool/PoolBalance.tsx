import { useQuery } from '../../query/use-query';
import { QueryBoundary } from '../ui';
import { poolBalanceQuery } from './pool-queries';
/** The pool balance in grams to four decimals, read from the server (EP-18-S9). */
export function PoolBalance({ size = 'hero' }: { size?: 'hero' | 'body' }) {
  const balance = useQuery(poolBalanceQuery);
  return (
    <QueryBoundary label="metal pool balance" query={balance}>
      {balance.data && (
        <p className="font-mono tabular text-ink">
          <span className={size === 'hero' ? 'text-[26px] font-semibold' : 'text-sm font-medium'}>{balance.data.balanceG}</span>
          <span className="ml-1 text-sm font-normal text-ink-3">g in the metal pool</span>
        </p>
      )}
    </QueryBoundary>
  );
}
