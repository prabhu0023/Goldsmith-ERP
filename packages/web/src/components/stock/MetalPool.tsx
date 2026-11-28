import { useNavigation } from '../../shell/navigation';
import { useSession } from '../../shell/session-context';
import { pagedBoundaryQuery, usePagedQuery } from '../../query/use-paged-query';
import { Button, Card, QueryBoundary, SectionLabel } from '../ui';
import { PoolBalance } from '../pool/PoolBalance';
import { PoolEntryRows } from '../pool/PoolEntryRows';
import { poolListInput, NO_POOL_FILTERS } from '../pool/pool-queries';
/** The metal pool: gold held back for issuing to karigars. Balance on top, the latest movements below, read from the server. */
export function MetalPool({ limit = 8 }: { limit?: number }) {
  const { can } = useSession();
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Metal pool</SectionLabel>
          <p className="mt-1 text-sm text-ink-3">Gold free to issue to a karigar. Scrap marked by the owner comes back here.</p>
        </div>
        <PoolBalance />
      </div>
      {can('listPoolEntries') && <LatestMovements limit={limit} />}
    </Card>
  );
}
function LatestMovements({ limit }: { limit: number }) {
  const { go } = useNavigation();
  const list = usePagedQuery({ op: 'listPoolEntries', input: poolListInput(NO_POOL_FILTERS, limit) });
  return (
    <>
      <QueryBoundary label="latest metal pool movements" query={pagedBoundaryQuery(list)}>
        <PoolEntryRows entries={list.items.slice(0, limit)} emptyText="No movements yet." />
      </QueryBoundary>
      <div className="mt-3">
        <Button onClick={() => go('metal-pool')}>See the whole ledger</Button>
      </div>
    </>
  );
}
