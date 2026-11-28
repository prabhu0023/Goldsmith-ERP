import { describe, expect, it } from 'vitest';
import {
  CONSENT_SOURCES,
  CUSTOMER_GROUPS,
  CUSTOMER_MESSAGES,
  dateTextToDayMonth,
  dayMonthProblem,
  dayMonthToDateText,
  ERASED_CUSTOMER_NAME,
  normaliseCustomerPhone,
  STAFF_CONSENT_SOURCES,
} from '../src/index.js';
describe('normaliseCustomerPhone (EP-17-S1)', () => {
  it.each(['+91 98840 21107', '98840 21107', '098840 21107', '+91-9884021107', '919884021107'])(
    'reads %j as +919884021107',
    (typed) => {
      expect(normaliseCustomerPhone(typed)).toBe('+919884021107');
    },
  );
  it('refuses fewer than 10 digits', () => {
    expect(normaliseCustomerPhone('98840 211')).toBeNull();
    expect(normaliseCustomerPhone('')).toBeNull();
    expect(normaliseCustomerPhone('abc')).toBeNull();
  });
  it('keeps the country code of an 11 to 15 digit number', () => {
    expect(normaliseCustomerPhone('+1 415 555 2671')).toBe('+14155552671');
    expect(normaliseCustomerPhone('+44 7911 123456')).toBe('+447911123456');
    expect(normaliseCustomerPhone('123456789012345')).toBe('+123456789012345');
  });
  it('refuses more than 15 digits', () => {
    expect(normaliseCustomerPhone('1234567890123456')).toBeNull();
  });
  it('does not insist on a 6 to 9 first digit', () => {
    expect(normaliseCustomerPhone('5123456789')).toBe('+915123456789');
  });
  it('gives the same answer for an already normalised phone', () => {
    expect(normaliseCustomerPhone('+919884021107')).toBe('+919884021107');
  });
});
describe('dayMonthProblem (EP-17-S3)', () => {
  it('accepts both empty and a real date, 29 Feb included', () => {
    expect(dayMonthProblem('birthday', null, null)).toBeNull();
    expect(dayMonthProblem('birthday', undefined, undefined)).toBeNull();
    expect(dayMonthProblem('anniversary', 14, 3)).toBeNull();
    expect(dayMonthProblem('birthday', 29, 2)).toBeNull();
  });
  it('asks for both the day and the month, with the exact sentences', () => {
    expect(dayMonthProblem('birthday', 14, null)).toBe('Give both the day and the month of the birthday, or neither.');
    expect(dayMonthProblem('birthday', null, 3)).toBe('Give both the day and the month of the birthday, or neither.');
    expect(dayMonthProblem('anniversary', 14, undefined)).toBe(
      'Give both the day and the month of the anniversary, or neither.',
    );
  });
  it('refuses a date that does not exist', () => {
    expect(dayMonthProblem('birthday', 31, 2)).toBe(CUSTOMER_MESSAGES.birthdayDate);
    expect(dayMonthProblem('anniversary', 31, 4)).toBe(CUSTOMER_MESSAGES.anniversaryDate);
    expect(dayMonthProblem('birthday', 0, 1)).not.toBeNull();
    expect(dayMonthProblem('birthday', 1, 13)).not.toBeNull();
    expect(dayMonthProblem('birthday', 1.5, 1)).not.toBeNull();
  });
});
describe('day and month as date text', () => {
  it('stores 14 Mar as 2000-03-14 and reads it back', () => {
    expect(dayMonthToDateText(14, 3)).toBe('2000-03-14');
    expect(dateTextToDayMonth('2000-03-14')).toEqual({ day: 14, month: 3 });
    expect(dateTextToDayMonth('1988-12-02')).toEqual({ day: 2, month: 12 });
  });
  it('reads nothing as null', () => {
    expect(dateTextToDayMonth(null)).toBeNull();
    expect(dateTextToDayMonth('')).toBeNull();
  });
});
describe('customer vocabulary', () => {
  it('lists the groups the table allows', () => {
    expect(CUSTOMER_GROUPS).toEqual(['VIP Bridal', 'High net worth', 'Regular', 'Wholesale']);
  });
  it('lets staff name only the counter and the form', () => {
    expect(STAFF_CONSENT_SOURCES).toEqual(['counter', 'form']);
    for (const s of STAFF_CONSENT_SOURCES) expect(CONSENT_SOURCES).toContain(s);
    expect(CONSENT_SOURCES).toEqual(['counter', 'whatsapp_reply', 'form', 'import']);
  });
  it('words the refusals and the erased name as the stories do', () => {
    expect(CUSTOMER_MESSAGES.name).toBe('Add the customer name.');
    expect(CUSTOMER_MESSAGES.phone).toBe('Add a phone number with at least 10 digits. It is also the WhatsApp number.');
    expect(CUSTOMER_MESSAGES.duplicatePhone).toBe('A customer with this phone number already exists.');
    expect(ERASED_CUSTOMER_NAME).toBe('Erased customer');
  });
});
