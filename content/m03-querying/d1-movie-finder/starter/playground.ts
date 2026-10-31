import { Movie } from './models/Movie';
import { findMovies } from './repositories/movies';

await Movie.create([
  { title: 'Mission: Impossible (1996)', year: 1996, rating: 7.1, genres: ['action'] },
  { title: 'Arrival', year: 2016, rating: 7.9, genres: ['scifi', 'drama'] },
  { title: 'Alien', year: 1979, rating: 8.5, genres: ['scifi', 'horror'] },
  { title: 'Aliens', year: 1986, rating: 8.4, genres: ['scifi', 'action'] },
  { title: 'Spirited Away', year: 2001, rating: 8.6, genres: ['animation'] },
]);

console.log(await findMovies({ genre: 'scifi', sort: 'year' }));
console.log(await findMovies({ search: 'impossible (' }));
console.log(await findMovies({ yearFrom: 1980, pageSize: 2, page: 2 }));
