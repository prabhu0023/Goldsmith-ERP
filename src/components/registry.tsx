import type { ComponentType } from 'react';
import type { RouteId } from '../nav';
import { OwnerDecisions } from './home/OwnerDecisions';
import { StaffToday } from './home/StaffToday';
import { KarigarPhone } from './karigar/KarigarPhone';
import { ConvertLead } from './leads/ConvertLead';
import { LeadCreate } from './leads/LeadCreate';
import { LeadInbox } from './leads/LeadInbox';
import { LeadReview } from './leads/LeadReview';
import { OrderCopyBuilder } from './leads/OrderCopyBuilder';
import { OwnerClearMismatch } from './parcels/OwnerClearMismatch';
import { ParcelArrival } from './parcels/ParcelArrival';
import { ParcelMatch } from './parcels/ParcelMatch';
import { ParcelsList } from './parcels/ParcelsList';
import { QcCheck } from './parcels/QcCheck';
import { TagItem } from './parcels/TagItem';
import { Customers } from './people/Customers';
import { Karigars } from './people/Karigars';
import { OnboardCustomer } from './people/OnboardCustomer';
import { OnboardKarigar } from './people/OnboardKarigar';
import { OnboardStaff } from './people/OnboardStaff';
import { StaffDirectory } from './people/StaffDirectory';
import { ScalesRules } from './settings/ScalesRules';
import { SecurityLog } from './settings/SecurityLog';
import { Broadcast } from './marketing/Broadcast';
import { CatalogueShare } from './marketing/CatalogueShare';
import { Wishes } from './marketing/Wishes';
import { EditApply } from './stock/EditApply';
import { EditPropose } from './stock/EditPropose';
import { ScrapDecision } from './stock/ScrapDecision';
import { ShowroomStock } from './stock/ShowroomStock';
import { StockOut } from './stock/StockOut';

/** Route id -> screen. Screens read their ids from useStore().route.params. */
export const registry: Record<RouteId, ComponentType> = {
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
  customers: Customers,
  'customer-new': OnboardCustomer,
  karigars: Karigars,
  'karigar-new': OnboardKarigar,
  'staff-directory': StaffDirectory,
  'staff-new': OnboardStaff,
  scales: ScalesRules,
  security: SecurityLog,
  wishes: Wishes,
  broadcast: Broadcast,
  catalogue: CatalogueShare,
  'k-jobs': KarigarPhone,
};
