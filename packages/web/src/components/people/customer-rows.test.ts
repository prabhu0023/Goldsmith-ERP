import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_CHANGED_NOTICE,
  consentTimeLabel,
  customerDrawerNotice,
  customerFormErrors,
  customerFormInput,
  customerRefusal,
  dayMonthText,
  duplicatePhoneRefusal,
  formFromCustomer,
  formatCustomerPhone,
  monthYearLabel,
  piecesLabel,
} from './customer-rows';
import type { CustomerDetail, CustomerForm } from './customer-rows';
const blank: CustomerForm = {
  name: 'Meera Nair',
  phone: '+91 98840 21107',
  city: '',
  address: '',
  group: 'Regular',
  notes: '',
  birthdayDay: '',
  birthdayMonth: '',
  anniversaryDay: '',
  anniversaryMonth: '',
};
const duplicate = { code: 'validation', field: 'phone', message: 'A customer with this phone number already exists.' };
describe('formatCustomerPhone (EP-17-S3)', () => {
  it('spaces an Indian number as +91 98840 21107', () => {
    expect(formatCustomerPhone('+919884021107')).toBe('+91 98840 21107');
  });
  it('shows any other number as stored, and nothing for no number', () => {
    expect(formatCustomerPhone('+14155550100')).toBe('+14155550100');
    expect(formatCustomerPhone(null)).toBe('');
  });
});
describe('date labels', () => {
  it('writes a day and month as 14 Mar', () => {
    expect(dayMonthText({ day: 14, month: 3 })).toBe('14 Mar');
    expect(dayMonthText(null)).toBe('');
    expect(dayMonthText({ day: 1, month: 13 })).toBe('');
  });
  it('writes a moment as Oct 2026 in Asia/Kolkata', () => {
    expect(monthYearLabel('2026-10-15T09:00:00.000Z')).toBe('Oct 2026');
    expect(monthYearLabel('2026-09-30T20:00:00.000Z')).toBe('Oct 2026');
    expect(monthYearLabel('2026-09-30T18:00:00.000Z')).toBe('Sep 2026');
    expect(monthYearLabel(null)).toBe('');
    expect(monthYearLabel('not a date')).toBe('');
  });
  it('writes the server\'s local consent time as 28 Nov 2026, 17:46', () => {
    expect(consentTimeLabel('2026-11-28T17:46:59.800+05:30')).toBe('28 Nov 2026, 17:46');
    expect(consentTimeLabel('2026-03-05T09:05:00.000+05:30')).toBe('5 Mar 2026, 09:05');
    expect(consentTimeLabel('yesterday')).toBe('yesterday');
  });
  it('counts pieces', () => {
    expect(piecesLabel(1)).toBe('1 piece');
    expect(piecesLabel(3)).toBe('3 pieces');
    expect(piecesLabel(0)).toBe('0 pieces');
  });
});
describe('customerFormErrors (EP-17-S3 AC4, S5)', () => {
  it('accepts a complete form', () => {
    expect(customerFormErrors(blank)).toEqual({});
  });
  it('uses the shared sentences for a missing name and a short phone', () => {
    expect(customerFormErrors({ ...blank, name: ' ', phone: '12345' })).toEqual({
      name: 'Add the customer name.',
      phone: 'Add a phone number with at least 10 digits. It is also the WhatsApp number.',
    });
  });
  it('asks for both the day and the month, or neither', () => {
    expect(customerFormErrors({ ...blank, birthdayDay: '4' }).dob).toBe('Give both the day and the month of the birthday, or neither.');
    expect(customerFormErrors({ ...blank, anniversaryMonth: '2' }).anniversary).toBe('Give both the day and the month of the anniversary, or neither.');
  });
  it('refuses a date that does not exist and allows 29 Feb', () => {
    expect(customerFormErrors({ ...blank, birthdayDay: '31', birthdayMonth: '4' }).dob).toBe('That birthday is not a real date. Check the day and the month.');
    expect(customerFormErrors({ ...blank, anniversaryDay: '29', anniversaryMonth: '2' })).toEqual({});
  });
});
describe('customerFormInput', () => {
  it('sends empty text as null and a day and month as numbers', () => {
    expect(customerFormInput({ ...blank, city: ' Chennai ', birthdayDay: '14', birthdayMonth: '3' })).toEqual({
      name: 'Meera Nair',
      phone: '+91 98840 21107',
      city: 'Chennai',
      address: null,
      group: 'Regular',
      notes: null,
      dob: { day: 14, month: 3 },
      anniversary: null,
    });
  });
});
describe('formFromCustomer', () => {
  it('fills the edit form from the customer', () => {
    const customer = {
      id: 'CU-001',
      name: 'Meera Nair',
      phone: '+919884021107',
      city: 'Chennai',
      address: null,
      group: 'VIP Bridal',
      dob: { day: 14, month: 3 },
      anniversary: null,
      notes: null,
    } as CustomerDetail;
    expect(formFromCustomer(customer)).toEqual({
      name: 'Meera Nair',
      phone: '+919884021107',
      city: 'Chennai',
      address: '',
      group: 'VIP Bridal',
      notes: '',
      birthdayDay: '14',
      birthdayMonth: '3',
      anniversaryDay: '',
      anniversaryMonth: '',
    });
  });
});
describe('duplicatePhoneRefusal (EP-17-S4)', () => {
  it('is true for the validation refusal on the phone field with the duplicate sentence', () => {
    expect(duplicatePhoneRefusal(duplicate)).toBe(true);
  });
  it('is false for any other refusal', () => {
    expect(duplicatePhoneRefusal(null)).toBe(false);
    expect(duplicatePhoneRefusal({ ...duplicate, field: 'name' })).toBe(false);
    expect(duplicatePhoneRefusal({ ...duplicate, message: 'Add a phone number with at least 10 digits.' })).toBe(false);
    expect(duplicatePhoneRefusal({ ...duplicate, code: 'conflict' })).toBe(false);
  });
});
describe('customerRefusal', () => {
  it('puts a validation refusal on the field the server names', () => {
    expect(customerRefusal(duplicate)).toEqual({ field: 'phone', message: duplicate.message });
    expect(customerRefusal({ code: 'validation', field: 'dob', message: 'Bad.' })).toEqual({ field: 'dob', message: 'Bad.' });
  });
  it('shows any other refusal as one sentence beside the button', () => {
    expect(customerRefusal({ code: 'conflict', message: 'Someone else changed this customer. Reload and try again.' })).toEqual({
      notice: 'Someone else changed this customer. Reload and try again.',
    });
    expect(customerRefusal({ code: 'validation', field: 'version', message: 'Bad.' })).toEqual({ notice: 'Bad.' });
    expect(customerRefusal(null)).toBeNull();
  });
});
describe('customerDrawerNotice (EP-08-S9 AC3)', () => {
  it('says nothing while the customer is at the opened version', () => {
    expect(customerDrawerNotice(2, 2)).toBeNull();
  });
  it('says the customer was changed and the edits are kept', () => {
    expect(customerDrawerNotice(2, 3)).toBe(CUSTOMER_CHANGED_NOTICE);
  });
});
