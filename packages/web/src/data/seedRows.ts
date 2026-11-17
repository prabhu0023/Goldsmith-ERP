/**
 * Compact stock tables for the seed. Plain data, no assets, so scripts can load it.
 * Weights are grams. Image keys are resolved to files in seed.ts.
 */
export type ImageKey = 'choker' | 'haram' | 'bangle' | 'pendant' | 'ring' | 'jhumka';

/** [tag, name, kind, style, purity, grossG, stoneG, stoneCount, madeBy, daysInStock, collection, image, huid] */
export type StockRow = [string, string, string, string, string, number, number, number, string, number, string, ImageKey, string];

/** In-stock pieces on the floor: 42 pieces, 1,847.2000 g pure gold. */
export const STOCK_ROWS: StockRow[] = [
['TAG-8841', 'Antique Kundan Choker', 'Kundan Choker', 'Kundan', '22K', 48.65, 7.06, 5, 'KG-02', 13, 'Festive Bridal 2026', 'choker', '9X82K1'],
  ['TAG-8802', 'Floral Polki Bangles', 'Polki Kada', 'Polki', '22K', 64.2, 6.71, 4, 'KG-02', 16, 'Polki Edit', 'bangle', 'L9R346'],
  ['TAG-9040', 'Jadau Emerald Ring', 'Jadau Emerald Ring', 'Jadau', '18K', 13.9, 1.3, 3, 'KG-01', 9, 'Jadau Edit', 'ring', '8H33Z9'],
  ['TAG-9012', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 21.2, 1.9, 4, 'KG-02', 11, 'Everyday Gold', 'pendant', 'P3YD25'],
  ['TAG-7702', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', '22K', 36.2, 5.0, 3, 'KG-01', 96, 'Festive Bridal 2026', 'haram', 'TS4F5T'],
  ['TAG-7703', 'Kasu Mala', 'Kasu Mala', 'Temple', '22K', 27.7, 3.2, 3, 'KG-01', 102, 'Temple Edit', 'haram', '37E3R3'],
  ['TAG-7704', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', '22K', 25.2, 2.4, 3, 'KG-01', 91, 'Festive Bridal 2026', 'haram', 'E28JS9'],
  ['TAG-7705', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 23.0, 2.0, 3, 'KG-01', 94, 'Temple Edit', 'jhumka', '7KB6CP'],
  ['TAG-7706', 'Temple Nakshi Ring', 'Temple Nakshi Ring', 'Nakshi', '22K', 20.1, 1.6, 3, 'KG-01', 99, 'Temple Edit', 'ring', '643DXT'],
  ['TAG-8701', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 30.5582, 3.8469, 2, 'KG-02', 33, 'Antique Edit', 'pendant', 'BF5KZX'],
  ['TAG-8704', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 36.1367, 2.5759, 0, 'KG-01', 67, 'Antique Edit', 'pendant', 'SAM9XS'],
  ['TAG-8707', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', '22K', 146.3632, 4.3105, 4, 'KG-04', 42, 'Festive Bridal 2026', 'haram', 'MNXV45'],
  ['TAG-8710', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 29.2661, 2.3283, 0, 'KG-04', 41, 'Everyday Gold', 'pendant', 'UJQN1V'],
  ['TAG-8713', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 26.2203, 2.2342, 0, 'KG-01', 38, 'Antique Edit', 'pendant', '8FRRX5'],
  ['TAG-8716', 'Floral Polki Kada', 'Polki Kada', 'Polki', '22K', 59.1754, 5.1978, 1, 'KG-02', 72, 'Polki Edit', 'bangle', 'HSNQE9'],
  ['TAG-8719', 'Antique Kundan Choker', 'Kundan Choker', 'Kundan', '22K', 63.7731, 5.9278, 1, 'KG-01', 64, 'Festive Bridal 2026', 'choker', 'BGJ09S'],
  ['TAG-8722', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 24.3881, 2.1327, 1, 'KG-04', 67, 'Temple Edit', 'jhumka', '3VRRRR'],
  ['TAG-8725', 'Antique Kundan Choker', 'Kundan Choker', 'Kundan', '22K', 72.3605, 6.6018, 1, 'KG-01', 28, 'Festive Bridal 2026', 'choker', 'UA7M36'],
  ['TAG-8728', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', '22K', 125.725, 6.1465, 2, 'KG-04', 5, 'Festive Bridal 2026', 'haram', '4DQ9GN'],
  ['TAG-8731', 'Kasu Mala', 'Kasu Mala', 'Temple', '22K', 83.143, 0.6843, 6, 'KG-02', 61, 'Temple Edit', 'haram', 'WWK596'],
  ['TAG-8734', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 36.0892, 2.9572, 5, 'KG-01', 68, 'Antique Edit', 'pendant', '1DZP91'],
  ['TAG-8737', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 23.122, 2.2858, 0, 'KG-04', 35, 'Temple Edit', 'jhumka', 'ZPANEY'],
  ['TAG-8740', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 34.0405, 3.2265, 6, 'KG-01', 32, 'Antique Edit', 'pendant', 'RECZXN'],
  ['TAG-8743', 'Chettinad Temple Haram', 'Temple Haram', 'Chettinad', '22K', 145.8937, 7.1605, 3, 'KG-02', 26, 'Festive Bridal 2026', 'haram', 'NUNP5E'],
  ['TAG-8746', 'Antique Kundan Choker', 'Kundan Choker', 'Kundan', '22K', 65.3592, 5.7868, 1, 'KG-02', 80, 'Festive Bridal 2026', 'choker', '0WN57Q'],
  ['TAG-8749', 'Floral Meenakari Bangle', 'Meenakari Bangle', 'Meenakari', '22K', 44.6529, 1.357, 6, 'KG-04', 44, 'Everyday Gold', 'bangle', '5RVR5A'],
  ['TAG-8752', 'Floral Polki Kada', 'Polki Kada', 'Polki', '22K', 76.5833, 3.1102, 4, 'KG-02', 20, 'Polki Edit', 'bangle', 'WN9810'],
  ['TAG-8755', 'Antique Kundan Choker', 'Kundan Choker', 'Kundan', '22K', 72.3241, 8.7345, 3, 'KG-01', 29, 'Festive Bridal 2026', 'choker', '1GDJYF'],
  ['TAG-8758', 'Kasu Mala', 'Kasu Mala', 'Temple', '22K', 80.858, 1.3165, 6, 'KG-01', 9, 'Temple Edit', 'haram', 'NVZSY8'],
  ['TAG-8761', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 20.8913, 2.0211, 6, 'KG-02', 25, 'Temple Edit', 'jhumka', '09B9W7'],
  ['TAG-8764', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 19.1925, 2.3647, 4, 'KG-04', 63, 'Temple Edit', 'jhumka', '63FCH2'],
  ['TAG-8767', 'Antique Kundan Choker', 'Kundan Choker', 'Kundan', '22K', 72.7207, 7.2469, 6, 'KG-01', 58, 'Festive Bridal 2026', 'choker', 'LYYCHU'],
  ['TAG-8770', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 27.1937, 1.9561, 1, 'KG-04', 68, 'Temple Edit', 'jhumka', 'GCU8S7'],
  ['TAG-8773', 'Jadau Emerald Ring', 'Jadau Emerald Ring', 'Jadau', '18K', 19.282, 0.8871, 1, 'KG-02', 11, 'Jadau Edit', 'ring', 'DK79P9'],
  ['TAG-8776', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 35.5853, 2.9351, 1, 'KG-04', 14, 'Everyday Gold', 'pendant', 'RXAEAT'],
  ['TAG-8779', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 25.1413, 1.8426, 2, 'KG-02', 13, 'Temple Edit', 'jhumka', 'P1MVU1'],
  ['TAG-8782', 'Jadau Emerald Ring', 'Jadau Emerald Ring', 'Jadau', '18K', 17.5869, 1.5487, 4, 'KG-01', 16, 'Jadau Edit', 'ring', 'E65GH2'],
  ['TAG-8785', 'Floral Polki Kada', 'Polki Kada', 'Polki', '22K', 54.9719, 3.5182, 3, 'KG-04', 35, 'Polki Edit', 'bangle', 'R9YXL5'],
  ['TAG-8788', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 22.3982, 2.3764, 3, 'KG-01', 36, 'Everyday Gold', 'pendant', '15G5E4'],
  ['TAG-8791', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 35.9151, 1.9075, 2, 'KG-04', 55, 'Everyday Gold', 'pendant', 'H82ZF7'],
  ['TAG-8794', 'Floral Polki Kada', 'Polki Kada', 'Polki', '22K', 54.5869, 3.7246, 2, 'KG-04', 41, 'Polki Edit', 'bangle', 'ZDJUYB'],
  ['TAG-8797', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 28.0087, 1.0363, 2, 'KG-01', 3, 'Everyday Gold', 'pendant', '1YCYWF'],
];

/** [tag, name, kind, style, purity, grossG, stoneG, madeBy, image, huid] */
export type BilledRow = [string, string, string, string, string, number, number, string, ImageKey, string];

/** Eleven pieces that went out today: 212.4000 g pure gold. */
export const BILLED_TODAY: BilledRow[] = [
  ['TAG-8300', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 20.1447, 3.7137, 'KG-02', 'pendant', 'UYCBYW'],
  ['TAG-8302', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 14.6116, 1.3723, 'KG-02', 'jhumka', 'K952RU'],
  ['TAG-8304', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 15.7935, 2.3001, 'KG-04', 'jhumka', '0Z432C'],
  ['TAG-8306', 'Floral Polki Kada', 'Polki Kada', 'Polki', '22K', 34.2792, 5.3343, 'KG-02', 'bangle', 'UCZEJX'],
  ['TAG-8308', 'Antique Kundan Choker', 'Kundan Choker', 'Kundan', '22K', 41.2934, 6.372, 'KG-02', 'choker', 'S5GLEY'],
  ['TAG-8310', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 11.7366, 2.1263, 'KG-01', 'pendant', 'R6JQ41'],
  ['TAG-8312', 'Floral Meenakari Bangle', 'Meenakari Bangle', 'Meenakari', '22K', 24.1607, 1.427, 'KG-01', 'bangle', 'WQRS4C'],
  ['TAG-8314', 'Floral Meenakari Bangle', 'Meenakari Bangle', 'Meenakari', '22K', 24.118, 1.6738, 'KG-02', 'bangle', 'M0S78F'],
  ['TAG-8316', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 10.5086, 1.1198, 'KG-02', 'jhumka', 'BCUYC8'],
  ['TAG-8318', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 17.9047, 2.233, 'KG-02', 'pendant', 'D0HK1D'],
  ['TAG-8320', 'Floral Polki Kada', 'Polki Kada', 'Polki', '22K', 31.0844, 5.5631, 'KG-04', 'bangle', '629DUG'],
];

/** Twelve pieces that went out earlier in the week. */
export const BILLED_EARLIER: BilledRow[] = [
  ['TAG-7914', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 52.363, 5.9869, 'KG-02', 'pendant', 'Q445DF'],
  ['TAG-8102', 'Antique Kundan Choker', 'Kundan Choker', 'Kundan', '22K', 49.6205, 6.1151, 'KG-02', 'choker', '8W8QB9'],
  ['TAG-8104', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 23.0842, 2.6356, 'KG-01', 'pendant', 'CACQW5'],
  ['TAG-8106', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 15.5214, 2.2181, 'KG-04', 'pendant', 'GFRGSX'],
  ['TAG-8108', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 19.2007, 2.8585, 'KG-01', 'pendant', '8EW4HD'],
  ['TAG-8110', 'Floral Polki Kada', 'Polki Kada', 'Polki', '22K', 44.9797, 3.2075, 'KG-02', 'bangle', 'UF32BJ'],
  ['TAG-8112', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 19.31, 2.9461, 'KG-01', 'pendant', 'P8UMZ8'],
  ['TAG-8114', 'Jadau Emerald Ring', 'Jadau Emerald Ring', 'Jadau', '18K', 9.2456, 0.8215, 'KG-02', 'ring', 'K214W4'],
  ['TAG-8116', 'Antique Temple Jhumka', 'Antique Jhumka', 'Antique', '22K', 15.1106, 1.2732, 'KG-01', 'jhumka', '4UP28M'],
  ['TAG-8118', 'Meenakari Pendant', 'Meenakari Pendant', 'Meenakari', '22K', 14.8493, 1.9466, 'KG-01', 'pendant', 'S1X0QQ'],
  ['TAG-8120', 'Jadau Emerald Ring', 'Jadau Emerald Ring', 'Jadau', '18K', 9.0871, 0.8867, 'KG-01', 'ring', '7GSMQV'],
  ['TAG-8122', 'Peacock Ruby Pendant', 'Peacock Ruby Pendant', 'Antique', '22K', 20.0888, 3.0825, 'KG-04', 'pendant', 'Y1K5W1'],
];
