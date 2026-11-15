import kundanChoker from '../assets/images/antique_kundan_choker_1793356203018.jpg';
import chettinadHaram from '../assets/images/chettinad_haram_necklace_1793356204785.jpg';
import polkiBangle from '../assets/images/floral_polki_bangle_1793356203612.jpg';
import peacockPendant from '../assets/images/peacock_ruby_pendant_1793356204370.jpg';
import type { ImageKey } from './seedRows';

export const images = { kundanChoker, chettinadHaram, polkiBangle, peacockPendant };

/** Every reference photo available to attach to a lead or an order copy. */
export const imageList: { id: string; label: string; src: string }[] = [
  { id: 'kundan-choker', label: 'Antique Kundan Choker', src: kundanChoker },
  { id: 'chettinad-haram', label: 'Chettinad Haram', src: chettinadHaram },
  { id: 'polki-bangle', label: 'Floral Polki Bangle', src: polkiBangle },
  { id: 'peacock-pendant', label: 'Peacock Ruby Pendant', src: peacockPendant },
];

/** Which photo stands in for a kind of piece. */
export const imageForKey = (key: ImageKey): string => {
  switch (key) {
    case 'choker':
      return kundanChoker;
    case 'haram':
      return chettinadHaram;
    case 'bangle':
      return polkiBangle;
    case 'pendant':
      return peacockPendant;
    case 'ring':
      return peacockPendant;
    case 'jhumka':
      return chettinadHaram;
  }
};
