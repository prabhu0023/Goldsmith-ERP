import { CUSTOMER_MESSAGES, dayMonthProblem, normaliseCustomerPhone } from '@goldsmith/shared';
import type { CUSTOMER_GROUPS, OperationInput, OperationResult } from '@goldsmith/shared';
import { MONTHS } from './util';
/** One row of the server's customer directory (listCustomers). */
export type CustomerRow = OperationResult<'listCustomers'>['items'][number];
/** One customer as the drawer reads them (readCustomer). */
export type CustomerDetail = OperationResult<'readCustomer'>['customer'];
export type CustomerGroup = (typeof CUSTOMER_GROUPS)[number];
/** "+919884021107" as "+91 98840 21107". Any other shape is shown as stored. */
export function formatCustomerPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = /^\+91([0-9]{5})([0-9]{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}
/** "14 Mar" from a day and month, or an empty string. */
export function dayMonthText(value: { day: number; month: number } | null | undefined): string {
  if (!value || value.month < 1 || value.month > 12 || value.day < 1) return '';
  return `${value.day} ${MONTHS[value.month - 1]}`;
}
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** "Oct 2026" for an ISO moment, read in the shop's time zone (Asia/Kolkata). Empty when there is no date. */
export function monthYearLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + IST_OFFSET_MS);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "28 Nov 2026, 17:46" from the server's local time text ("2026-11-28T17:46:59.800+05:30"). Other text is shown as it came. */
export function consentTimeLabel(atLocal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(atLocal);
  if (!m) return atLocal;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}, ${m[4]}:${m[5]}` : atLocal;
}
/** "1 piece in all" / "3 pieces in all". */
export const piecesLabel = (count: number): string => `${count} ${count === 1 ? 'piece' : 'pieces'}`;
/** The sentence over a drawer whose customer was changed by someone else since the edit was opened (EP-08-S9 AC3). */
export const CUSTOMER_CHANGED_NOTICE = 'This customer was changed by someone else. Your edits are kept.';
/** The edit form keeps what was typed and the version it was opened with; a newer row version shows the notice. */
export function customerDrawerNotice(openedVersion: number, currentVersion: number): string | null {
  return currentVersion > openedVersion ? CUSTOMER_CHANGED_NOTICE : null;
}
/** What staff type in the add and edit forms, as text. */
export interface CustomerForm {
  name: string;
  phone: string;
  city: string;
  address: string;
  group: CustomerGroup;
  notes: string;
  birthdayDay: string;
  birthdayMonth: string;
  anniversaryDay: string;
  anniversaryMonth: string;
}
export type CustomerField = 'name' | 'phone' | 'city' | 'address' | 'group' | 'dob' | 'anniversary' | 'notes';
const num = (text: string): number | undefined => (text.trim() === '' ? undefined : Number(text));
/** The form's own checks before it calls the server, with the same sentences the server uses (EP-17-S3 AC4, S5). */
export function customerFormErrors(form: CustomerForm): Partial<Record<'name' | 'phone' | 'dob' | 'anniversary', string>> {
  const found: Partial<Record<'name' | 'phone' | 'dob' | 'anniversary', string>> = {};
  if (!form.name.trim()) found.name = CUSTOMER_MESSAGES.name;
  if (normaliseCustomerPhone(form.phone) === null) found.phone = CUSTOMER_MESSAGES.phone;
  const dob = dayMonthProblem('birthday', num(form.birthdayDay), num(form.birthdayMonth));
  if (dob) found.dob = dob;
  const anniversary = dayMonthProblem('anniversary', num(form.anniversaryDay), num(form.anniversaryMonth));
  if (anniversary) found.anniversary = anniversary;
  return found;
}
const dayMonthInput = (day: string, month: string) =>
  day.trim() === '' && month.trim() === '' ? null : { day: num(day), month: num(month) };
/** The fields of createCustomer and updateCustomer. Empty text is sent as null, so an edit can clear a field. */
export function customerFormInput(form: CustomerForm) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    city: form.city.trim() || null,
    address: form.address.trim() || null,
    group: form.group,
    notes: form.notes.trim() || null,
    dob: dayMonthInput(form.birthdayDay, form.birthdayMonth),
    anniversary: dayMonthInput(form.anniversaryDay, form.anniversaryMonth),
  } satisfies Pick<OperationInput<'createCustomer'>, 'name' | 'phone' | 'city' | 'address' | 'group' | 'notes' | 'dob' | 'anniversary'>;
}
/** The form filled from a customer, for the edit form. */
export function formFromCustomer(c: CustomerDetail): CustomerForm {
  return {
    name: c.name,
    phone: c.phone,
    city: c.city ?? '',
    address: c.address ?? '',
    group: c.group,
    notes: c.notes ?? '',
    birthdayDay: c.dob ? String(c.dob.day) : '',
    birthdayMonth: c.dob ? String(c.dob.month) : '',
    anniversaryDay: c.anniversary ? String(c.anniversary.day) : '',
    anniversaryMonth: c.anniversary ? String(c.anniversary.month) : '',
  };
}
type Refusal = { code: string; message: string; field?: string };
/** True when the server refused because another customer already has this phone (EP-17-S4). */
export const duplicatePhoneRefusal = (refusal: Refusal | null): boolean =>
  refusal !== null && refusal.code === 'validation' && refusal.field === 'phone' && refusal.message === CUSTOMER_MESSAGES.duplicatePhone;
const FORM_FIELDS: readonly string[] = ['name', 'phone', 'city', 'address', 'group', 'dob', 'anniversary', 'notes'];
/**
 * Where a refusal of createCustomer or updateCustomer is shown: on its field when the server names
 * one of the form's fields with a validation refusal, else as one sentence beside the button.
 * What was typed is never touched.
 */
export function customerRefusal(refusal: Refusal | null): { field: CustomerField; message: string } | { notice: string } | null {
  if (!refusal) return null;
  if (refusal.code === 'validation' && refusal.field && FORM_FIELDS.includes(refusal.field)) {
    return { field: refusal.field as CustomerField, message: refusal.message };
  }
  return { notice: refusal.message };
}
