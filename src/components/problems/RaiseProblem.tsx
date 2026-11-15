import { useState } from 'react';
import { useStore } from '../../store/StoreProvider';
import type { ProblemTarget } from '../../types/jewellery';
import { Button, Modal, Notice, Textarea } from '../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  target: ProblemTarget;
  /** Large touch targets for the karigar phone. */
  large?: boolean;
  onRaised?: () => void;
}

const stops: Record<ProblemTarget['kind'], string> = {
  parcel: 'The parcel stops. Only the owner can start it again.',
  job: 'The job stops. Only the owner can start it again.',
  piece: 'The piece stops being sold. Only the owner can start it again.',
};

/** Say what is wrong. Raising it stops the parcel, job or piece until the owner clears it. */
export function RaiseProblem({ open, onClose, target, large, onRaised }: Props) {
  const { actions } = useStore();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const size = large ? 'lg' : 'md';

  const close = () => {
    setText('');
    setError(null);
    onClose();
  };
  const raise = () => {
    const r = actions.raiseProblem({ target, text });
    if (!r.ok) return setError(r.error ?? 'Could not raise the problem.');
    setText('');
    setError(null);
    onRaised?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Raise a problem"
      footer={
        <>
          <Button variant="secondary" size={size} onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" size={size} onClick={raise}>
            Raise it
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[15px] text-ink-2">
        {stops[target.kind]} <span className="font-mono text-sm text-ink-3">{target.id}</span>
      </p>
      <Textarea aria-label="What is wrong" value={text} onChange={(e) => setText(e.target.value)} placeholder="What is wrong? For example, two kemp stones are loose." />
      {error && (
        <div className="mt-3">
          <Notice tone="stop">{error}</Notice>
        </div>
      )}
    </Modal>
  );
}
