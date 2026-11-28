import { useState } from 'react';
import type { ReactNode } from 'react';
import { fmtDateTime } from '@goldsmith/shared';
import { fmtG, netOf } from '@goldsmith/shared';
import { daysInStock, openEditFor } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { EditableField, Piece } from '@goldsmith/shared';
import { ProblemBanner } from '../problems/ProblemBanner';
import { RaiseProblem } from '../problems/RaiseProblem';
import { Button, DetailDrawer, DrawerSection, Modal, Notice, StatusChip, Textarea, WeightReadout } from '../ui';
import { ValueSlot } from '../ui/ValueSlot';

export const fieldWords: Record<EditableField, string> = {
  grossG: 'weight on the scale',
  stoneG: 'stone weight',
  stoneCount: 'stone count',
  purity: 'purity',
  huid: 'HUID',
  name: 'name',
};
const isWeight = (f: EditableField): boolean => f === 'grossG' || f === 'stoneG';
export const showValue = (f: EditableField, v: string | number): string => (isWeight(f) ? `${fmtG(Number(v))} g` : String(v));

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="text-[15px] font-medium text-ink">{children}</dd>
    </div>
  );
}

/** The right-hand drawer for one piece: the pure gold first, the facts, and what you can do with it. */
export function PieceDrawer({ piece, onClose }: { piece: Piece | null; onClose: () => void }) {
  const { state, go, role, now } = useStore();
  const [raising, setRaising] = useState(false);
  const [scrapping, setScrapping] = useState(false);
  if (!piece) return null;

  const karigar = state.karigars.find((k) => k.id === piece.madeById);
  const edits = state.edits.filter((e) => e.pieceId === piece.id);
  const open = openEditFor(state, piece.id);
  const scrap = state.scrapRequests.find((r) => r.pieceId === piece.id && r.status === 'pending');
  const out = piece.stockOutId ? state.stockOuts.find((o) => o.id === piece.stockOutId) : undefined;
  const lead = piece.heldForLeadId ? state.leads.find((l) => l.id === piece.heldForLeadId) : undefined;
  const live = piece.status === 'in_stock';
  const closed = piece.status === 'billed' || piece.status === 'scrapped';

  const actions = (
    <>
      {live && (
        <Button size="sm" variant="primary" disabled={!!open} onClick={() => go('edit-propose', { pieceId: piece.id })}>
          Propose edit
        </Button>
      )}
      {live && (
        <Button size="sm" onClick={() => go('stock-out', { pieceId: piece.id })}>
          Take out of stock
        </Button>
      )}
      {live && !piece.heldForLeadId && (
        <Button size="sm" onClick={() => setScrapping(true)}>
          Ask to scrap
        </Button>
      )}
      {scrap && role === 'owner' && (
        <Button size="sm" variant="primary" onClick={() => go('scrap-decision', { requestId: scrap.id })}>
          Decide on the scrap request
        </Button>
      )}
      {!closed && (
        <Button size="sm" variant="danger" onClick={() => setRaising(true)}>
          Raise a problem
        </Button>
      )}
      {closed && <p className="text-sm text-ink-3">This piece is closed. Its weights are frozen.</p>}
    </>
  );

  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        title={piece.name}
        subtitle={
          <>
            {piece.collection || piece.style || piece.kind}
            {piece.size && <> · {piece.size}</>}
          </>
        }
        hero={{
          label: 'Pure gold in this piece',
          value: <WeightReadout g={netOf(piece)} size="hero" className="items-start text-left" />,
          note: `${fmtG(piece.grossG)} g on the scale, minus ${fmtG(piece.stoneG)} g of stones, pearls and lac`,
        }}
        actions={actions}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip kind="piece" value={lead && live ? 'held' : piece.status} />
          {piece.status === 'in_stock' && <span className="text-sm text-ink-3">{daysInStock(piece, now)} days old</span>}
        </div>
        <ValueSlot value={piece.valueINR} label="Value" className="mb-4" />

        <div className="mb-4 space-y-2">
          <ProblemBanner target={{ kind: 'piece', id: piece.id }} />
          {open && (
            <Notice tone="wait">
              {open.proposedBy} asked to change the {fieldWords[open.field]}: {showValue(open.field, open.from)} → {showValue(open.field, open.to)}. Waiting for the owner.
              {role === 'owner' && (
                <>
                  {' '}
                  <button type="button" className="font-bold underline" onClick={() => go('edit-apply', { editId: open.id })}>
                    Open it
                  </button>
                </>
              )}
            </Notice>
          )}
          {scrap && (
            <Notice tone="wait">
              {scrap.requestedBy} asked to scrap this piece. Waiting for the owner. It cannot be sold meanwhile.
            </Notice>
          )}
          {lead && live && <Notice tone="wait">Held for {lead.customerName}.</Notice>}
        </div>

        <DrawerSection title="The facts" defaultOpen>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label="Tag">
              <span className="font-mono">{piece.id}</span>
            </Fact>
            <Fact label="BIS hallmark">
              <span className="font-mono">{piece.huid || 'not entered'}</span>
            </Fact>
            <Fact label="Purity">{piece.purity}</Fact>
            <Fact label="Made by">{karigar ? `${karigar.name} (${karigar.id})` : 'not recorded'}</Fact>
            <Fact label="Came in with">
              {piece.parcelId ? (
                <button type="button" className="font-mono text-gold-ink underline" onClick={() => go('parcel-match', { parcelId: piece.parcelId ?? '' })}>
                  {piece.parcelId}
                </button>
              ) : (
                'not recorded'
              )}
            </Fact>
            <Fact label="Days in stock">{piece.inStockAt === null ? 'not in stock yet' : `${daysInStock(piece, now)} days`}</Fact>
          </dl>
        </DrawerSection>

        <DrawerSection title={`Weight breakdown · ${piece.stoneCount} inclusion${piece.stoneCount === 1 ? '' : 's'}`}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label="On the scale">
              <span className="font-mono tabular">{fmtG(piece.grossG)} g</span>
            </Fact>
            <Fact label="Stones, pearls, lac">
              <span className="font-mono tabular">{fmtG(piece.stoneG)} g</span>
            </Fact>
            <Fact label="Pure gold">
              <span className="font-mono tabular">{fmtG(netOf(piece))} g</span>
            </Fact>
            <Fact label="Weighed on">{state.scales.find((s) => s.id === piece.scaleId)?.name ?? piece.scaleId}</Fact>
          </dl>
        </DrawerSection>

        <DrawerSection title={`Edit history · ${edits.length} entr${edits.length === 1 ? 'y' : 'ies'}`}>
          {edits.length === 0 ? (
            <p>No edits. The weights are as tagged.</p>
          ) : (
            <ul className="space-y-3">
              {edits.map((e) => (
                <li key={e.id}>
                  <p className="font-semibold text-ink">
                    {fieldWords[e.field]}: {showValue(e.field, e.from)} → {showValue(e.field, e.to)}
                  </p>
                  <p className="text-ink-3">
                    {e.proposedBy} · {fmtDateTime(e.proposedAt)} · {e.reason}
                  </p>
                  <StatusChip kind="edit" value={e.status} />
                </li>
              ))}
            </ul>
          )}
        </DrawerSection>

        {out && (
          <DrawerSection title="Stock-out record" defaultOpen>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Sold by">{out.sellerName}</Fact>
              <Fact label="When">{fmtDateTime(out.at)}</Fact>
              <Fact label="Reference">
                <span className="font-mono">{out.ref}</span>
              </Fact>
              <Fact label="Tax invoice">
                <span className="font-mono">{out.invoiceNo}</span>
              </Fact>
            </dl>
          </DrawerSection>
        )}

        <DrawerSection title="Description and photos">
          {piece.photos.length > 0 && (
            <ul className="mb-3 grid grid-cols-3 gap-2">
              {piece.photos.map((src, i) => (
                <li key={i}>
                  <img src={src} alt={`${piece.name}, photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                </li>
              ))}
            </ul>
          )}
          <p>{piece.note || 'No description added.'}</p>
        </DrawerSection>

        {role !== 'owner' && live && <p className="mt-4 text-sm text-ink-3">Changing a tag needs the owner's WhatsApp code. You propose, the owner applies.</p>}
      </DetailDrawer>

      <RaiseProblem open={raising} onClose={() => setRaising(false)} target={{ kind: 'piece', id: piece.id }} />
      <AskToScrap open={scrapping} onClose={() => setScrapping(false)} piece={piece} />
    </>
  );
}

function AskToScrap({ open, onClose, piece }: { open: boolean; onClose: () => void; piece: Piece }) {
  const { actions } = useStore();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };
  const send = () => {
    const r = actions.requestScrap({ pieceId: piece.id, reason });
    if (!r.ok) return setError(r.error ?? 'Could not send the request.');
    close();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Ask to scrap this piece"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={send}>
            Send to the owner
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[15px] text-ink-2">
        {piece.name} <span className="font-mono text-sm text-ink-3">{piece.id}</span> comes off the floor while the owner decides. Only the owner can mark it scrap, and then its pure gold ({fmtG(netOf(piece))} g) goes back to the metal pool.
      </p>
      <Textarea aria-label="Why scrap it" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? For example, 140 days unsold, damaged clasp." />
      {error && (
        <div className="mt-3">
          <Notice tone="stop">{error}</Notice>
        </div>
      )}
    </Modal>
  );
}
