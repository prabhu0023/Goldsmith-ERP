import { AuthGate } from './auth/AuthGate';
import { SignedInApp } from './shell/SignedInApp';
export default function App() {
  return <AuthGate>{(session, actions) => <SignedInApp key={session.user.userId} session={session} actions={actions} />}</AuthGate>;
}
