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

export async function findMovies(options: MovieSearch = {}) {
  // TODO: build the filter from the options that were given,
  // sort with a tiebreaker, page, and count.
  return { items: [], total: 0, page: 1, pages: 0 };
}
