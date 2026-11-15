import { useState } from 'react';
import { fmtG, netOf } from '../../domain/weights';
import { useStore } from '../../store/StoreProvider';
import type { PieceEdit } from '../../types/jewellery';
import { Button, Card, Notice, OtpPanel, PageHeader, SectionLabel, StatusChip } from '../ui';
import { fieldWords, showValue } from './PieceDrawer';

/** Screen 05, right side: the owner reads the request, takes a token from his own WhatsApp, and applies it. */
export function EditApply() {
  const { state, route, go } = useStore();
  const edit = state.edits.find((e) => e.id === route.params?.editId);
  if (!edit) {
    const pending = state.edits.filter((e) => e.status === 'proposed' || e.status === 'token_sent');
    return (
      <div>
        <PageHeader title="Apply a proposed change" subtitle="Changes staff have asked for, waiting on the owner." />
        <Card>
          {pending.length === 0 ? (
            <p className="text-[15px] text-ink-2">Nothing is waiting. No staff member has asked for a change.</p>
          ) : (
            <ul className="space-y-3">
              {pending.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3">
                  <span className="min-w-[14rem] flex-1 text-[15px] text-ink">
                    <span className="font-mono font-semibold">{e.pieceId}</span> · {fieldWords[e.field]} · {showValue(e.field, e.from)} → {showValue(e.field, e.to)}
                    <span className="block text-sm text-ink-3">asked by {e.proposedBy}</span>
                  </span>
                  <Button variant="primary" onClick={() => go('edit-apply', { editId: e.id })}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }
  return <Apply key={edit.id} edit={edit} />;
}

function Apply({ edit }: { edit: PieceEdit }) {
  const { state, actions, go, role, identity } = useStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const owner = role === 'owner';
  const needToken = state.settings.requireEditToken;
  const piece = state.pieces.find((p) => p.id === edit.pieceId);
  const decided = edit.status === 'applied' || edit.status === 'refused' || edit.status === 'void';

  const weight = edit.field === 'grossG' || edit.field === 'stoneG';
  const after =
    piece && weight
      ? netOf({ grossG: edit.field === 'grossG' ? Number(edit.to) : piece.grossG, stoneG: edit.field === 'stoneG' ? Number(edit.to) : piece.stoneG })
      : null;
  // before an edit lands the piece still has the old figures; afterwards it already shows the new ones
  const beforeNet =
    piece && weight
      ? edit.status === 'applied'
        ? netOf({ grossG: edit.field === 'grossG' ? Number(edit.from) : piece.grossG, stoneG: edit.field === 'stoneG' ? Number(edit.from) : piece.stoneG })
        : netOf(piece)
      : null;
  const first = identity.name.split(' ')[0];

  const agree = () => {
    setError(null);
    const r = actions.ownerAgreeEdit({ editId: edit.id });
    if (!r.ok) setError(r.error ?? 'Could not send a token.');
  };
  const refuse = () => {
    setError(null);
    const r = actions.refuseEdit({ editId: edit.id });
    if (!r.ok) return setError(r.error ?? 'Could not refuse it.');
    go('stock');
  };
  const apply = () => {
    setError(null);
    const r = actions.applyEdit({ editId: edit.id, token: code });
    if (!r.ok) setError(r.error ?? 'Could not apply it.');
  };

  return (
    <div>
      <PageHeader
        title="Apply a proposed change"
        subtitle="Only the owner can apply this, and only with a token from his own WhatsApp."
        actions={<StatusChip kind="edit" value={edit.status} />}
      />
      <div className="max-w-2xl space-y-5">
        <Card className="border-l-4 border-l-wait">
          <SectionLabel className="mb-2">{edit.proposedBy.split(' ')[0]} asks</SectionLabel>
          <p className="text-[15px] font-semibold text-ink">
            <span className="font-mono">{edit.pieceId}</span> {fieldWords[edit.field]} · <span className="font-mono tabular">{showValue(edit.field, edit.from)}</span> →{' '}
            <span className="font-mono tabular">{showValue(edit.field, edit.to)}</span>
          </p>
          <p className="mt-1 text-[15px] text-ink-2">“{edit.reason}”</p>
          {beforeNet !== null && after !== null && (
            <p className="mt-2 text-sm text-ink-2">
              Pure gold would go <span className="font-mono tabular">{fmtG(beforeNet)}</span> → <span className="font-mono tabular">{fmtG(after)}</span> g
            </p>
          )}
        </Card>

        {!owner && !decided && <Notice tone="wait">Waiting for the owner. Only he can agree to this and apply it.</Notice>}

        {edit.status === 'applied' && (
          <Notice tone="live">
            Applied. Pure gold is now {after !== null ? `${fmtG(after)} g` : 'unchanged'}. The change is kept against {edit.proposedBy.split(' ')[0]}'s name, the token and the old and new values.
          </Notice>
        )}
        {edit.status === 'refused' && <Notice tone="wait">Refused. The tag is as it was.</Notice>}
        {edit.status === 'void' && <Notice tone="wait">The piece left stock before this was decided, so the request is void.</Notice>}

        {owner && !decided && (
          <>
            <Card>
              <SectionLabel className="mb-3">1 · Do you agree with the change?</SectionLabel>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" onClick={agree} disabled={needToken && edit.status === 'token_sent'}>
                  {needToken ? 'Yes, send me a token' : 'Yes, I agree'}
                </Button>
                {needToken && edit.status === 'token_sent' && <Button onClick={agree}>Send a new token</Button>}
                <Button variant="danger" onClick={refuse}>
                  Refuse
                </Button>
              </div>
            </Card>

            {needToken && (
              <Card className={edit.status === 'token_sent' ? '' : 'opacity-60'}>
                <SectionLabel className="mb-3">2 · Enter the token sent to your WhatsApp</SectionLabel>
                {edit.status === 'token_sent' ? (
                  <OtpPanel
                    recipient={first}
                    context={`JGD: confirm edit to ${edit.pieceId}.`}
                    token={edit.token}
                    value={code}
                    onChange={(v) => {
                      setCode(v);
                      setError(null);
                    }}
                    error={error ?? undefined}
                  />
                ) : (
                  <p className="text-sm text-ink-3">Agree first, and a token is sent to your phone.</p>
                )}
              </Card>
            )}

            <Card className={!needToken || edit.status === 'token_sent' ? '' : 'opacity-60'}>
              <SectionLabel className="mb-3">{needToken ? '3' : '2'} · Apply it</SectionLabel>
              <p className="mb-3 text-sm text-ink-2">
                {after !== null ? `Pure gold becomes ${fmtG(after)} g. ` : ''}The change is kept against {edit.proposedBy.split(' ')[0]}'s name, your token, and the old and new values.
              </p>
              <Button
                variant="primary"
                size="lg"
                disabled={needToken ? edit.status !== 'token_sent' || code.length !== 6 : false}
                onClick={apply}
              >
                Apply the change
              </Button>
              {!needToken && error && (
                <div className="mt-3">
                  <Notice tone="stop">{error}</Notice>
                </div>
              )}
              {needToken && error && edit.status !== 'token_sent' && (
                <div className="mt-3">
                  <Notice tone="stop">{error}</Notice>
                </div>
              )}
            </Card>
          </>
        )}

        <Button variant="quiet" onClick={() => go('stock', { pieceId: edit.pieceId })}>
          Back to the piece
        </Button>
      </div>
    </div>
  );
}
