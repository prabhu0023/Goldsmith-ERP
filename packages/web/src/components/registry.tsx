import { prototypeScreens } from '@prototype';
import type { ComponentType } from 'react';
import type { RouteId } from '../nav';
import { Customers } from './people/Customers';
import { OnboardCustomer } from './people/OnboardCustomer';
import { OnboardStaff } from './people/OnboardStaff';
import { StaffDirectory } from './people/StaffDirectory';
import { SecurityLog } from './settings/SecurityLog';
import { NotWiredYet } from './shell/NotWiredYet';
/** Screens that read the server (EP-08 S18). The rest run on the prototype store until their epic wires them. */
const wiredScreens: Partial<Record<RouteId, ComponentType>> = {
  customers: Customers,
  'customer-new': OnboardCustomer,
  'staff-directory': StaffDirectory,
  'staff-new': OnboardStaff,
  security: SecurityLog,
};
/** Whether a route runs on the prototype store (and shows the demo notice). */
export const isPrototypeRoute = (id: RouteId): boolean => !wiredScreens[id] && Boolean(prototypeScreens[id]);
/** Route id -> screen: wired first, then the prototype seam, else the not-wired page. */
export const screenFor = (id: RouteId): ComponentType => wiredScreens[id] ?? prototypeScreens[id] ?? NotWiredYet;
