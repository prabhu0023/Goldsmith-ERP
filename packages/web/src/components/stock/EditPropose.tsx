import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { fmtG, fmtMg, netOf, parseWeight, toU } from '@goldsmith/shared';
import { openEditFor } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { EditableField, Piece } from '@goldsmith/shared';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, Select, Textarea } from '../ui';
import { fieldWords, showValue } from './PieceDrawer';

const FIELDS: { id: EditableField; label: string }[] = [
  { id: 'grossG', label: 'The tag weight' },
  { id: 'stoneG', label: 'The stone weight' },
  { id: 'stoneCount', label: 'The stone count' },
  { id: 'purity', label: 'The purity' },
  { id: 'huid', label: 'The HUID' },
  { id: 'name', label: 'The name' },
];

/** Screen 05, left side: staff describe the change and why. They never touch the field. */
export function EditPropose() {
  const { state, route, go } = useStore();
  const piece = state.pieces.find((p) => p.id === route.params?.pieceId);
  if (!piece) {
    return (
      <div>
        <PageHeader title="Propose a change to a tag" subtitle="Open a piece in Showroom stock and choose Propose edit." />
        <Button variant="primary" onClick={() => go('stock')}>
          Go to showroom stock
        </Button>
      </div>
    );
  }
  return <Form key={piece.id} piece={piece} />;
}

function Form({ piece }: { piece: Piece }) {
  const { state, actions, go, role } = useStore();
  const [field, setField] = useState<EditableField>('grossG');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const open = openEditFor(state, piece.id);

  const from = piece[field];
  const weight = field === 'grossG' || field === 'stoneG';
  const typed = weight ? parseWeight(to) : null;
  const diffG = weight && typed !== null ? Math.round(((toU(typed) - toU(Number(from))) / 100000) * 1e4) / 1e4 : null;
  const afterNet =
    typed !== null && (field === 'grossG' || field === 'stoneG')
      ? netOf({ grossG: field === 'grossG' ? typed : piece.grossG, stoneG: field === 'stoneG' ? typed : piece.stoneG })
      : null;

  const send = () => {
    setError(null);
    let value: string | number = to.trim();
    if (weight) {
      if (typed === null || (field === 'grossG' && typed <= 0)) return setError('Type the new weight in grams, up to four decimals.');
      value = typed;
    } else if (field === 'stoneCount') {
      if (!/^\d+$/.test(value)) return setError('Type the new stone count as a whole number.');
      value = Number(value);
    } else if (!value) {
      return setError('Type the new value.');
    }
    const r = actions.proposeEdit({ pieceId: piece.id, field, to: value, reason });
    if (!r.ok) return setError(r.error ?? 'Could not send it.');
    setSent(true);
  };

  if (sent) {
    return (
      <div>
        <PageHeader title="Sent to the owner" subtitle={`${piece.id} stays sellable while he decides.`} />
        <Card>
          <p className="mb-4 text-[15px] text-ink-2">The owner will read your reason, ask for a token on his own WhatsApp, and apply the change. You will see the tag update in stock.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => go('stock', { pieceId: piece.id })}>
              Back to the piece
            </Button>
            <Button onClick={() => go('stock')}>Showroom stock</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Button variant="quiet" icon={<ArrowLeft size={16} />} className="mb-2 -ml-3" onClick={() => go('stock', { pieceId: piece.id })}>
        Back to the piece
      </Button>
      <PageHeader title="Propose a change to a tag" subtitle="Changing a tag already in the shop: staff ask, the owner does." />
      <div className="max-w-2xl space-y-5">
        <Card>
          <p className="text-[15px] font-semibold text-ink">{piece.name}</p>
          <p className="text-sm text-ink-3">
            <span className="font-mono">{piece.id}</span> · in stock · <span className="font-mono tabular">{fmtG(netOf(piece))} g</span> pure gold
          </p>
        </Card>
        {open ? (
          <Notice tone="wait">
            {open.proposedBy} has already asked to change the {fieldWords[open.field]} on this piece. The owner has to decide that first.
            {role === 'owner' && (
              <>
                {' '}
                <button type="button" className="font-bold underline" onClick={() => go('edit-apply', { editId: open.id })}>
                  Open it
                </button>
              </>
            )}
          </Notice>
        ) : (
          <Card>
            <SectionLabel className="mb-3">What should change?</SectionLabel>
            <div className="space-y-4">
              <Field label="What should change?">
                <Select
                  value={field}
                  onChange={(e) => {
                    setField(e.target.value as EditableField);
                    setTo('');
                  }}
                >
                  {FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm font-semibold text-ink-2">From</p>
                  <p className="flex min-h-11 items-center font-mono text-lg tabular text-ink">{showValue(field, from)}</p>
                </div>
                <Field label="To">
                  <Input
                    inputMode={weight || field === 'stoneCount' ? 'decimal' : 'text'}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder={weight ? '0.0000' : ''}
                    className="font-mono"
                  />
                </Field>
              </div>
              {diffG !== null && diffG !== 0 && (
                <p className="text-sm text-ink-2">
                  {diffG < 0 ? 'Taking off' : 'Adding'} {fmtMg(diffG)}.
                  {afterNet !== null && (
                    <>
                      {' '}
                      Pure gold would go <span className="font-mono tabular">{fmtG(netOf(piece))}</span> → <span className="font-mono tabular">{fmtG(afterNet)}</span> g.
                    </>
                  )}
                </p>
              )}
              <Field label="Why? The owner will read this.">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Re-weighed on the calibrated balance this morning, reads 40 mg lighter than the tag." />
              </Field>
            </div>
            <div className="mt-5 rounded-lg border border-wait/40 bg-wait-soft p-3 text-sm text-ink">
              <p className="font-semibold">You cannot change the weight yourself</p>
              <p>This goes to the owner. The piece stays sellable while he decides.</p>
            </div>
            {error && (
              <div className="mt-4">
                <Notice tone="stop">{error}</Notice>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="primary" size="lg" onClick={send}>
                Send to the owner
              </Button>
              <Button size="lg" onClick={() => go('stock', { pieceId: piece.id })}>
                Cancel
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
