import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AUTH_MESSAGES, PASSWORD_MIN_LENGTH, passwordProblem } from '@goldsmith/shared';
import { Button, Field, Notice } from '../components/ui';
import { authCall } from './auth-api';
import { AuthFrame, authInputCls } from './SignInPage';
type LinkView = 'checking' | 'valid' | 'used' | 'expired' | 'done';
interface Props {
  purpose: 'activation' | 'reset';
  token: string;
  onDone: () => void;
}
const refusalOf = (purpose: Props['purpose'], state: 'used' | 'expired'): string => {
  if (purpose === 'reset') return AUTH_MESSAGES.resetLinkExpired;
  return state === 'used' ? AUTH_MESSAGES.activationLinkUsed : AUTH_MESSAGES.activationLinkExpired;
};
/** Sets a password from an activation (EP-04-S7) or reset (EP-04-S10) link. */
export function SetPasswordPage({ purpose, token, onDone }: Props) {
  const [view, setView] = useState<LinkView>('checking');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void authCall('checkPasswordLink', { token, purpose }).then((answer) => {
      if (!live) return;
      if (answer.ok) setView(answer.data.state);
      else setError(answer.message);
    });
    return () => {
      live = false;
    };
  }, [token, purpose]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    const problem = passwordProblem(password);
    setFieldError(problem ?? undefined);
    if (problem) return;
    setBusy(true);
    const answer = await authCall(purpose === 'activation' ? 'activateAccount' : 'resetPassword', { token, password });
    setBusy(false);
    setPassword('');
    if (answer.ok) setView('done');
    else if (answer.field === 'password') setFieldError(answer.message);
    else setError(answer.message);
  };
  const title = purpose === 'activation' ? 'Set your password' : 'Reset your password';
  return (
    <AuthFrame title={title}>
      {view === 'checking' && !error && <p className="text-sm text-ink-3">Checking the link…</p>}
      {(view === 'used' || view === 'expired') && <Notice tone="stop">{refusalOf(purpose, view)}</Notice>}
      {view === 'valid' && (
        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label="New password" hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} error={fieldError}>
            <input
              className={authInputCls}
              type="password"
              autoComplete="new-password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            Set password
          </Button>
        </form>
      )}
      {view === 'done' && <Notice tone="live">{AUTH_MESSAGES.passwordSet}</Notice>}
      {error && <Notice tone="stop">{error}</Notice>}
      {view !== 'valid' && view !== 'checking' && (
        <Button variant={view === 'done' ? 'primary' : 'secondary'} size="lg" block onClick={onDone}>
          Go to sign in
        </Button>
      )}
    </AuthFrame>
  );
}
