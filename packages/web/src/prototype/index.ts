/**
 * The prototype seam (EP-08-S19, decision D-D). Everything that runs on the in-memory demo store is
 * reached only through this file: the unwired screens, the store provider and the phone frame.
 * `vite build` swaps it for `index.production.ts`, which holds none of them, so the production
 * bundle carries no demo data. Delete this folder with the last unwired screen (FU-020).
 */
import type { ComponentType } from 'react';
import type { RouteId } from '../nav';
import { OwnerDecisions } from '../components/home/OwnerDecisions';
import { StaffToday } from '../components/home/StaffToday';
import { KarigarPhone } from '../components/karigar/KarigarPhone';
import { ConvertLead } from '../components/leads/ConvertLead';
import { LeadCreate } from '../components/leads/LeadCreate';
import { LeadInbox } from '../components/leads/LeadInbox';
import { LeadReview } from '../components/leads/LeadReview';
import { OrderCopyBuilder } from '../components/leads/OrderCopyBuilder';
import { OwnerClearMismatch } from '../components/parcels/OwnerClearMismatch';
import { ParcelArrival } from '../components/parcels/ParcelArrival';
import { ParcelMatch } from '../components/parcels/ParcelMatch';
import { ParcelsList } from '../components/parcels/ParcelsList';
import { QcCheck } from '../components/parcels/QcCheck';
import { TagItem } from '../components/parcels/TagItem';
import { Karigars } from '../components/people/Karigars';
import { OnboardKarigar } from '../components/people/OnboardKarigar';
import { ScalesRules } from '../components/settings/ScalesRules';
import { Broadcast } from '../components/marketing/Broadcast';
import { CatalogueShare } from '../components/marketing/CatalogueShare';
import { Wishes } from '../components/marketing/Wishes';
import { EditApply } from '../components/stock/EditApply';
import { EditPropose } from '../components/stock/EditPropose';
import { ScrapDecision } from '../components/stock/ScrapDecision';
import { ShowroomStock } from '../components/stock/ShowroomStock';
import { StockOut } from '../components/stock/StockOut';

/** Route id -> prototype screen. Screens read their ids from useStore().route.params. */
export const prototypeScreens: Partial<Record<RouteId, ComponentType>> = {
  today: StaffToday,
  decisions: OwnerDecisions,
  leads: LeadInbox,
  'lead-review': LeadReview,
  'lead-create': LeadCreate,
  'lead-convert': ConvertLead,
  'order-copy': OrderCopyBuilder,
  stock: ShowroomStock,
  'stock-out': StockOut,
  'edit-propose': EditPropose,
  'edit-apply': EditApply,
  'scrap-decision': ScrapDecision,
  parcels: ParcelsList,
  'parcel-arrival': ParcelArrival,
  'parcel-tag': TagItem,
  'parcel-qc': QcCheck,
  'parcel-match': ParcelMatch,
  'parcel-clear': OwnerClearMismatch,
  karigars: Karigars,
  'karigar-new': OnboardKarigar,
  scales: ScalesRules,
  wishes: Wishes,
  broadcast: Broadcast,
  catalogue: CatalogueShare,
  'k-jobs': KarigarPhone,
};

export { KarigarFrame, PrototypeNotice, PrototypeStoreProvider } from './prototype-parts';
