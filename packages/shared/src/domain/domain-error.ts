/** A broken business rule. The message is a sentence fit to show a person. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
