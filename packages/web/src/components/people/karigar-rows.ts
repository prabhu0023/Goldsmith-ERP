import { KARIGAR_MESSAGES, normaliseIndianMobile, WASTAGE_MAX_BP, WASTAGE_MIN_BP } from '@goldsmith/shared';
import type { OperationResult } from '@goldsmith/shared';
/** One row of the owner's karigar directory (listKarigars). `id` is the karigar code ("KG-04"). */
export type KarigarRow = OperationResult<'listKarigars'>['items'][number];
/** The specialties the add form offers; EP-15 makes this list the shop's own (FU-028). */
export const SPECIALTY_CHOICES = ['Chettinad', 'Temple', 'Kundan', 'Polki', 'Antique', 'Jadau', 'Meenakari'] as const;
/** What the directory says about a karigar's portal access. */
export function accountLabel(status: KarigarRow['accountStatus']): string {
  switch (status) {
    case 'none':
      return 'No portal access';
    case 'pending_activation':
      return 'Awaiting activation';
    case 'active':
      return 'Has portal access';
    case 'deactivated':
      return 'Portal access ended';
  }
}
const JOB_STATUS_LABEL = { sent: 'Sent', accepted: 'Accepted', on_bench: 'On the bench', ready: 'Ready', handed_over: 'Handed over' } as const;
/** "On the bench" for a job status. */
export const jobStatusLabel = (status: keyof typeof JOB_STATUS_LABEL): string => JOB_STATUS_LABEL[status];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "6 Nov 2026" from an ISO date or timestamp; read from the text, so no time zone moves the day. */
export function isoDateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${Number(match[3])} ${MONTH_NAMES[Number(match[2]) - 1] ?? ''} ${match[1]}`;
}
/** "0.70" for 70 basis points; whole basis points only, so no float is involved. */
export function bpToPercent(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const hundredths = Math.abs(bp % 100);
  return `${whole}.${String(hundredths).padStart(2, '0')}`;
}
/** "1.42%" for 142 basis points, or "None yet" before a first finished job. */
export const lossLabel = (bp: number | null): string => (bp === null ? 'None yet' : `${bpToPercent(bp)}%`);
/** "+0.62%" or "-0.05%" against the allowance, for the scorecard line. */
export function againstAllowance(lossBp: number, wastageBp: number): string {
  const diff = lossBp - wastageBp;
  return `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${bpToPercent(Math.abs(diff))}%`;
}
/**
 * Percent text to whole basis points by integer math: "0.7" gives 70, "1.12" gives 112, "0.705" gives
 * null. Anything that is not a plain number with at most two decimals gives null.
 */
export function percentToBp(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const hundredths = Number((match[2] ?? '').padEnd(2, '0'));
  return whole * 100 + hundredths;
}
/** True while `bp` is inside the allowed 0.6% to 1.2%. */
export const wastageInRange = (bp: number): boolean => bp >= WASTAGE_MIN_BP && bp <= WASTAGE_MAX_BP;
export type KarigarField = 'name' | 'phone' | 'email' | 'specialties' | 'workshopLocation';
export const KARIGAR_FIELDS: readonly string[] = ['name', 'phone', 'email', 'specialties', 'workshopLocation'];
/** The forms' own checks before they call the server; the server repeats them. */
export function karigarFieldErrors(form: { name: string; phone: string; email: string; specialties: readonly string[] }): Partial<Record<KarigarField, string>> {
  const found: Partial<Record<KarigarField, string>> = {};
  if (!form.name.trim()) found.name = KARIGAR_MESSAGES.nameRequired;
  if (normaliseIndianMobile(form.phone) === null) found.phone = 'Enter a 10-digit mobile number. Their job portal logs in with it.';
  if (!form.email.trim()) found.email = 'Add the email address. The activation link goes there.';
  if (form.specialties.length === 0) found.specialties = KARIGAR_MESSAGES.specialtyRequired;
  return found;
}
/**
 * Where a refusal of a karigar write is shown: on its field when the server names one of the
 * form's fields with a validation refusal, else as one sentence beside the button. What was typed
 * is never touched.
 */
export function karigarRefusal(
  refusal: { code: string; message: string; field?: string } | null,
): { field: KarigarField; message: string } | { notice: string } | null {
  if (!refusal) return null;
  if (refusal.code === 'validation' && refusal.field && KARIGAR_FIELDS.includes(refusal.field)) {
    return { field: refusal.field as KarigarField, message: refusal.message };
  }
  return { notice: refusal.message };
}
/** The sentence over a drawer whose karigar was changed by someone else since it was opened (EP-08-S9 AC3). */
export const KARIGAR_CHANGED_NOTICE = 'This karigar was changed by someone else. Your edits are kept.';
export const karigarDrawerNotice = (openedVersion: number, currentVersion: number): string | null => (currentVersion > openedVersion ? KARIGAR_CHANGED_NOTICE : null);
