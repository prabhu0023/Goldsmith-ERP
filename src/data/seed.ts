/**
 * Mock data for the whole suite. Numbers, names and states come from docs/ux/mockups so the
 * screens read the same as the drawings. Everything is laid out around DEMO_BASE
 * (Sunday 1 November 2026, 11:06).
 */
import { DEMO_BASE, DAY, HOUR, MIN, daysAgo, dueIn, hoursAgo } from '../domain/clock';
import { round4, toU, fromU } from '../domain/weights';
import type {
  AppState,
  AuditEntry,
  Customer,
  Karigar,
  KarigarJob,
  Lead,
  OrderCopy,
  Parcel,
  Piece,
  PoolEntry,
  StockOutRecord,
} from '../types/jewellery';
import { images, imageForKey } from './images';
import { BILLED_EARLIER, BILLED_TODAY, STOCK_ROWS } from './seedRows';
import type { ImageKey } from './seedRows';

const BENCH = 'SC-BENCH';
const PLATFORM = 'SC-PLAT';
const at = (m: number, d: number, h: number, min = 0): number => new Date(2026, m - 1, d, h, min).getTime();

function piece(p: Partial<Piece> & Pick<Piece, 'id' | 'name' | 'kind' | 'grossG' | 'stoneG'>): Piece {
  return {
    collection: '',
    style: '',
    purity: '22K',
    huid: '',
    stoneCount: 0,
    size: '',
    scaleId: BENCH,
    status: 'draft',
    prevStatus: null,
    parcelId: null,
    jobId: null,
    madeById: null,
    inStockAt: null,
    taggedBy: 'Rajesh Verma',
    taggedAt: DEMO_BASE,
    photos: [],
    note: '',
    heldForLeadId: null,
    valueINR: null,
    soldAt: null,
    stockOutId: null,
    ...p,
  };
}

// ---------------------------------------------------------------- people
const karigars: Karigar[] = [
  {
    id: 'KG-01', name: 'Lakshmi Devi', phone: '+91 98400 10101', specialty: 'Chettinad', language: 'Tamil', wastagePct: 0.7,
    gapsMg: [4, 6, 3, 5, 2, 4], metalLossPct: 0.52, lateDays: 0.4, rating: 4.7, finishedJobs: 31, openSince: '2019-04-02',
  },
  {
    id: 'KG-02', name: 'Mahesh Soni', phone: '+91 98400 20202', specialty: 'Kundan and Polki', language: 'Hindi', wastagePct: 0.8,
    gapsMg: [28, 33, 30, 29, 35, 31], metalLossPct: 1.42, lateDays: 3.2, rating: 3.4, finishedJobs: 22, openSince: '2018-09-15',
  },
  {
    id: 'KG-04', name: 'Vijay Kumar', phone: '+91 98400 40404', specialty: 'Antique and Temple', language: 'Hindi', wastagePct: 0.8,
    gapsMg: [12, 9, 14, 11, 8, 10], metalLossPct: 0.61, lateDays: 0.8, rating: 4.2, finishedJobs: 14, openSince: '2021-01-11',
  },
];

const staff: AppState['staff'] = [
  { id: 'ST-01', name: 'Rajesh Verma', role: 'staff', login: 'rajesh', phone: '+91 98410 11111', salesCount: 38 },
  { id: 'ST-02', name: 'Deepak Rao', role: 'staff', login: 'deepak', phone: '+91 98410 22222', salesCount: 26 },
  { id: 'ST-03', name: 'Sanjay Seth', role: 'owner', login: 'sanjay', phone: '+91 98410 33333', salesCount: 0 },
];

const customers: Customer[] = [
  {
    id: 'CU-001', name: 'Meera Iyer', phone: '+91 98401 55501', city: 'Chennai', group: 'Regular', dob: '1982-03-14', anniversary: null,
    optedIn: true, notes: 'Prefers antique finish.', budgetINR: null, spentINR: null,
    history: [
      { id: 'H1', name: 'Antique Kundan Choker', tag: 'TAG-7620', pureG: 40.1, on: daysAgo(210) },
      { id: 'H2', name: 'Floral Meenakari Bangle', tag: 'TAG-7745', pureG: 26.4, on: daysAgo(170) },
      { id: 'H3', name: 'Meenakari Pendant', tag: 'TAG-7855', pureG: 18.7, on: daysAgo(120) },
      { id: 'H4', name: 'Jadau Emerald Ring', tag: 'TAG-7902', pureG: 11.9, on: daysAgo(90) },
      { id: 'H5', name: 'Antique Temple Jhumka', tag: 'TAG-8010', pureG: 15.2, on: daysAgo(60) },
      { id: 'H6', name: 'Kasu Mala', tag: 'TAG-8233', pureG: 47.5, on: daysAgo(25) },
    ],
  },
  {
    id: 'CU-002', name: 'Priya Malhotra', phone: '+91 98401 55502', city: 'Chennai', group: 'VIP Bridal', dob: '1990-11-01', anniversary: '2016-02-20',
    optedIn: true, notes: 'VIP bridal. Last bought a Polki kada.', budgetINR: null, spentINR: null,
    history: [
      { id: 'H1', name: 'Polki Kada (pair)', tag: 'TAG-8290', pureG: 52.3, on: daysAgo(18) },
      { id: 'H2', name: 'Chettinad Temple Haram', tag: 'TAG-7288', pureG: 88.9, on: daysAgo(400) },
    ],
  },
  {
    id: 'CU-003', name: 'Arjun & Kavya', phone: '+91 98401 55503', city: 'Bengaluru', group: 'High net worth', dob: null, anniversary: '2014-11-01',
    optedIn: true, notes: 'Anniversary today.', budgetINR: null, spentINR: null,
    history: [
      { id: 'H1', name: 'Peacock Ruby Pendant', tag: 'TAG-7914', pureG: 18.6, on: daysAgo(70) },
      { id: 'H2', name: 'Chettinad Temple Haram', tag: 'TAG-7511', pureG: 90.2, on: daysAgo(150) },
      { id: 'H3', name: 'Antique Kundan Choker', tag: 'TAG-7390', pureG: 41.0, on: daysAgo(260) },
      { id: 'H4', name: 'Floral Polki Kada', tag: 'TAG-7144', pureG: 44.8, on: daysAgo(330) },
    ],
  },
  {
    id: 'CU-004', name: 'Ramesh Sharma', phone: '+91 98401 55504', city: 'Delhi', group: 'Regular', dob: '1971-06-09', anniversary: null,
    optedIn: true, notes: 'Daughter\'s wedding on 20 Nov.', budgetINR: null, spentINR: null, history: [],
  },
  {
    id: 'CU-005', name: 'Mrs Nair', phone: '+91 98401 55505', city: 'Kochi', group: 'Regular', dob: null, anniversary: null,
    optedIn: true, notes: 'Wants a Polki choker like the one in the window.', budgetINR: null, spentINR: null, history: [],
  },
  {
    id: 'CU-006', name: 'Deepa Krishnan', phone: '+91 98401 55506', city: 'Chennai', group: 'VIP Bridal', dob: '1988-11-20', anniversary: '2013-12-05',
    optedIn: true, notes: '', budgetINR: null, spentINR: null,
    history: [{ id: 'H1', name: 'Antique Kundan Choker', tag: 'TAG-8150', pureG: 41.3, on: daysAgo(44) }],
  },
  {
    id: 'CU-007', name: 'Sri Murugan Jewellers', phone: '+91 98401 55507', city: 'Erode', group: 'Wholesale', dob: null, anniversary: null,
    optedIn: false, notes: 'Wholesaler. Orders by email.', budgetINR: null, spentINR: null, history: [],
  },
  {
    id: 'CU-008', name: 'Dr Fathima Beevi', phone: '+91 98401 55508', city: 'Madurai', group: 'High net worth', dob: '1975-12-02', anniversary: null,
    optedIn: true, notes: '', budgetINR: null, spentINR: null,
    history: [{ id: 'H1', name: 'Floral Polki Kada', tag: 'TAG-8044', pureG: 45.0, on: daysAgo(95) }],
  },
];

// ---------------------------------------------------------------- stock
const pieces: Piece[] = [];

STOCK_ROWS.forEach(([id, name, kind, style, purity, grossG, stoneG, stoneCount, madeBy, days, collection, img, huid]) => {
  pieces.push(
    piece({
      id, name, kind, style, purity, grossG, stoneG, stoneCount, collection, huid,
      status: 'in_stock', madeById: madeBy, inStockAt: daysAgo(days), taggedAt: daysAgo(days), photos: [imageForKey(img)],
      parcelId: id === 'TAG-8841' ? 'BATCH-2026-041' : null, size: img === 'haram' || img === 'choker' ? '16 in adjustable dori' : '',
    }),
  );
});

// the Temple Nakshi Haram that sits with the owner while he decides on the scrap request
pieces.push(
  piece({
    id: 'TAG-7701', name: 'Temple Nakshi Haram', kind: 'Temple Haram', style: 'Nakshi', collection: 'Temple Edit', huid: 'K7N2Q4',
    grossG: 84.5, stoneG: 6.1, stoneCount: 3, status: 'with_owner', prevStatus: 'in_stock', madeById: 'KG-04',
    inStockAt: daysAgo(108), taggedAt: daysAgo(108), photos: [images.chettinadHaram],
  }),
);

const sellerFor = (i: number) => (i % 3 === 0 ? staff[1] : staff[0]);
const stockOuts: StockOutRecord[] = [];
const soGroups = (rows: typeof BILLED_TODAY, sizes: number[], startId: number, when: (i: number) => number): void => {
  let cursor = 0;
  sizes.forEach((n, gi) => {
    const slice = rows.slice(cursor, cursor + n);
    cursor += n;
    const id = `SO-${startId + gi}`;
    const when_ = when(gi);
    slice.forEach(([tag, name, kind, style, purity, grossG, stoneG, madeBy, img, huid]) => {
      pieces.push(
        piece({
          id: tag, name, kind, style, purity, grossG, stoneG, huid, status: 'billed', madeById: madeBy, photos: [imageForKey(img)],
          inStockAt: when_ - 20 * DAY, taggedAt: when_ - 20 * DAY, soldAt: when_, stockOutId: id,
        }),
      );
    });
    const seller = sellerFor(gi);
    stockOuts.push({
      id, pieceIds: slice.map((r) => r[0]), sellerId: seller.id, sellerName: seller.name,
      ref: `REF-2026-${1170 + startId - 101 + gi}`, invoiceNo: `INV-2026-${String(840 + startId - 101 + gi).padStart(4, '0')}`,
      at: when_, amountINR: null,
    });
  });
};
soGroups(BILLED_TODAY, [3, 2, 4, 2], 101, (i) => DEMO_BASE - (9 - i * 2) * 20 * MIN - 0.5 * HOUR);
soGroups(BILLED_EARLIER, [3, 3, 3, 3], 105, (i) => daysAgo(i + 1) - 3 * HOUR);

// ---------------------------------------------------------------- parcels
const bench = (label: string, grossG: number, stoneG: number, id: string) => ({ id, label, scaleId: BENCH, grossG, stoneG });

// 044: Mahesh Soni, 12 tagged, gold 138 mg short
const parcel044Tags: [string, string, string, string, number, number, ImageKey][] = [
  ['TAG-9101', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', 102.412, 6.8, 'haram'],
  ['TAG-9102', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', 99.466, 5.45, 'haram'],
  ['TAG-9103', 'Antique Kundan Choker', 'Kundan Choker', 'Kundan', 55.23, 6.4, 'choker'],
  ['TAG-9104', 'Polki Kada · pair', 'Polki Kada', 'Polki', 46.88, 3.1, 'bangle'],
  ['TAG-9105', 'Polki Kada · pair', 'Polki Kada', 'Polki', 44.215, 2.95, 'bangle'],
  ['TAG-9106', 'Floral Meenakari Bangle', 'Meenakari Bangle', 'Meenakari', 31.74, 2.2, 'bangle'],
  ['TAG-9107', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', 23.103, 1.85, 'pendant'],
  ['TAG-9108', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', 22.56, 1.7, 'pendant'],
  ['TAG-9109', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', 18.2, 3.1, 'pendant'],
  ['TAG-9110', 'Jadau Emerald Ring', 'Jadau Emerald Ring', 'Jadau', 14.85, 1.95, 'ring'],
  ['TAG-9111', 'Jadau Emerald Ring', 'Jadau Emerald Ring', 'Jadau', 13.906, 1.8, 'ring'],
  ['TAG-9112', 'Temple Nakshi Ring', 'Temple Nakshi Ring', 'Nakshi', 12.8, 0.9, 'ring'],
];

const tagged = (rows: [string, string, string, string, number, number, ImageKey][], parcelId: string, jobId: string, madeBy: string, status: Piece['status'], when: number, by: string): Piece[] =>
  rows.map(([id, name, kind, style, grossG, stoneG, img], i) =>
    piece({
      id, name, kind, style, grossG, stoneG, status, parcelId, jobId, madeById: madeBy, taggedAt: when + i * 4 * MIN, taggedBy: by,
      huid: `${id.slice(-3)}${'HX7Q2M'.slice(0, 3)}`, purity: kind.includes('Ring') && kind.includes('Jadau') ? '18K' : '22K',
      stoneCount: 1 + (i % 4), photos: [imageForKey(img)],
    }),
  );

pieces.push(...tagged(parcel044Tags, 'BATCH-2026-044', 'MO-2026-121', 'KG-02', 'with_owner', at(11, 1, 8, 40), 'Rajesh Verma'));

// 043: Lakshmi Devi, 3 of 12 tagged
pieces.push(
  ...tagged(
    [
      ['TAG-9201', 'Chettinad Temple Haram', 'Chettinad Temple Haram', 'Chettinad', 81.35, 5.6, 'haram'],
      ['TAG-9202', 'Chettinad Temple Haram', 'Chettinad Temple Haram', 'Chettinad', 79.8, 5.2, 'haram'],
      ['TAG-9203', 'Kasu Mala', 'Kasu Mala', 'Temple', 52.45, 0.9, 'haram'],
    ],
    'BATCH-2026-043', 'MO-2026-112', 'KG-01', 'draft', at(10, 31, 16, 30), 'Deepak Rao',
  ),
);

// 045: Mahesh Soni, 7 of 12 tagged, pure gold so far 262.4100 g
pieces.push(
  ...tagged(
    [
      ['TAG-9301', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', 78.24, 5.9, 'haram'],
      ['TAG-9302', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', 74.15, 5.25, 'haram'],
      ['TAG-9303', 'Polki Kada · pair', 'Polki Kada', 'Polki', 36.4, 3.1, 'bangle'],
      ['TAG-9304', 'Polki Kada · pair', 'Polki Kada', 'Polki', 35.1, 3.05, 'bangle'],
      ['TAG-9305', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', 22.6, 1.8, 'pendant'],
      ['TAG-9306', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', 21.9, 1.65, 'pendant'],
      ['TAG-9307', 'Jadau Emerald Ring', 'Jadau Emerald Ring', 'Jadau', 15.77, 1.0, 'ring'],
    ],
    'BATCH-2026-045', 'MO-2026-113', 'KG-02', 'draft', at(11, 1, 9, 5), 'Rajesh Verma',
  ),
);

// 046: Lakshmi Devi, 4 items, fully tagged and checked, matches exactly
pieces.push(
  ...tagged(
    [
      ['TAG-9401', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', 76.54, 5.4, 'haram'],
      ['TAG-9402', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', 71.32, 5.15, 'haram'],
      ['TAG-9403', 'Kasu Mala', 'Kasu Mala', 'Temple', 38.9, 2.7, 'haram'],
      ['TAG-9404', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', 19.6, 4.25, 'jhumka'],
    ],
    'BATCH-2026-046', 'MO-2026-116', 'KG-01', 'draft', at(11, 1, 9, 40), 'Rajesh Verma',
  ),
);

const base = (p: Partial<Parcel> & Pick<Parcel, 'id' | 'karigarId' | 'weighings' | 'manifest'>): Parcel => ({
  jobId: null, poRef: null, arrivedAt: DEMO_BASE, stage: 2, status: 'open', resolution: null, recheckPieceId: null, qcDone: [],
  verdict: 'incomplete', gapNetG: null, lossG: null, lossReason: null, releasedAt: null, releasedBy: null, stoppedAt: null, ...p,
});

const parcels: Parcel[] = [
  base({
    id: 'BATCH-2026-044', karigarId: 'KG-02', jobId: 'MO-2026-121', poRef: 'PO-2026-915', arrivedAt: at(10, 30, 16, 10), stage: 3,
    status: 'stopped', verdict: 'mismatch', gapNetG: -0.138, stoppedAt: at(11, 1, 9, 12),
    weighings: [bench('Whole parcel', 485.5, 38.2, 'WG-044')],
    manifest: [
      { id: 'MF-044-1', kind: 'Temple Haram', count: 2 },
      { id: 'MF-044-2', kind: 'Kundan Choker', count: 1 },
      { id: 'MF-044-3', kind: 'Polki Kada', count: 2 },
      { id: 'MF-044-4', kind: 'Meenakari Bangle', count: 1 },
      { id: 'MF-044-5', kind: 'Meenakari Pendant', count: 2 },
      { id: 'MF-044-6', kind: 'Peacock Ruby Pendant', count: 1 },
      { id: 'MF-044-7', kind: 'Jadau Emerald Ring', count: 2 },
      { id: 'MF-044-8', kind: 'Temple Nakshi Ring', count: 1 },
    ],
    qcDone: parcel044Tags.map((t) => t[0]),
  }),
  base({
    id: 'BATCH-2026-043', karigarId: 'KG-01', jobId: 'MO-2026-112', arrivedAt: at(10, 31, 14, 20), stage: 2,
    weighings: [bench('Whole parcel', 548.2, 41.6, 'WG-043')],
    manifest: [
      { id: 'MF-043-1', kind: 'Chettinad Temple Haram', count: 4 },
      { id: 'MF-043-2', kind: 'Kasu Mala', count: 3 },
      { id: 'MF-043-3', kind: 'Antique Jhumka', count: 3 },
      { id: 'MF-043-4', kind: 'Temple Nakshi Ring', count: 2 },
    ],
  }),
  base({
    id: 'BATCH-2026-045', karigarId: 'KG-02', jobId: 'MO-2026-113', arrivedAt: at(10, 31, 17, 45), stage: 2,
    weighings: [bench('Whole parcel', 630.5, 52.4, 'WG-045')],
    manifest: [
      { id: 'MF-045-1', kind: 'Temple Haram', count: 3 },
      { id: 'MF-045-2', kind: 'Polki Kada', count: 2 },
      { id: 'MF-045-3', kind: 'Meenakari Pendant', count: 3 },
      { id: 'MF-045-4', kind: 'Jadau Emerald Ring', count: 2 },
      { id: 'MF-045-5', kind: 'Kundan Choker', count: 2 },
    ],
  }),
  base({
    id: 'BATCH-2026-046', karigarId: 'KG-01', jobId: 'MO-2026-116', arrivedAt: at(11, 1, 8, 20), stage: 3, verdict: 'exact', gapNetG: 0,
    weighings: [bench('Whole parcel', 206.36, 17.5, 'WG-046')],
    manifest: [
      { id: 'MF-046-1', kind: 'Temple Haram', count: 2 },
      { id: 'MF-046-2', kind: 'Kasu Mala', count: 1 },
      { id: 'MF-046-3', kind: 'Antique Jhumka', count: 1 },
    ],
    qcDone: ['TAG-9401', 'TAG-9402', 'TAG-9403', 'TAG-9404'],
  }),
  // already released earlier, so the 'came in with' facts on TAG-8841 resolve
  base({
    id: 'BATCH-2026-041', karigarId: 'KG-02', arrivedAt: daysAgo(14), stage: 3, status: 'released', verdict: 'exact', gapNetG: 0,
    releasedAt: daysAgo(13), releasedBy: 'Rajesh Verma',
    weighings: [bench('Whole parcel', 312.4, 28.3, 'WG-041')],
    manifest: [{ id: 'MF-041-1', kind: 'Kundan Choker', count: 3 }],
  }),
];

// ---------------------------------------------------------------- jobs and order copies
const job = (j: Partial<KarigarJob> & Pick<KarigarJob, 'id' | 'title' | 'karigarId' | 'status' | 'dueDate'>): KarigarJob => ({
  orderCopyId: null, style: '', qty: 1, purity: '22K', sentAt: daysAgo(12), confirmedDate: null, targetGrossG: 0, targetNetG: 0,
  toleranceG: 0.5, goldIssuedG: 0, note: '', refImage: null, stopped: false, parcelId: null, benchNote: '', settledAt: null, ...j,
});

const jobs: KarigarJob[] = [
  job({
    id: 'MO-2026-118', orderCopyId: 'OC-2026-031', title: 'Peacock Ruby Pendant', style: 'Antique', qty: 2, karigarId: 'KG-04', status: 'on_bench',
    dueDate: dueIn(0), confirmedDate: dueIn(0), sentAt: daysAgo(10), targetGrossG: 18.2, targetNetG: 15.1, toleranceG: 0.5, goldIssuedG: 108,
    note: 'Keep the kemp stones deep set, last pair had two loose.', refImage: images.peacockPendant, stopped: true,
  }),
  job({
    id: 'MO-2026-122', orderCopyId: 'OC-2026-034', title: 'Temple Haram', style: 'Chettinad', qty: 1, karigarId: 'KG-04', status: 'accepted',
    dueDate: dueIn(9), confirmedDate: dueIn(9), sentAt: daysAgo(2), targetGrossG: 84.5, targetNetG: 78.4, goldIssuedG: 78.4,
    note: 'Goddess Lakshmi centre, antique matte finish.', refImage: images.chettinadHaram,
  }),
  job({
    id: 'MO-2026-119', title: 'Chettinad Temple Haram', style: 'Chettinad', qty: 1, karigarId: 'KG-01', status: 'on_bench', dueDate: dueIn(-1),
    confirmedDate: dueIn(-1), sentAt: daysAgo(15), targetGrossG: 80, targetNetG: 72, goldIssuedG: 161.12, refImage: images.chettinadHaram,
  }),
  job({
    id: 'MO-2026-115', title: 'Antique Kundan Choker', style: 'Kundan', qty: 1, karigarId: 'KG-02', status: 'on_bench', dueDate: dueIn(-3),
    confirmedDate: dueIn(-3), sentAt: daysAgo(18), targetGrossG: 48, targetNetG: 41.5, goldIssuedG: 160, refImage: images.kundanChoker,
  }),
  job({
    id: 'MO-2026-125', title: 'Floral Polki Kada', style: 'Polki', qty: 2, karigarId: 'KG-02', status: 'sent', dueDate: dueIn(14), sentAt: daysAgo(1),
    targetGrossG: 64, targetNetG: 57.5, goldIssuedG: 0, refImage: images.polkiBangle,
  }),
  job({
    id: 'MO-2026-121', title: 'Mixed Kundan and Polki lot', style: 'Kundan', qty: 12, karigarId: 'KG-02', status: 'handed_over', dueDate: dueIn(-2),
    confirmedDate: dueIn(-2), sentAt: daysAgo(20), targetGrossG: 485.5, targetNetG: 447.3, goldIssuedG: 447.3, parcelId: 'BATCH-2026-044',
  }),
  job({
    id: 'MO-2026-112', title: 'Chettinad lot', style: 'Chettinad', qty: 12, karigarId: 'KG-01', status: 'handed_over', dueDate: dueIn(-1),
    confirmedDate: dueIn(-1), sentAt: daysAgo(22), targetGrossG: 548.2, targetNetG: 506.6, goldIssuedG: 507, parcelId: 'BATCH-2026-043',
  }),
  job({
    id: 'MO-2026-113', title: 'Mixed Kundan and Polki lot', style: 'Kundan', qty: 12, karigarId: 'KG-02', status: 'handed_over', dueDate: dueIn(-1),
    confirmedDate: dueIn(-1), sentAt: daysAgo(23), targetGrossG: 630.5, targetNetG: 578.1, goldIssuedG: 560, parcelId: 'BATCH-2026-045',
  }),
  job({
    id: 'MO-2026-116', title: 'Chettinad lot', style: 'Chettinad', qty: 4, karigarId: 'KG-01', status: 'handed_over', dueDate: dueIn(0),
    confirmedDate: dueIn(0), sentAt: daysAgo(14), targetGrossG: 206.36, targetNetG: 188.86, goldIssuedG: 190.2, parcelId: 'BATCH-2026-046',
  }),
];

const orderCopies: OrderCopy[] = [
  {
    id: 'OC-2026-031', leadId: 'LD-2026-201', leadItemId: 'LI-201-1', jobId: 'MO-2026-118', refImages: [images.peacockPendant],
    brief: 'Peacock Ruby Pendant, pair. Keep the kemp stones deep set, last pair had two loose.', qty: 2, purity: '22K',
    targetGrossG: 18.2, targetNetG: 15.1, toleranceG: 0.5, karigarId: 'KG-04', dueDate: dueIn(0), goldIssuedG: 108, createdBy: 'Rajesh Verma', createdAt: daysAgo(10),
  },
  {
    id: 'OC-2026-034', leadId: null, leadItemId: null, jobId: 'MO-2026-122', refImages: [images.chettinadHaram],
    brief: 'Chettinad Temple Haram, Goddess Lakshmi centre, antique matte finish.', qty: 1, purity: '22K',
    targetGrossG: 84.5, targetNetG: 78.4, toleranceG: 0.5, karigarId: 'KG-04', dueDate: dueIn(9), goldIssuedG: 78.4, createdBy: 'Rajesh Verma', createdAt: daysAgo(2),
  },
];

// ---------------------------------------------------------------- leads
const lead = (l: Partial<Lead> & Pick<Lead, 'id' | 'title' | 'source' | 'state' | 'arrivedAt' | 'customerName'>): Lead => ({
  confidence: 'clean', phone: '', message: '', fields: [], items: [], neededBy: null, takenBy: null, note: '', ...l,
});
const li = (id: string, name: string, style: string, qty: number, approxWeightG: number | null, route: Lead['items'][number]['route'] = null) => ({
  id, name, style, qty, approxWeightG, route,
});

const leads: Lead[] = [
  lead({
    id: 'LD-2026-207', title: 'A photo we could not read · +91 90037 44120', source: 'whatsapp', state: 'needs_glance', confidence: 'unreadable',
    arrivedAt: hoursAgo(11), customerName: 'Unknown sender', phone: '+91 90037 44120',
    message: '[photo] (the picture was too dark to read)',
    fields: [{ key: 'items', label: 'What they want', value: 'Could not read', flagged: true }],
  }),
  lead({
    id: 'LD-2026-208', title: 'Sharma wedding · 2 harams, 1 choker · read automatically', source: 'whatsapp', state: 'needs_glance', confidence: 'unsure',
    arrivedAt: hoursAgo(9), customerName: 'Ramesh Sharma', phone: '+91 98401 55504', neededBy: at(11, 20, 0),
    message:
      'Namaste, Ramesh Sharma here. Beti ki shaadi 20 Nov ko hai. Need 2 Temple Haram (Chettinad) around 80 g each and 1 Kundan choker like TAG-8841. Please confirm what is possible.',
    fields: [
      { key: 'customer', label: 'Customer', value: 'Ramesh Sharma', flagged: false },
      { key: 'phone', label: 'Phone', value: '+91 98401 55504', flagged: false },
      { key: 'items', label: 'Items', value: '2 × Temple Haram (Chettinad), 1 × Kundan Choker', flagged: false },
      { key: 'weight', label: 'Weight of each haram', value: 'around 80 g', flagged: true },
      { key: 'neededBy', label: 'Needed by', value: '20 Nov', flagged: true },
    ],
    items: [
      li('LI-208-1', 'Temple Haram', 'Chettinad', 2, 80),
      li('LI-208-2', 'Kundan Choker', 'Kundan', 1, 41.59),
    ],
  }),
  lead({
    id: 'LD-2026-209', title: 'Bulk chain order · Erode wholesaler · 40 pieces', source: 'email', state: 'needs_glance', confidence: 'clean',
    arrivedAt: hoursAgo(2), customerName: 'Sri Murugan Jewellers', phone: '+91 98401 55507',
    message: 'Please quote and supply 40 pieces of 22K rope chain, 12 to 14 g each, delivery before the 15th.',
    fields: [
      { key: 'customer', label: 'Customer', value: 'Sri Murugan Jewellers', flagged: false },
      { key: 'items', label: 'Items', value: '40 × Rope chain 22K', flagged: false },
      { key: 'weight', label: 'Weight each', value: '12 to 14 g', flagged: false },
    ],
    items: [li('LI-209-1', 'Rope chain', '22K', 40, 13)],
  }),
  lead({
    id: 'LD-2026-210', title: 'Mrs Nair · wants a Polki choker like the one in the window', source: 'counter', state: 'being_worked',
    arrivedAt: DEMO_BASE - 40 * MIN, customerName: 'Mrs Nair', phone: '+91 98401 55505', takenBy: 'Rajesh Verma',
    items: [li('LI-210-1', 'Polki Choker', 'Polki', 1, null)],
  }),
  lead({
    id: 'LD-2026-211', title: 'Kavitha Jewellers, Madurai · 12 bangles', source: 'email', state: 'being_worked', arrivedAt: hoursAgo(20), customerName: 'Kavitha Jewellers',
    phone: '+91 98401 66601', takenBy: 'Deepak Rao', items: [li('LI-211-1', 'Floral Meenakari Bangle', 'Meenakari', 12, 28)],
  }),
  lead({
    id: 'LD-2026-212', title: 'Dr Fathima Beevi · antique temple jhumka', source: 'whatsapp', state: 'being_worked', arrivedAt: hoursAgo(26), customerName: 'Dr Fathima Beevi',
    phone: '+91 98401 55508', takenBy: 'Rajesh Verma', items: [li('LI-212-1', 'Antique Temple Jhumka', 'Antique', 1, 16)],
  }),
  lead({
    id: 'LD-2026-213', title: 'Mrs Lakshmi Narayanan · peacock ruby pendant', source: 'counter', state: 'opened', arrivedAt: hoursAgo(3), customerName: 'Mrs Lakshmi Narayanan',
    phone: '+91 98401 66602', takenBy: 'Deepak Rao', items: [li('LI-213-1', 'Peacock Ruby Pendant', 'Antique', 1, 18)],
  }),
  lead({
    id: 'LD-2026-201', title: 'Meera Iyer · peacock ruby pendant pair', source: 'whatsapp', state: 'converted', arrivedAt: daysAgo(11), customerName: 'Meera Iyer',
    phone: '+91 98401 55501', takenBy: 'Rajesh Verma', items: [li('LI-201-1', 'Peacock Ruby Pendant', 'Antique', 2, 18.2, { kind: 'make', jobId: 'MO-2026-118' })],
  }),
  lead({
    id: 'LD-2026-202', title: 'Priya Malhotra · Floral Polki Bangles', source: 'counter', state: 'converted', arrivedAt: daysAgo(3), customerName: 'Priya Malhotra',
    phone: '+91 98401 55502', takenBy: 'Rajesh Verma', items: [li('LI-202-1', 'Floral Polki Bangles', 'Polki', 1, 64, { kind: 'stock', pieceId: 'TAG-8802' })],
  }),
  lead({
    id: 'LD-2026-203', title: 'Walk-in · navratna ring', source: 'counter', state: 'lost', arrivedAt: daysAgo(6), customerName: 'Walk-in', note: 'Customer went elsewhere.',
    takenBy: 'Deepak Rao', items: [li('LI-203-1', 'Navratna ring', 'Jadau', 1, 10)],
  }),
  lead({
    id: 'LD-2026-204', title: 'Chennai wholesaler · 20 kasu malas', source: 'email', state: 'lost', arrivedAt: daysAgo(8), customerName: 'Chennai Gold House', note: 'Quote expired.',
    items: [li('LI-204-1', 'Kasu Mala', 'Temple', 20, 50)],
  }),
];
// the choker and bangle pair that are held for converted leads
const heldIdx = pieces.findIndex((p) => p.id === 'TAG-8802');
pieces[heldIdx] = { ...pieces[heldIdx], heldForLeadId: 'LD-2026-202' };

// ---------------------------------------------------------------- metal pool
const ledgerSeed: Omit<PoolEntry, 'id'>[] = [
  { at: at(10, 1, 9), kind: 'opening', deltaG: 3000, note: 'Opening balance, October', ref: 'POOL' },
  { at: daysAgo(23), kind: 'issued', deltaG: -560, note: 'Issued for lot MO-2026-113', ref: 'MO-2026-113' },
  { at: daysAgo(22), kind: 'issued', deltaG: -507, note: 'Issued for lot MO-2026-112', ref: 'MO-2026-112' },
  { at: daysAgo(20), kind: 'issued', deltaG: -447.3, note: 'Issued for lot MO-2026-121', ref: 'MO-2026-121' },
  { at: daysAgo(18), kind: 'issued', deltaG: -160, note: 'Issued for Antique Kundan Choker', ref: 'MO-2026-115' },
  { at: daysAgo(15), kind: 'issued', deltaG: -161.12, note: 'Issued for Chettinad Temple Haram', ref: 'MO-2026-119' },
  { at: daysAgo(14), kind: 'issued', deltaG: -190.2, note: 'Issued for lot MO-2026-116', ref: 'MO-2026-116' },
  { at: daysAgo(12), kind: 'recovered', deltaG: 24.6, note: 'Scrap: Old Kasu Mala, melted', ref: 'TAG-6120' },
  { at: daysAgo(10), kind: 'issued', deltaG: -108, note: 'Issued for Peacock Ruby Pendant', ref: 'MO-2026-118' },
  { at: daysAgo(2), kind: 'issued', deltaG: -78.4, note: 'Issued for Temple Haram', ref: 'MO-2026-122' },
];
const ledger: PoolEntry[] = ledgerSeed.map((e, i) => ({ ...e, id: `PL-${String(i + 1).padStart(3, '0')}` })).reverse();
const balanceG = round4(fromU(ledger.reduce((a, e) => a + toU(e.deltaG), 0)));

// ---------------------------------------------------------------- audit
const audit: AuditEntry[] = [
  {
    id: 'AU-003', at: daysAgo(4), actorName: 'Sanjay Seth', actorRole: 'owner', kind: 'edit_applied', ref: 'TAG-8802',
    summary: 'TAG-8802 stone weight: 6.8100 → 6.7100', detail: 'Asked by Deepak Rao: stone re-weighed on the bench balance. Token 318 204.',
  },
  {
    id: 'AU-002', at: daysAgo(9), actorName: 'Sanjay Seth', actorRole: 'owner', kind: 'loss_accepted', ref: 'BATCH-2026-038',
    summary: 'BATCH-2026-038: loss of 52 mg accepted and released', detail: 'Polishing loss on a Kundan lot, within what the karigar normally loses.',
  },
  {
    id: 'AU-001', at: daysAgo(12), actorName: 'Sanjay Seth', actorRole: 'owner', kind: 'scrap_marked', ref: 'TAG-6120',
    summary: 'TAG-6120 marked as scrap · 24.6000 g back in the pool', detail: 'Asked by Rajesh Verma: 140 days unsold, damaged clasp.',
  },
];

// ---------------------------------------------------------------- the state
export function initialState(): AppState {
  return {
    seq: 300,
    scales: [
      { id: BENCH, name: 'Bench balance', readabilityG: 0.0001, capacityG: 600 },
      { id: PLATFORM, name: 'Platform scale', readabilityG: 0.01, capacityG: 30000 },
    ],
    karigars,
    staff,
    customers,
    pieces,
    parcels,
    leads,
    orderCopies,
    jobs,
    edits: [
      {
        id: 'ED-102', pieceId: 'TAG-8841', field: 'grossG', from: 48.65, to: 48.61, proposedBy: 'Rajesh Verma', proposedAt: DEMO_BASE - 2 * MIN,
        reason: 'Re-weighed on the calibrated balance this morning, reads 40 mg lighter than the tag. Correcting the tag to the true weight.',
        status: 'proposed', token: null, tokenIssuedAt: null, decidedAt: null,
      },
      {
        id: 'ED-101', pieceId: 'TAG-9012', field: 'stoneCount', from: 4, to: 5, proposedBy: 'Deepak Rao', proposedAt: hoursAgo(2),
        reason: 'Counted again under the loupe: there are five stones, not four.',
        status: 'proposed', token: null, tokenIssuedAt: null, decidedAt: null,
      },
    ],
    problems: [
      {
        id: 'PR-101', target: { kind: 'job', id: 'MO-2026-118' }, raisedBy: 'Vijay Kumar', raisedByRole: 'karigar', raisedAt: at(11, 1, 8, 40), status: 'open',
        text: 'Two kemp stones cracked while setting. I need a replacement before I can finish.', clearedBy: null, clearedAt: null,
      },
    ],
    scrapRequests: [
      {
        id: 'SR-101', pieceId: 'TAG-7701', reason: '108 days unsold. Melt and remake in a lighter style.', requestedBy: 'Rajesh Verma', requestedAt: hoursAgo(3),
        status: 'pending', decidedAt: null,
      },
    ],
    stockOuts,
    pool: { balanceG, ledger },
    audit,
    broadcasts: [],
    wishes: [
      { id: 'WS-101', at: DEMO_BASE - 90 * MIN, customerId: 'CU-001', kind: 'birthday', sender: 'Jai Gulab Dev Jewellers' },
      { id: 'WS-102', at: DEMO_BASE - 88 * MIN, customerId: 'CU-006', kind: 'anniversary', sender: 'Jai Gulab Dev Jewellers' },
      { id: 'WS-103', at: DEMO_BASE - 80 * MIN, customerId: 'CU-008', kind: 'birthday', sender: 'Rajesh Verma' },
      { id: 'WS-104', at: DEMO_BASE - 75 * MIN, customerId: 'CU-004', kind: 'birthday', sender: 'Rajesh Verma' },
    ],
    settings: {
      pricingEnabled: false,
      leadSlaHours: 8,
      requireEditToken: true,
      notifyChannels: { whatsapp: true, app: true, email: false },
      lateLeadAudience: 'staff_then_owner',
      autoSendWishes: false,
    },
    lastScaleId: BENCH,
  };
}
