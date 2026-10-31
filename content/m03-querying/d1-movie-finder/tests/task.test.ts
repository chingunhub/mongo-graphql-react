import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb } from '@forge/kit';
import { Movie } from '../models/Movie';
import { findMovies } from '../repositories/movies';

const titles = (r: { items: any[] }) => r.items.map((m) => m.title);

beforeEach(async () => {
  await resetDb();
  await Movie.create([
    { title: 'Mission: Impossible (1996)', year: 1996, rating: 7.1, genres: ['action'] },
    { title: 'Arrival', year: 2016, rating: 7.9, genres: ['scifi', 'drama'] },
    { title: 'Alien', year: 1979, rating: 8.5, genres: ['scifi', 'horror'] },
    { title: 'Aliens', year: 1986, rating: 8.4, genres: ['scifi', 'action'] },
    { title: 'Spirited Away', year: 2001, rating: 8.6, genres: ['animation'] },
    { title: 'Akira', year: 1988, rating: 8.0 },
  ]);
});

test('no options: every movie, best rated first, with metadata', async () => {
  const r = await findMovies();
  expect(r.total).toBe(6);
  expect(r.page).toBe(1);
  expect(r.pages).toBe(1);
  expect(titles(r)).toEqual(['Spirited Away', 'Alien', 'Aliens', 'Akira', 'Arrival', 'Mission: Impossible (1996)']);
}, { hint: 'Akira has no genres. If it is missing, an undefined option is filtering something.' });

test('items are plain objects', async () => {
  const r = await findMovies();
  expect(r.items[0] instanceof mongoose.Document).toBe(false);
});

test('genre filters on array membership', async () => {
  const r = await findMovies({ genre: 'scifi' });
  expect(titles(r).sort()).toEqual(['Alien', 'Aliens', 'Arrival']);
  expect(r.total).toBe(3);
});

test('minRating is inclusive', async () => {
  const r = await findMovies({ minRating: 8.4 });
  expect(titles(r).sort()).toEqual(['Alien', 'Aliens', 'Spirited Away']);
});

test('year range is inclusive and each bound works alone', async () => {
  expect(titles(await findMovies({ yearFrom: 1986, yearTo: 1996 })).sort()).toEqual([
    'Akira',
    'Aliens',
    'Mission: Impossible (1996)',
  ]);
  expect(titles(await findMovies({ yearFrom: 2001 })).sort()).toEqual(['Arrival', 'Spirited Away']);
  expect(titles(await findMovies({ yearTo: 1979 }))).toEqual(['Alien']);
}, { hint: 'Build { $gte?, $lte? } from whichever bounds exist.' });

test('filters combine', async () => {
  const r = await findMovies({ genre: 'scifi', yearTo: 1990, minRating: 8.45 });
  expect(titles(r)).toEqual(['Alien']);
});

test('search is case-insensitive "contains"', async () => {
  expect(titles(await findMovies({ search: 'ALIEN' })).sort()).toEqual(['Alien', 'Aliens']);
});

test('search treats special characters literally', async () => {
  expect(titles(await findMovies({ search: 'impossible (' }))).toEqual(['Mission: Impossible (1996)']);
  expect((await findMovies({ search: 'A.ien' })).total).toBe(0);
  expect((await findMovies({ search: '.*' })).total).toBe(0);
}, { hint: 'Escape regex metacharacters in the input before building the $regex.' });

test('sort by year (newest first) and by title (A→Z)', async () => {
  expect(titles(await findMovies({ sort: 'year' }))[0]).toBe('Arrival');
  expect(titles(await findMovies({ sort: 'title' }))).toEqual([
    'Akira',
    'Alien',
    'Aliens',
    'Arrival',
    'Mission: Impossible (1996)',
    'Spirited Away',
  ]);
});

test('pages: skip/limit and page count', async () => {
  const p2 = await findMovies({ sort: 'title', pageSize: 4, page: 2 });
  expect(titles(p2)).toEqual(['Mission: Impossible (1996)', 'Spirited Away']);
  expect(p2.total).toBe(6);
  expect(p2.pages).toBe(2);
  expect(p2.page).toBe(2);
});

test('total counts the filtered set, not the collection', async () => {
  const r = await findMovies({ genre: 'scifi', pageSize: 1 });
  expect(r.items).toHaveLength(1);
  expect(r.total).toBe(3);
  expect(r.pages).toBe(3);
});

test('pageSize is capped at 50', async () => {
  await Movie.create(Array.from({ length: 60 }, (_, i) => ({ title: 'Filler ' + i, year: 2000, rating: 1 })));
  const r = await findMovies({ pageSize: 500 });
  expect(r.items).toHaveLength(50);
  expect(r.pages).toBe(2);
});

test('paging through ties shows every movie exactly once', async () => {
  await resetDb();
  await Movie.create(Array.from({ length: 23 }, (_, i) => ({ title: 'Same ' + i, year: 2000, rating: 5 })));
  const seen: string[] = [];
  for (let page = 1; page <= 5; page++) {
    seen.push(...titles(await findMovies({ sort: 'rating', pageSize: 5, page })));
  }
  expect(seen).toHaveLength(23);
  expect(new Set(seen).size).toBe(23);
}, { hint: 'Every sort needs a unique tiebreaker as its last key — _id.' });

test('no matches: empty items, total 0, pages 0', async () => {
  expect(await findMovies({ genre: 'western' })).toEqual({ items: [], total: 0, page: 1, pages: 0 });
});
