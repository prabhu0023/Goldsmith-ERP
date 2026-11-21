import { useState } from 'react';
import type { FormEvent } from 'react';
import { AUTH_MESSAGES } from '@goldsmith/shared';
import { Button, Field, Notice } from '../components/ui';
import { authCall } from './auth-api';
import { AuthFrame, authInputCls } from './SignInPage';
/** Asks for a reset email (EP-04-S10). Every accepted request answers the same sentence. */
export function ForgotPasswordPage({ onBack }: { onBack: () => void }) {
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    const answer = await authCall('requestPasswordReset', { phone });
    setBusy(false);
    if (answer.ok) setSent(true);
    else setError(answer.message);
  };
  return (
    <AuthFrame title="Forgot password" subtitle="We email a link to set a new password.">
      {sent ? (
        <Notice tone="live">{AUTH_MESSAGES.resetRequested}</Notice>
      ) : (
        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label="Phone number">
            <input
              className={authInputCls}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98410 11111"
            />
          </Field>
          {error && <Notice tone="stop">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <Button variant="secondary" size="lg" block onClick={onBack}>
        Back to sign in
      </Button>
    </AuthFrame>
  );
}
