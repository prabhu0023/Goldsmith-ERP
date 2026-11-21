/**
 * Masked phone numbers and email addresses for audit details and log lines (EP-04-S4, S14).
 * Masking an already masked value gives the same text.
 */
/** "+91 98410 11111" or "+919841011111" -> "+91 ••••• 11111". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length < 5 ? '+91 •••••' : `+91 ••••• ${digits.slice(-5)}`;
}
/** "rajesh@example.com" -> "r•••@example.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}
