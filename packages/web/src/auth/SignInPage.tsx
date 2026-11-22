import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { AuthResult } from '@goldsmith/shared';
import { Button, Field, Notice } from '../components/ui';
import { authCall } from './auth-api';
import { isSignInFormValid, validateSignInForm } from './sign-in-form';
import type { SignInFormErrors } from './sign-in-form';
/** The centred card every sign-in screen sits in; it fits a karigar's phone. */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-paper px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-4">JGD</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
        <div className="mt-6 space-y-4">{children}</div>
      </div>
    </main>
  );
}
/** Inputs and buttons on these screens are 56 px tall (min-h-14). */
export const authInputCls =
  'w-full min-h-14 rounded-lg border border-line-2 bg-surface px-3 text-[15px] text-ink placeholder:text-ink-4 focus:border-gold';
interface Props {
  /** A sentence shown above the form, such as the session-ended message. */
  notice?: string;
  onSignedIn: (session: AuthResult<'signIn'>) => void;
  onForgot: () => void;
}
/** Phone and password sign-in (EP-04-S3); the server's sentence is shown as is. */
export function SignInPage({ notice, onSignedIn, onForgot }: Props) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<SignInFormErrors>({});
  const [serverError, setServerError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateSignInForm({ phone, password });
    setErrors(found);
    setServerError(undefined);
    if (!isSignInFormValid(found)) return;
    setBusy(true);
    const answer = await authCall('signIn', { phone, password });
    setBusy(false);
    if (answer.ok) {
      onSignedIn(answer.data);
      return;
    }
    setPassword('');
    if (answer.field === 'phone') setErrors({ phoneError: answer.message });
    else setServerError(answer.message);
  };
  return (
    <AuthFrame title="Sign in" subtitle="Use the phone number the shop registered for you.">
      {notice && <Notice tone="wait">{notice}</Notice>}
      <form className="space-y-4" onSubmit={submit} noValidate>
        <Field label="Phone number" error={errors.phoneError}>
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
        <Field label="Password" error={errors.passwordError}>
          <input
            className={authInputCls}
            type="password"
            autoComplete="current-password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {serverError && <Notice tone="stop">{serverError}</Notice>}
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          Sign in
        </Button>
      </form>
      <Button variant="quiet" size="lg" block onClick={onForgot}>
        Forgot password
      </Button>
      <p className="text-[13px] text-ink-3">Karigars: this is also your job portal. Sign in with the phone number your shop has for you.</p>
    </AuthFrame>
  );
}
