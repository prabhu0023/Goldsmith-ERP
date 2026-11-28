/**
 * Customer master rules shared by web and api (EP-17): the groups, the consent vocabulary, the
 * phone normaliser, the day-and-month check for birthdays and anniversaries, and the sentences a
 * person sees when a customer is refused. The migration that rewrites stored phones
 * (`*_ep17_customer_master.sql`) applies the same phone rule in SQL.
 */
export const CUSTOMER_GROUPS = ['VIP Bridal', 'High net worth', 'Regular', 'Wholesale'] as const;
export const CONSENT_KINDS = ['opt_in', 'opt_out'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];
/** Where a consent event came from. `whatsapp_reply` and `import` are written by the server only. */
export const CONSENT_SOURCES = ['counter', 'whatsapp_reply', 'form', 'import'] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];
/** The sources staff can name when they record consent. */
export const STAFF_CONSENT_SOURCES = ['counter', 'form'] as const;
export type StaffConsentSource = (typeof STAFF_CONSENT_SOURCES)[number];
/** The name an erased customer keeps (EP-17-S13). */
export const ERASED_CUSTOMER_NAME = 'Erased customer';
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;
/**
 * A customer phone as "+<country><number>", or null when it cannot be one. Only the digits count.
 * Fewer than 10 digits or more than 15 refuse. 10 digits are an Indian number ("+91" is added),
 * 11 digits starting 0 drop the 0 and get "+91", any other 11 to 15 digits keep their own country
 * code. Unlike normaliseIndianMobile (staff logins) it does not insist on a 6 to 9 first digit.
 */
export function normaliseCustomerPhone(text: string): string | null {
  const digits = text.replace(/[^0-9]/g, '');
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(-10)}`;
  return `+${digits}`;
}
/** Every sentence a person sees when a customer is refused (EP-17-S3, S4, S5, S13). */
export const CUSTOMER_MESSAGES = {
  name: 'Add the customer name.',
  phone: 'Add a phone number with at least 10 digits. It is also the WhatsApp number.',
  duplicatePhone: 'A customer with this phone number already exists.',
  birthdayPair: 'Give both the day and the month of the birthday, or neither.',
  anniversaryPair: 'Give both the day and the month of the anniversary, or neither.',
  birthdayDate: 'That birthday is not a real date. Check the day and the month.',
  anniversaryDate: 'That anniversary is not a real date. Check the day and the month.',
  deletionRequestRef: 'Add the deletion request reference.',
  deletionReason: 'Add the reason for erasing this customer.',
} as const;
export type DayMonthLabel = 'birthday' | 'anniversary';
/** Days in each month of the leap-year placeholder (2000) used to store a day and month. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
/**
 * The sentence that refuses a day and month, or null when both are empty or both name a real date
 * (29 Feb counts). One without the other gives the "both, or neither" sentence.
 */
export function dayMonthProblem(
  label: DayMonthLabel,
  day: number | null | undefined,
  month: number | null | undefined,
): string | null {
  const hasDay = day !== null && day !== undefined;
  const hasMonth = month !== null && month !== undefined;
  if (!hasDay && !hasMonth) return null;
  if (!hasDay || !hasMonth) return label === 'birthday' ? CUSTOMER_MESSAGES.birthdayPair : CUSTOMER_MESSAGES.anniversaryPair;
  const real =
    Number.isInteger(day) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= DAYS_IN_MONTH[month - 1];
  if (real) return null;
  return label === 'birthday' ? CUSTOMER_MESSAGES.birthdayDate : CUSTOMER_MESSAGES.anniversaryDate;
}
const pad2 = (n: number): string => String(n).padStart(2, '0');
/** "2000-MM-DD": the year is a leap-year placeholder, only the day and month are kept. */
export function dayMonthToDateText(day: number, month: number): string {
  return `2000-${pad2(month)}-${pad2(day)}`;
}
/** The day and month of a stored "YYYY-MM-DD" date, or null when there is none. */
export function dateTextToDayMonth(text: string | null | undefined): { day: number; month: number } | null {
  const m = text ? /^[0-9]{4}-([0-9]{2})-([0-9]{2})/.exec(text) : null;
  return m ? { day: Number(m[2]), month: Number(m[1]) } : null;
}
