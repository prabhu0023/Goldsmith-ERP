import { Notice } from '../ui';
/** The sentence for a route the role may not open (EP-08-S13 AC2); nothing when the request was fine. */
export function RedirectNotice({ notice }: { notice: string | null }) {
  if (!notice) return null;
  return (
    <div className="mb-4">
      <Notice tone="wait">{notice}</Notice>
    </div>
  );
}
