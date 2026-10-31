// In-memory "database". Note: books store authorId, not an author object.
export interface AuthorRow {
  id: string;
  name: string;
  born: number | null;
}

export interface BookRow {
  id: string;
  title: string;
  year: number;
  genre: 'FICTION' | 'SCIFI' | 'FANTASY' | 'HISTORY';
  authorId: string;
}

export const authors: AuthorRow[] = [
  { id: 'au1', name: 'Ursula K. Le Guin', born: 1929 },
  { id: 'au2', name: 'Octavia E. Butler', born: 1947 },
  { id: 'au3', name: 'Mary Beard', born: 1955 },
];

export const books: BookRow[] = [
  { id: 'b1', title: 'The Dispossessed', year: 1974, genre: 'SCIFI', authorId: 'au1' },
  { id: 'b2', title: 'A Wizard of Earthsea', year: 1968, genre: 'FANTASY', authorId: 'au1' },
  { id: 'b3', title: 'Kindred', year: 1979, genre: 'FICTION', authorId: 'au2' },
  { id: 'b4', title: 'Parable of the Sower', year: 1993, genre: 'SCIFI', authorId: 'au2' },
  { id: 'b5', title: 'SPQR', year: 2015, genre: 'HISTORY', authorId: 'au3' },
];
