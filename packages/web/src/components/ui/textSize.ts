/** The text size of the data-layer states: 14 px, and 15 px on the karigar phone (UX floor). */
export type StateSize = 'default' | 'karigar';
export const stateText = (size: StateSize | undefined): string => (size === 'karigar' ? 'text-[15px]' : 'text-sm');
