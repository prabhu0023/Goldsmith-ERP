import { useNavigation } from '../../shell/navigation';
import { useSession } from '../../shell/session-context';
import { routeTitles } from '../../nav';
import { Button, Card } from '../ui';
/** What an unwired route shows in production, until its epic connects the screen to the shop's data. */
export function NotWiredYet() {
  const { go } = useNavigation();
  const { landingRoute } = useSession();
  return (
    <Card className="max-w-xl">
      <p className="text-base font-semibold text-ink">This screen is not connected to the shop's data yet.</p>
      <div className="mt-4">
        <Button variant="primary" onClick={() => go(landingRoute)}>
          Go to {routeTitles[landingRoute]}
        </Button>
      </div>
    </Card>
  );
}
