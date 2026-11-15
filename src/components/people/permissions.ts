import type { RoleId } from '../../types/jewellery';

export interface RoleInfo {
  id: RoleId;
  label: string;
  blurb: string;
  lands: string;
  can: string[];
  cannot: string[];
}

/** The permission list is fixed by the role. Nobody ticks boxes. (Mockups 11 and 25.) */
export const ROLES: RoleInfo[] = [
  {
    id: 'staff',
    label: 'Staff',
    blurb: 'Showroom desk: leads, tagging, selling, proposing edits',
    lands: 'Today',
    can: [
      'Work leads and convert them',
      'Tag pieces and run the checks',
      'Release a parcel that matches',
      'Sell from stock and stock-out',
      'Propose edits and request scrap',
      'Raise a problem to stop the line',
    ],
    cannot: ['Clear a mismatch', 'Apply an edit', 'Scrap a piece'],
  },
  {
    id: 'owner',
    label: 'Owner',
    blurb: 'Everything staff can do, plus clearing, applying edits and scrap',
    lands: 'Decisions',
    can: [
      'Everything staff can do',
      'Clear a mismatch or a raised problem',
      'Apply a proposed edit with a token',
      'Mark a piece as scrap',
      'Add staff and karigars, change the rules and scales',
    ],
    cannot: [],
  },
  {
    id: 'karigar',
    label: 'Karigar',
    blurb: 'Phone only: their own jobs, no prices, no customers',
    lands: 'My jobs',
    can: ['See and accept their own jobs', 'Move a job along the bench', 'Hand a job over', 'Raise a problem on their job'],
    cannot: ['See customers', 'See prices', 'See other karigars'],
  },
];
