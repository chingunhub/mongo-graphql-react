import { atom } from 'jotai';

// TODO: export selectedTicketIdsAtom, holding the selected ticket IDs.
export const selectedTicketIdsAtom = atom<string[] | null>(null);
