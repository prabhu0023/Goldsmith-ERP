import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import { formatToken } from '../../domain/edits';
import { cn } from './cn';

interface Props {
  /** Whose phone the token went to, e.g. "Sanjay". */
  recipient: string;
  /** The WhatsApp line before the token, e.g. "JGD: confirm edit to TAG-8841." */
  context: ReactNode;
  /** The token that was sent. null = nothing sent yet. */
  token: string | null;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  validFor?: string;
}

/** Six boxes plus a simulated WhatsApp bubble showing the code the owner would receive. */
export function OtpPanel({ recipient, context, token, value, onChange, error, validFor = '10 minutes' }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');

  const setAt = (i: number, d: string) => {
    const next = value.padEnd(6, ' ').split('');
    next[i] = d || ' ';
    onChange(next.join('').replace(/ +$/, '').replace(/ /g, ''));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i].trim() && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!t) return;
    e.preventDefault();
    onChange(t);
    refs.current[Math.min(t.length, 5)]?.focus();
  };

  return (
    <div className="space-y-4">
      {token && (
        <div className="max-w-sm">
          <p className="mb-1 text-[13px] text-ink-3">To {recipient}'s phone · now</p>
          <div className="rounded-2xl rounded-tl-sm bg-[#dcf8c6] p-3 text-sm text-ink shadow-sm">
            {context} Token <strong className="font-mono text-base tracking-wider">{formatToken(token)}</strong>
          </div>
        </div>
      )}
      <div className="flex gap-2" role="group" aria-label="Six-digit token">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={d.trim()}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(-1);
              setAt(i, v);
              if (v && i < 5) refs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => onKey(i, e)}
            onPaste={onPaste}
            className={cn(
              'h-14 w-11 rounded-lg border bg-surface text-center font-mono text-2xl font-semibold text-ink',
              error ? 'border-stop' : 'border-line-2 focus:border-gold',
            )}
          />
        ))}
      </div>
      <p className="text-[13px] text-ink-3">Two factors: you are signed in, and you hold the phone. Valid {validFor}.</p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-stop">
          {error}
        </p>
      )}
    </div>
  );
}
