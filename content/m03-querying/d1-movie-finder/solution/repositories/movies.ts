import { Movie } from '../models/Movie';

export interface MovieSearch {
  genre?: string;
  minRating?: number;
  yearFrom?: number;
  yearTo?: number;
  search?: string;
  sort?: 'rating' | 'year' | 'title';
  page?: number;
  pageSize?: number;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  rating: { rating: -1, _id: 1 },
  year: { year: -1, _id: 1 },
  title: { title: 1, _id: 1 },
} as const;

export async function findMovies(options: MovieSearch = {}) {
  const { genre, minRating, yearFrom, yearTo, search, sort = 'rating' } = options;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 10));

  const filter: Record<string, unknown> = {};
  if (genre) filter.genres = genre.toLowerCase();
  if (minRating !== undefined) filter.rating = { $gte: minRating };
  if (yearFrom !== undefined || yearTo !== undefined) {
    const year: Record<string, number> = {};
    if (yearFrom !== undefined) year.$gte = yearFrom;
    if (yearTo !== undefined) year.$lte = yearTo;
    filter.year = year;
  }
  if (search?.trim()) filter.title = { $regex: escapeRegex(search.trim()), $options: 'i' };

  const [items, total] = await Promise.all([
    Movie.find(filter)
      .sort(SORTS[sort] ?? SORTS.rating)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Movie.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / pageSize) };
}
