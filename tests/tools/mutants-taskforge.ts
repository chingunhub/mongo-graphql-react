// Wrong answers (and a few valid alternatives) for the Taskforge half of the course, modules 0-13.
// Same rules as the rest of mutate-graders: a bug must be killed, an alt must pass, a stale edit fails.
type R = [string, string];
export interface Dsl {
  bug: (task: string, name: string, file: string, ...edits: R[]) => void;
  alt: (task: string, name: string, file: string, ...edits: R[]) => void;
}

export function addTaskforgeMutants({ bug, alt }: Dsl) {
  const USER = 'server/models/User.ts';
  const ISSUE = 'server/models/Issue.ts';
  const PROJECT = 'server/models/Project.ts';
  const REPO = 'server/repositories/issues.ts';
  const COMMENTS = 'server/repositories/comments.ts';
  const SCHEMA = 'server/graphql/schema/issue.ts';
  const IR = 'server/graphql/resolvers/issue.ts';
  const PR = 'server/graphql/resolvers/project.ts';
  const CR = 'server/graphql/resolvers/comment.ts';
  const CTX = 'server/graphql/context.ts';
  const ERR = 'server/graphql/errors.ts';
  const PERM = 'server/services/permissions.ts';
  const LD = 'server/graphql/loaders.ts';
  const PG = 'server/graphql/pagination.ts';
  const APOLLO = 'web/apollo.ts';
  const LIST = 'web/components/IssueList.tsx';
  const FORM = 'web/components/CreateIssueForm.tsx';
  const SELECT = 'web/components/StatusSelect.tsx';
  const BOARD = 'web/components/Board.tsx';
  const CARD = 'web/components/IssueCard.tsx';

  // --- m00
  const WARM = 'board.ts';
  const SORT = 'column.sort((a, b) => RANK[a.priority] - RANK[b.priority])';
  bug('d1-warmup', 'columns left unsorted', WARM, [`for (const column of Object.values(board)) ${SORT};\n`, '']);
  bug('d1-warmup', 'priority order reversed', WARM, [`RANK[a.priority] - RANK[b.priority]`, `RANK[b.priority] - RANK[a.priority]`]);
  bug('d1-warmup', 'empty columns missing', WARM, [
    `const board: Board = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };\n  for (const issue of issues) board[issue.status].push(issue);`,
    `const board = {} as Board;\n  for (const issue of issues) (board[issue.status] ??= []).push(issue);`,
  ]);
  alt('d1-warmup', 'ALT sort first, then group', WARM,
    [`for (const issue of issues) board[issue.status].push(issue);`, `for (const issue of [...issues].sort((a, b) => RANK[a.priority] - RANK[b.priority])) board[issue.status].push(issue);`],
    [`  for (const column of Object.values(board)) ${SORT};\n`, '']);

  // --- m01
  const RECIPE = 'models/Recipe.ts';
  bug('d1-recipe-model', 'tags keep their case', RECIPE, [`tags: [{ type: String, trim: true, lowercase: true }]`, `tags: [{ type: String, trim: true }]`]);
  bug('d1-recipe-model', 'limit excludes the boundary', RECIPE, [`$lte: maxMinutes`, `$lt: maxMinutes`]);
  bug('d1-recipe-model', '_id kept in the result', RECIPE, [`'title minutes -_id'`, `'title minutes'`]);
  bug('d1-recipe-model', 'no title tie-break', RECIPE, [`.sort({ minutes: 1, title: 1 })`, `.sort({ minutes: 1 })`]);
  bug('d1-recipe-model', 'count ignores vegetarian', RECIPE, [`countDocuments({ vegetarian: true })`, `countDocuments()`]);
  bug('d1-recipe-model', 'no timestamps', RECIPE, [`{ timestamps: true },\n`, `{},\n`]);
  bug('f1-user-model', 'email keeps its case', USER, [`email: { type: String, required: true, trim: true, lowercase: true }`, `email: { type: String, required: true, trim: true }`]);
  bug('f1-user-model', 'email keeps spaces', USER, [`email: { type: String, required: true, trim: true, lowercase: true }`, `email: { type: String, required: true, lowercase: true }`]);
  bug('f1-user-model', 'users unsorted', USER, [`User.find().sort({ name: 1 })`, `User.find()`]);
  bug('f1-user-model', 'role not restricted', USER, [`enum: ROLES, `, ``]);
  bug('f1-user-model', 'no default role', USER, [`, default: 'MEMBER'`, ``]);
  bug('f1-user-model', 'name optional', USER, [`name: { type: String, required: true, trim: true }`, `name: { type: String, trim: true }`]);

  // --- m02
  const EVENT = 'models/Event.ts';
  bug('d1-event-tickets', 'capacity may be zero', EVENT, [`min: 1,\n      validate`, `validate`]);
  bug('d1-event-tickets', 'capacity may be fractional', EVENT, [`      validate: { validator: Number.isInteger, message: 'Capacity must be a whole number' },\n`, '']);
  bug('d1-event-tickets', 'end may equal start', EVENT, [`value > this.startsAt`, `value >= this.startsAt`]);
  bug('d1-event-tickets', 'price may be negative', EVENT, [`price: { type: Number, default: 0, min: 0 }`, `price: { type: Number, default: 0 }`]);
  bug('d1-event-tickets', 'title has no maximum', EVENT, [`      maxlength: 80,\n`, '']);
  bug('d1-event-tickets', 'custom title message lost', EVENT, [`minlength: [3, 'Title must be at least 3 characters']`, `minlength: 3`]);
  alt('d1-event-tickets', 'ALT compare times', EVENT, [`return value > this.startsAt;`, `return value.getTime() > new Date(this.startsAt).getTime();`]);
  const LISTS = 'models/Playlist.ts';
  bug('d2-playlist', 'limit off by one', LISTS, [`tracks.length <= 50`, `tracks.length < 50`]);
  bug('d2-playlist', 'seconds not padded', LISTS, [`String(total % 60).padStart(2, '0')`, `String(total % 60)`]);
  bug('d2-playlist', 'zero second tracks', LISTS, [`seconds: { type: Number, required: true, min: 1 }`, `seconds: { type: Number, required: true }`]);
  bug('d2-playlist', 'added track never saved', LISTS, [`playlist.tracks.push(track);\n  await playlist.save();`, `playlist.tracks.push(track);`]);
  bug('d2-playlist', 'removal never saved', LISTS, [`playlist.tracks.pull(trackId);\n  await playlist.save();`, `playlist.tracks.pull(trackId);`]);
  bug('d2-playlist', 'add reaches past the limit', LISTS, [`playlist.tracks.push(track);\n  await playlist.save();`, `playlist.tracks.push(track);\n  await playlist.save({ validateBeforeSave: false });`]);
  alt('d2-playlist', 'ALT filter the array', LISTS, [`playlist.tracks.pull(trackId);`, `(playlist as any).tracks = playlist.tracks.filter((t: any) => String(t._id) !== trackId);`]);
  bug('f2-projects-issues', 'numbers unique across all projects', ISSUE, [`issueSchema.index({ project: 1, number: 1 }, { unique: true });`, `issueSchema.index({ number: 1 }, { unique: true });`]);
  bug('f2-projects-issues', 'numbers not unique', ISSUE, [`issueSchema.index({ project: 1, number: 1 }, { unique: true });\n`, '']);
  bug('f2-projects-issues', 'labels get their own ids', ISSUE, [`  { _id: false },\n`, '']);
  bug('f2-projects-issues', 'label names keep their case', ISSUE, [`name: { type: String, required: true, trim: true, lowercase: true, maxlength: 30 }`, `name: { type: String, required: true, trim: true, maxlength: 30 }`]);
  bug('f2-projects-issues', 'colour format unchecked', ISSUE, [`      match: [/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #ff8800'],\n`, '']);
  bug('f2-projects-issues', 'short titles accepted', ISSUE, [`minlength: 3, `, '']);
  bug('f2-projects-issues', 'long titles accepted', ISSUE, [`, maxlength: 120`, '']);
  bug('f2-projects-issues', 'no default status', ISSUE, [`status: { type: String, enum: STATUSES, default: 'TODO' }`, `status: { type: String, enum: STATUSES }`]);
  bug('f2-projects-issues', 'reporter optional', ISSUE, [`reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true }`, `reporter: { type: Schema.Types.ObjectId, ref: 'User' }`]);
  bug('f2-projects-issues', 'no unassigned default', ISSUE, [`assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null }`, `assignee: { type: Schema.Types.ObjectId, ref: 'User' }`]);
  bug('f2-projects-issues', 'key of any length', PROJECT, [`/^[A-Z]{2,5}$/`, `/^[A-Z]+$/`]);
  bug('f2-projects-issues', 'key not uppercased', PROJECT, [`      uppercase: true,\n`, '']);
  bug('f2-projects-issues', 'key not unique', PROJECT, [`      unique: true,\n`, '']);
  bug('f2-projects-issues', 'email not unique', USER, [`lowercase: true, unique: true }`, `lowercase: true }`]);
  alt('f2-projects-issues', 'ALT key checked by a validator', PROJECT, [`match: [/^[A-Z]{2,5}$/, 'Project key must be 2–5 letters'],`, `validate: { validator: (v: string) => /^[A-Z]{2,5}$/.test(v), message: 'Project key must be 2–5 letters' },`]);

  // --- m03
  const MOVIES = 'repositories/movies.ts';
  bug('d1-movie-finder', 'search is a raw regex', MOVIES, [`$regex: escapeRegex(search.trim())`, `$regex: search.trim()`]);
  bug('d1-movie-finder', 'search case sensitive', MOVIES, [`, $options: 'i'`, '']);
  bug('d1-movie-finder', 'minimum rating exclusive', MOVIES, [`{ $gte: minRating }`, `{ $gt: minRating }`]);
  bug('d1-movie-finder', 'year end exclusive', MOVIES, [`year.$lte = yearTo`, `year.$lt = yearTo`]);
  bug('d1-movie-finder', 'page size not capped', MOVIES, [`Math.min(50, Math.max(1, options.pageSize ?? 10))`, `Math.max(1, options.pageSize ?? 10)`]);
  bug('d1-movie-finder', 'pages rounded down', MOVIES, [`Math.ceil(total / pageSize)`, `Math.floor(total / pageSize)`]);
  bug('d1-movie-finder', 'total ignores filter', MOVIES, [`Movie.countDocuments(filter)`, `Movie.countDocuments()`]);
  bug('d1-movie-finder', 'skip off by a page', MOVIES, [`.skip((page - 1) * pageSize)`, `.skip(page * pageSize)`]);
  bug('d1-movie-finder', 'sort has no tie-break', MOVIES, [`rating: { rating: -1, _id: 1 }`, `rating: { rating: -1 }`], [`year: { year: -1, _id: 1 }`, `year: { year: -1 }`], [`title: { title: 1, _id: 1 }`, `title: { title: 1 }`]);
  alt('d1-movie-finder', 'ALT awaits one query at a time', MOVIES,
    [`const [items, total] = await Promise.all([\n    Movie.find(filter)`, `const items = await Movie.find(filter)`],
    [`      .lean(),\n    Movie.countDocuments(filter),\n  ]);`, `      .lean();\n  const total = await Movie.countDocuments(filter);`]);
  const INV = 'repositories/inventory.ts';
  bug('d2-inventory', 'sale can oversell', INV, [`{ sku, stock: { $gte: qty } }`, `{ sku }`]);
  bug('d2-inventory', 'last unit cannot sell', INV, [`stock: { $gte: qty }`, `stock: { $gt: qty }`]);
  bug('d2-inventory', 'sale reads then saves', INV, [
    `const res = await Product.updateOne({ sku, stock: { $gte: qty } }, { $inc: { stock: -qty } });\n  return res.modifiedCount === 1;`,
    `const product = await Product.findOne({ sku });\n  if (!product || product.stock < qty) return false;\n  product.stock -= qty;\n  await product.save();\n  return true;`,
  ]);
  bug('d2-inventory', 'tags duplicate', INV, [`$addToSet: { tags: tag }`, `$push: { tags: tag }`]);
  bug('d2-inventory', 'price unvalidated', INV, [`, runValidators: true`, '']);
  bug('d2-inventory', 'restock accepts zero', INV, [`qty <= 0) throw`, `qty < 0) throw`]);
  bug('d2-inventory', 'restock returns the old stock', INV, [`{ $inc: { stock: qty } }, { returnDocument: 'after' }`, `{ $inc: { stock: qty } }`]);
  alt('d2-inventory', 'ALT matchedCount', INV, [`res.modifiedCount === 1`, `res.matchedCount === 1`]);
  bug('f3-issue-repository', 'unassigned filter ignored', REPO, [`if (filter.assigneeId !== undefined) q.assignee`, `if (filter.assigneeId) q.assignee`]);
  bug('f3-issue-repository', 'search is a raw regex', REPO, [`$regex: escapeRegex(filter.search.trim())`, `$regex: filter.search.trim()`]);
  bug('f3-issue-repository', 'search case sensitive', REPO, [`, $options: 'i'`, '']);
  bug('f3-issue-repository', 'filter loses the project', REPO, [`const q: Record<string, unknown> = { project: projectId };`, `const q: Record<string, unknown> = {};`]);
  bug('f3-issue-repository', 'limit not capped', REPO, [`Math.min(100, Math.max(1, options.limit ?? 20))`, `Math.max(1, options.limit ?? 20)`]);
  bug('f3-issue-repository', 'limit can be zero', REPO, [`Math.min(100, Math.max(1, options.limit ?? 20))`, `Math.min(100, options.limit ?? 20)`]);
  bug('f3-issue-repository', 'wrong default sort', REPO, [`options.sort ?? 'NEWEST'`, `options.sort ?? 'OLDEST'`]);
  bug('f3-issue-repository', 'newest has no tie-break', REPO, [`NEWEST: { createdAt: -1, _id: -1 }`, `NEWEST: { createdAt: -1 }`]);
  bug('f3-issue-repository', 'count ignores filter', REPO, [`Issue.countDocuments(buildIssueFilter(projectId, filter))`, `Issue.countDocuments({ project: projectId })`]);
  bug('f3-issue-repository', 'falsy patches dropped', REPO, [`if (patch[key] !== undefined) $set[key]`, `if (patch[key]) $set[key]`]);
  bug('f3-issue-repository', 'patch not allow-listed', REPO, [`for (const key of PATCHABLE) {`, `for (const key of Object.keys(patch) as (typeof PATCHABLE)[number][]) {`]);
  bug('f3-issue-repository', 'update skips validators', REPO, [`{ $set }, { returnDocument: 'after', runValidators: true }`, `{ $set }, { returnDocument: 'after' }`]);
  bug('f3-issue-repository', 'label added twice', REPO, [`{ _id: issueId, 'labels.name': { $ne: name } }`, `{ _id: issueId }`]);
  bug('f3-issue-repository', 'duplicate label returns null', REPO, [`return updated ?? Issue.findById(issueId);`, `return updated;`]);

  // --- m04
  const TEAM = 'models/Team.ts';
  const ROSTER = 'services/roster.ts';
  bug('b1-empty-roster', 'virtual joins the wrong field', TEAM, [`foreignField: 'team'`, `foreignField: '_id'`]);
  bug('b1-empty-roster', 'captain compared by identity', ROSTER, [`String(p._id) === String(team.captain)`, `p._id === team.captain`]);
  bug('b1-empty-roster', 'players unsorted', ROSTER, [`.populate({ path: 'players', options: { sort: { number: 1 } } })`, `.populate('players')`]);
  bug('b1-empty-roster', 'ids stay ObjectIds', ROSTER, [`id: String(team._id)`, `id: team._id`]);
  bug('b1-empty-roster', 'player ids stay ObjectIds', ROSTER, [`id: String(p._id)`, `id: p._id`]);
  alt('b1-empty-roster', 'ALT equals()', ROSTER, [`String(p._id) === String(team.captain)`, `p._id.equals(team.captain)`]);
  const AUTHOR = 'models/Author.ts';
  const BLOG = 'repositories/blog.ts';
  bug('d1-blog', 'drafts on the author page', AUTHOR, [`  match: { published: true },\n  options: { sort: { publishedAt: -1 } },`, `  options: { sort: { publishedAt: -1 } },`]);
  bug('d1-blog', 'count includes drafts', AUTHOR, [`  match: { published: true },\n  count: true,`, `  count: true,`]);
  bug('d1-blog', 'author page unsorted', AUTHOR, [`  options: { sort: { publishedAt: -1 } },\n`, '']);
  bug('d1-blog', 'virtuals missing from JSON', AUTHOR, [`{ toJSON: { virtuals: true }, toObject: { virtuals: true } },`, `{},`]);
  bug('d1-blog', 'latest includes drafts', BLOG, [`Post.find({ published: true })`, `Post.find()`]);
  bug('d1-blog', 'latest unsorted', BLOG, [`    .sort({ publishedAt: -1, _id: -1 })\n`, '']);
  bug('d1-blog', 'latest ignores the limit', BLOG, [`    .limit(limit)\n`, '']);
  bug('d1-blog', 'post leaks the author email', BLOG, [`.populate({ path: 'author', select: 'name avatar' })`, `.populate('author')`]);
  bug('d1-blog', 'latest leaks the author', BLOG, [`.populate({ path: 'author', select: 'name' })`, `.populate('author')`]);
  bug('d1-blog', 'page posts carry the body', BLOG, [`.populate({ path: 'posts', select: 'title slug publishedAt' })`, `.populate('posts')`]);
  const COMMENT = 'server/models/Comment.ts';
  bug('f4-comments', 'body has no limit', COMMENT, [`, maxlength: 2000`, '']);
  bug('f4-comments', 'body not trimmed', COMMENT, [`body: { type: String, required: true, trim: true, maxlength: 2000 }`, `body: { type: String, required: true, maxlength: 2000 }`]);
  bug('f4-comments', 'no comment index', COMMENT, [`commentSchema.index({ issue: 1, createdAt: 1 });\n`, '']);
  bug('f4-comments', 'comment on a missing issue', COMMENTS, [`  const exists = await Issue.exists({ _id: issueId });\n  if (!exists) return null;\n`, '']);
  bug('f4-comments', 'new comment has no author', COMMENTS, [`return comment.populate({ path: 'author', select: 'name' });`, `return comment;`]);
  bug('f4-comments', 'comments unsorted', COMMENTS, [`    .sort({ createdAt: 1, _id: 1 })\n`, '']);
  bug('f4-comments', 'list leaks the author', COMMENTS, [`.sort({ createdAt: 1, _id: 1 })\n    .populate({ path: 'author', select: 'name' })`, `.sort({ createdAt: 1, _id: 1 })\n    .populate('author')`]);
  bug('f4-comments', 'virtual comments unsorted', ISSUE, [`  options: { sort: { createdAt: 1 } },\n`, '']);
  bug('f4-comments', 'virtuals missing from JSON', ISSUE, [`{ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }`, `{ timestamps: true }`]);
  bug('f4-comments', 'detail misses the count', REPO, [`\n    .populate('commentCount')`, '']);
  bug('f4-comments', 'detail throws on a bad id', REPO, [`  if (!mongoose.isValidObjectId(id)) return null;\n`, '']);
  bug('f4-comments', 'detail leaks commenters', REPO, [`populate: { path: 'author', select: 'name' } }`, `populate: { path: 'author' } }`]);
  bug('f4-comments', 'detail leaves comment authors as ids', REPO, [`.populate({ path: 'comments', populate: { path: 'author', select: 'name' } })`, `.populate('comments')`]);

  // --- m05
  const ART = 'models/Article.ts';
  bug('d1-slugs-softdelete', 'slug rewritten on every save', ART, [`if (this.isModified('title')) this.slug`, `this.slug`]);
  bug('d1-slugs-softdelete', 'slug set only once', ART, [`if (this.isModified('title')) this.slug`, `if (this.isNew) this.slug`]);
  bug('d1-slugs-softdelete', 'withDeleted ignored', ART, [`  if (this.getOptions().withDeleted) return;\n`, '']);
  bug('d1-slugs-softdelete', 'count shows deleted', ART, [`['countDocuments', /^find/]`, `/^find/`]);
  bug('d1-slugs-softdelete', 'findOne shows deleted', ART, [`['countDocuments', /^find/]`, `['countDocuments', 'find']`]);
  bug('d1-slugs-softdelete', 'soft delete not saved', ART, [`this.deletedAt = new Date();\n  return this.save();`, `this.deletedAt = new Date();\n  return this;`]);
  bug('d1-slugs-softdelete', 'restore not saved', ART, [`this.deletedAt = null;\n  return this.save();`, `this.deletedAt = null;\n  return this;`]);
  const SALES = 'reports/sales.ts';
  const PAID = `status: 'PAID', createdAt: { $gte: from, $lt: to }`;
  bug('d2-sales-report', 'unpaid orders counted', SALES, [PAID, `createdAt: { $gte: from, $lt: to }`]);
  bug('d2-sales-report', 'window end inclusive', SALES, [`$lt: to`, `$lte: to`]);
  bug('d2-sales-report', 'window start exclusive', SALES, [`$gte: from`, `$gt: from`]);
  bug('d2-sales-report', 'orders counted per line', SALES, [`$addToSet: '$_id'`, `$push: '$_id'`]);
  bug('d2-sales-report', 'revenue ignores qty', SALES, [`{ $multiply: ['$items.qty', '$items.price'] }`, `'$items.price'`]);
  bug('d2-sales-report', 'limit ignored', SALES, [`    { $limit: limit },\n`, '']);
  bug('d2-sales-report', 'customer id is an ObjectId', SALES, [`customerId: { $toString: '$_id' }`, `customerId: '$_id'`]);
  bug('d2-sales-report', 'top customers count unpaid', SALES, [`    { $match: { status: 'PAID' } },\n`, '']);
  const COUNTER = 'server/models/Counter.ts';
  const STATS = 'server/services/stats.ts';
  bug('f5-numbers-stats', 'counter not upserted', COUNTER, [`{ upsert: true, returnDocument: 'after' }`, `{ returnDocument: 'after' }`]);
  bug('f5-numbers-stats', 'counter returns the old value', COUNTER, [`{ upsert: true, returnDocument: 'after' }`, `{ upsert: true }`]);
  bug('f5-numbers-stats', 'one counter for every project', ISSUE, ['`issue:${projectId}`', `'issue'`]);
  bug('f5-numbers-stats', 'numbers from a count', ISSUE, ['const number = await nextSequence(`issue:${projectId}`);', `const number = (await this.countDocuments({ project: projectId })) + 1;`]);
  bug('f5-numbers-stats', 'missing statuses dropped', STATS, [`const byStatus = STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));`, `const byStatus = rows.map((r) => ({ status: r._id, count: counts.get(r._id) ?? 0 }));`]);
  bug('f5-numbers-stats', 'stats id not cast', STATS, [`const project = new mongoose.Types.ObjectId(projectId);\n  const rows`, `const project = projectId as any;\n  const rows`]);
  bug('f5-numbers-stats', 'stats span every project', STATS, [`{ $match: { project } },`, `{ $match: {} },`]);
  bug('f5-numbers-stats', 'workload counts done issues', STATS, [`status: { $ne: 'DONE' }, `, '']);
  bug('f5-numbers-stats', 'workload spans every project', STATS, [`{ project, status:`, `{ status:`]);
  bug('f5-numbers-stats', 'workload unsorted', STATS, [`    { $sort: { open: -1, name: 1 } },\n`, '']);
  bug('f5-numbers-stats', 'workload has no tie-break', STATS, [`{ open: -1, name: 1 }`, `{ open: -1 }`]);
  bug('f5-numbers-stats', 'user id is an ObjectId', STATS, [`userId: { $toString: '$_id' }`, `userId: '$_id'`]);
  alt('f5-numbers-stats', 'ALT unassigned filtered after the group', STATS, [`status: { $ne: 'DONE' }, assignee: { $ne: null } } }`, `status: { $ne: 'DONE' } } }`], [`{ $group: { _id: '$assignee', open: { $sum: 1 } } },`, `{ $group: { _id: '$assignee', open: { $sum: 1 } } },\n    { $match: { _id: { $ne: null } } },`]);
  alt('f5-numbers-stats', 'ALT names the model', ISSUE, [`return this.create({ ...data, project: projectId, number });`, `return Issue.create({ ...data, project: projectId, number } as any);`]);
  bug('f5-passwords', 'hashed again on an unrelated save', USER, [`this.isModified('password') && this.password && !isHashed(this.password)`, `this.password`]);
  bug('f5-passwords', 'findOneAndUpdate stores plain text', USER, [`['updateOne', 'findOneAndUpdate']`, `['updateOne']`]);
  bug('f5-passwords', 'updateOne stores plain text', USER, [`['updateOne', 'findOneAndUpdate']`, `['findOneAndUpdate']`]);
  bug('f5-passwords', '$set not covered', USER, [`for (const target of [update, update.$set])`, `for (const target of [update])`]);
  bug('f5-passwords', 'bare update not covered', USER, [`for (const target of [update, update.$set])`, `for (const target of [update.$set])`]);
  bug('f5-passwords', 'update skips the length rule', USER, [`    if (String(target.password).length < 8) throw new Error(PASSWORD_MESSAGE);\n`, '']);
  bug('f5-passwords', 'password selected by default', USER, [`, select: false`, '']);
  bug('f5-passwords', 'JSON leaks the password', USER, [`    delete ret.password;\n`, '']);
  bug('f5-passwords', 'unloaded password just fails', USER, [`  if (this.password === undefined) {\n    throw new Error('Password not loaded: query the user with .select("+password")');\n  }\n`, '']);
  bug('f5-passwords', 'credentials skip the check', USER, [`!user || !(await user.checkPassword(password))`, `!user`]);
  bug('f5-passwords', 'length message lost', USER, [`minlength: [8, PASSWORD_MESSAGE]`, `minlength: 8`]);

  // --- m06
  const OPS = 'operations.ts';
  bug('d1-write-operations', 'alias missing', OPS, [`first: mission(id: $a)`, `mission(id: $a)`]);
  bug('d1-write-operations', 'second mission not aliased', OPS, [`second: mission(id: $b)`, `other: mission(id: $b)`]);
  bug('d1-write-operations', 'fragment not reused', OPS, [`commander {\n        ...CrewMember\n      }`, `commander {\n        name\n        role\n        nationality\n      }`]);
  bug('d1-write-operations', 'mutation returns no id', OPS, [`addAstronaut(input: $input) {\n      id\n`, `addAstronaut(input: $input) {\n`]);
  bug('d1-write-operations', 'detail skips the rocket', OPS, [`      rocket {\n        name\n        reusable\n      }\n`, '']);
  const LIB = 'server.ts';
  bug('d2-library-api', 'unknown author accepted', LIB, [`      if (!authors.some((a) => a.id === input.authorId)) throw new GraphQLError('Unknown author');\n`, '']);
  bug('d2-library-api', 'books unsorted', LIB, [`books.filter((b) => !genre || b.genre === genre).sort(byYear)`, `books.filter((b) => !genre || b.genre === genre)`]);
  bug('d2-library-api', 'genre ignored', LIB, [`books.filter((b) => !genre || b.genre === genre).sort(byYear)`, `[...books].sort(byYear)`]);
  bug('d2-library-api', 'author books unsorted', LIB, [`books.filter((b) => b.authorId === author.id).sort(byYear)`, `books.filter((b) => b.authorId === author.id)`]);
  bug('d2-library-api', 'new book not stored', LIB, [`      books.push(book);\n`, '']);
  bug('d2-library-api', 'book result nullable', LIB, [`addBook(input: AddBookInput!): Book!`, `addBook(input: AddBookInput!): Book`]);
  bug('f6-schema', 'assignee required', SCHEMA, [`assignee: User\n`, `assignee: User!\n`]);
  bug('f6-schema', 'reporter nullable', SCHEMA, [`reporter: User!\n`, `reporter: User\n`]);
  bug('f6-schema', 'comment list nullable', SCHEMA, [`comments: [Comment!]!`, `comments: [Comment]`]);
  bug('f6-schema', 'no IN_REVIEW', SCHEMA, [`    IN_REVIEW\n`, '']);
  bug('f6-schema', 'createIssue nullable', SCHEMA, [`createIssue(input: CreateIssueInput!): Issue!`, `createIssue(input: CreateIssueInput!): Issue`]);
  bug('f6-schema', 'deleteIssue returns a boolean', SCHEMA, [`deleteIssue(id: ID!): ID!`, `deleteIssue(id: ID!): Boolean!`]);
  bug('f6-schema', 'update requires every field', SCHEMA, [`input UpdateIssueInput {\n    title: String\n`, `input UpdateIssueInput {\n    title: String!\n`]);
  bug('f6-schema', 'filter assignee required', SCHEMA, [`assigneeId: ID\n    label: String\n`, `assigneeId: ID!\n    label: String\n`]);
  bug('f6-schema', 'key field missing', SCHEMA, [`    key: String!\n`, '']);

  // --- m07
  const RR = 'graphql/resolvers.ts';
  bug('d1-recipes-api', 'bad id crashes the query', RR, [`(mongoose.isValidObjectId(id) ? await Recipe.findById(id) : null)`, `await Recipe.findById(id)`]);
  bug('d1-recipes-api', 'delete always true', RR, [`return deletedCount === 1;`, `return true;`]);
  bug('d1-recipes-api', 'bad delete id throws', RR, [`      if (!mongoose.isValidObjectId(id)) return false;\n`, '']);
  bug('d1-recipes-api', 'zero minutes ignored', RR, [`if (maxMinutes !== undefined && maxMinutes !== null)`, `if (maxMinutes)`]);
  bug('d1-recipes-api', 'recipes unsorted', RR, [`.sort({ minutes: 1, title: 1, _id: 1 })`, '']);
  bug('d1-recipes-api', 'date not ISO', RR, [`new Date(r.createdAt).toISOString()`, `String(r.createdAt)`]);
  bug('d1-recipes-api', 'missing recipe not reported', RR, [`      if (!recipe) throw notFound();\n`, '']);
  bug('d1-recipes-api', 'lean rows lose their id', RR, [`    id: (r: RecipeLike) => String(r._id),\n`, '']);
  alt('d1-recipes-api', 'ALT findByIdAndDelete', RR, [`const { deletedCount } = await Recipe.deleteOne({ _id: id });\n      return deletedCount === 1;`, `return !!(await Recipe.findByIdAndDelete(id));`]);
  bug('f7-resolvers', 'delete leaves comments', IR, [`      await Comment.deleteMany({ issue: issue._id });\n`, '']);
  bug('f7-resolvers', 'unassign ignored', IR, [`if (assigneeId !== undefined) patch.assignee = assigneeId;`, `if (assigneeId) patch.assignee = assigneeId;`]);
  bug('f7-resolvers', 'unknown project accepted', IR, [` || !(await Project.exists({ _id: projectId }))`, '']);
  bug('f7-resolvers', 'bad issue id crashes', IR, [`issue: async (_: unknown, { id }: { id: string }) => (valid(id) ? await Issue.findById(id) : null)`, `issue: async (_: unknown, { id }: { id: string }) => await Issue.findById(id)`]);
  bug('f7-resolvers', 'reporter not recorded as current user', IR, [`reporter: ctx.currentUser._id,`, `reporter: input.assigneeId ?? ctx.currentUser._id,`]);
  bug('f7-resolvers', 'missing issue not reported on update', IR, [`const issue = valid(id) ? await updateIssue(id, patch) : null;\n      if (!issue) throw notFound('Issue');\n      return issue;`, `return valid(id) ? await updateIssue(id, patch) : null;`]);
  bug('f7-resolvers', 'members unsorted', PR, [`User.find({ _id: { $in: p.members.map(idOf) } }).sort({ name: 1 }).exec()`, `User.find({ _id: { $in: p.members.map(idOf) } }).exec()`]);
  bug('f7-resolvers', 'creator not a member', PR, [`, members: [ctx.currentUser._id]`, '']);
  bug('f7-resolvers', 'members duplicate', PR, [`$addToSet: { members: userId }`, `$push: { members: userId }`]);
  bug('f7-resolvers', 'issueCount ignores filter', PR, [`countIssues(String(p._id), filter ?? {})`, `countIssues(String(p._id))`]);
  bug('f7-resolvers', 'issues ignore sort', PR, [`{ sort, limit, offset }`, `{ limit, offset }`]);
  bug('f7-resolvers', 'issues ignore filter', PR, [`listIssues(String(p._id), filter ?? {}, `, `listIssues(String(p._id), {}, `]);
  bug('f7-resolvers', 'stats lose workload', PR, [`return { ...stats, workload: load };`, `return { ...stats, workload: [] };`]);
  bug('f7-resolvers', 'comment on a missing issue', CR, [`      if (!comment) throw notFound('Issue');\n`, '']);

  // --- m08
  const GC = 'context.ts';
  const GE = 'errors.ts';
  const GR = 'resolvers.ts';
  bug('d1-guarded-notes', 'any scheme accepted', GC, [`scheme?.toLowerCase() !== 'apikey' || !key`, `!key`]);
  bug('d1-guarded-notes', 'scheme case sensitive', GC, [`scheme?.toLowerCase() !== 'apikey'`, `scheme !== 'ApiKey'`]);
  bug('d1-guarded-notes', 'hidden note reveals itself', GR, [`if (!note || !canSee(note, user)) throw notFound('Note');`, `if (!note) throw notFound('Note');`]);
  bug('d1-guarded-notes', 'readers can edit', GR, [`  if (!isOwner(note, user)) throw forbidden();\n`, '']);
  bug('d1-guarded-notes', 'private notes readable', GR, [`note.shared || isOwner(note, user)`, `true`]);
  bug('d1-guarded-notes', 'shared notes hidden', GR, [`note.shared || isOwner(note, user)`, `isOwner(note, user)`]);
  bug('d1-guarded-notes', 'my notes shows everyone', GR, [`Note.find({ owner: user._id })`, `Note.find()`]);
  bug('d1-guarded-notes', 'validation unmapped', GE, [`if (original instanceof mongoose.Error.ValidationError) {`, `if (false as boolean) {`]);
  bug('d1-guarded-notes', 'matched by error name', GE, [`if (original instanceof mongoose.Error.ValidationError) {`, `if ((original as any)?.name === 'ValidationError') {`]);
  bug('d1-guarded-notes', 'internal message leaked', GE, [`return { message: 'Internal server error', extensions`, `return { message: formatted.message, extensions`]);
  bug('d1-guarded-notes', 'formatError not plugged in', 'server.ts', [`typeDefs, resolvers, formatError }`, `typeDefs, resolvers }`]);
  bug('f8-auth', 'any auth scheme accepted', CTX, [`scheme?.toLowerCase() === 'bearer' && token`, `token`]);
  bug('f8-auth', 'scheme is case sensitive', CTX, [`scheme?.toLowerCase() === 'bearer'`, `scheme === 'Bearer'`]);
  bug('f8-auth', 'internal message leaked', ERR, [`return { message: 'Internal server error', path`, `return { message: formatted.message, path`]);
  bug('f8-auth', 'duplicate key always blames email', ERR, [`Object.keys(original.keyValue ?? {})[0] ?? 'value'`, `'email'`]);
  bug('f8-auth', 'cast errors unmapped', ERR, [`if (original instanceof mongoose.Error.CastError) {`, `if (false as boolean) {`]);
  bug('f8-auth', 'admins not allowed', PERM, [`user.role === 'ADMIN' ||`, ``]);
  bug('f8-auth', 'owner not allowed', PERM, [`same(project.owner, user._id) ||`, ``]);
  bug('f8-auth', 'members not allowed', PERM, [`(project.members ?? []).some((m: unknown) => same(m, user._id))`, `false`]);
  bug('f8-auth', 'missing project reports forbidden', PERM, [`if (!project) throw notFound('Project');`, ``]);

  // --- m09
  const BL = 'loaders.ts';
  bug('d1-batch-it', 'artists in database order', BL, [`return ids.map((id) => byId.get(id) ?? null);`, `return artists as any;`]);
  bug('d1-batch-it', 'missing count undefined', BL, [`counts.get(id) ?? 0`, `counts.get(id) as any`]);
  bug('d1-batch-it', 'aggregation ids not cast', BL, [`{ $in: toObjectIds(ids) }`, `{ $in: ids as any }`]);
  bug('d1-batch-it', 'albums unsorted', BL, [`.sort({ year: 1, _id: 1 })`, '']);
  bug('d1-batch-it', 'loaders shared across requests', 'context.ts', [`export function createContext(): Context {\n  return { loaders: createLoaders() };\n}`, `const shared = createLoaders();\nexport function createContext(): Context {\n  return { loaders: shared };\n}`]);
  bug('d1-batch-it', 'artist resolver bypasses the loader', 'resolvers.ts', [`ctx.loaders.artistById.load(String(a.artist))`, `Artist.findById(a.artist).exec()`]);
  bug('d1-batch-it', 'albums resolver bypasses the loader', 'resolvers.ts', [`ctx.loaders.albumsByArtist.load(String(a._id))`, `Album.find({ artist: a._id }).sort({ year: 1, _id: 1 }).exec()`]);
  const FEED = 'feed.ts';
  bug('d2-cursor-feed', 'cursor drops the tie-break', FEED, [`, { createdAt: c.createdAt, _id: { $lt: c.id } }`, ``]);
  bug('d2-cursor-feed', 'sort has no _id tie-break', FEED, [`.sort({ createdAt: -1, _id: -1 })`, `.sort({ createdAt: -1 })`]);
  bug('d2-cursor-feed', 'hasNextPage off by one', FEED, [`docs.length > first`, `docs.length >= first`]);
  bug('d2-cursor-feed', 'page size cap removed', FEED, [` || first > 50`, ``]);
  bug('d2-cursor-feed', 'zero page size allowed', FEED, [`first < 1`, `first < 0`]);
  bug('d2-cursor-feed', 'total counts only the rest', FEED, [`Post.countDocuments()`, `Post.countDocuments(filter)`]);
  bug('d2-cursor-feed', 'cursor time not checked', FEED, [`typeof t !== 'number' || `, ``]);
  bug('f9-loaders', 'results in database order', LD, [`return ids.map((id) => map.get(id) ?? null);`, `return docs as any;`]);
  bug('f9-loaders', 'missing count undefined', LD, [`counts.get(id) ?? 0`, `counts.get(id) as any`]);
  bug('f9-loaders', 'comments unsorted', LD, [`.sort({ createdAt: 1, _id: 1 })`, ``]);
  bug('f9-loaders', 'loaders shared across requests', LD, [`export function createLoaders() {\n  return {`, `let shared: any;\nexport function createLoaders() {\n  return shared ??= {`]);
  alt('f9-loaders', 'ALT sort comments in JavaScript', LD,
    [`Comment.find({ issue: { $in: ids } }).sort({ createdAt: 1, _id: 1 });`, `Comment.find({ issue: { $in: ids } });`],
    [`for (const c of comments) groups`, `for (const c of [...comments].sort((a: any, b: any) => a.createdAt - b.createdAt || String(a._id).localeCompare(String(b._id)))) groups`]);
  bug('f9-connections', 'cursor drops the tie-break', PG, [`, { createdAt: c.createdAt, _id: { $lt: c.id } }`, ``]);
  bug('f9-connections', 'sort has no _id tie-break', PG, [`.sort({ createdAt: -1, _id: -1 })`, `.sort({ createdAt: -1 })`]);
  bug('f9-connections', 'hasNextPage off by one', PG, [`docs.length > first`, `docs.length >= first`]);
  bug('f9-connections', 'page size cap removed', PG, [` || first > 50`, ``]);
  bug('f9-connections', 'later pages lose project and filter', PG, [`$and: [base, { $or:`, `$and: [{ $or:`]);
  bug('f9-connections', 'totalCount ignores filter', PG, [`countIssues(projectId, filter)`, `countIssues(projectId)`]);

  // --- m10
  const PICK = 'ProjectPicker.tsx';
  bug('d1-project-picker', 'summary runs with no key', PICK, [`{key && <Summary projectKey={key} />}`, `<Summary projectKey={key} />`]);
  bug('d1-project-picker', 'summary error hidden', PICK, [`  if (error) return <p role="alert">Couldn't load project: {error.message}</p>;\n`, '']);
  bug('f10-issue-list', 'token read once', APOLLO, [`const auth = new SetContextLink((prevContext) => {\n    const token = getToken();`, `const token = getToken();\n  const auth = new SetContextLink((prevContext) => {`]);
  bug('f10-issue-list', 'bearer prefix lost', APOLLO, ['`Bearer ${token}`', 'token']);
  bug('f10-issue-list', 'auth link not used', APOLLO, [`auth.concat(new HttpLink({ uri, fetch }))`, `new HttpLink({ uri, fetch })`]);
  bug('f10-issue-list', 'empty status sent', LIST, [`status: status || null`, `status`]);
  bug('f10-issue-list', 'unassigned has no label', LIST, [`issue.assignee?.name ?? 'Unassigned'`, `issue.assignee?.name`]);
  bug('f10-issue-list', 'no empty state', LIST, [`<p>No issues match.</p>`, `<ul aria-label="Issues" />`]);
  bug('f10-issue-list', 'error hidden', LIST, [`  if (error) return <p role="alert">Couldn't load issues: {error.message}</p>;\n`, '']);

  // --- m11
  const NEW = 'NewIssueForm.tsx';
  const PICKER = 'StatusPicker.tsx';
  bug('b1-board-that-lies', 'new issue never refetched', NEW, [`    refetchQueries: ['ProjectIssues'],\n`, '']);
  bug('b1-board-that-lies', 'wrong operation name', NEW, [`refetchQueries: ['ProjectIssues']`, `refetchQueries: ['Issues']`]);
  bug('b1-board-that-lies', 'done counter stays stale', PICKER, [`useMutation(SET_STATUS, { refetchQueries: ['ProjectIssues'] })`, `useMutation(SET_STATUS)`]);
  const THREAD = 'CommentThread.tsx';
  bug('d1-comment-thread', 'text cleared before the server answers', THREAD, [`    try {\n      await addComment({`, `    setText('');\n    try {\n      await addComment({`], [`      setText(''); // only after success — keep the text for a retry otherwise\n`, '']);
  bug('d1-comment-thread', 'text kept after success', THREAD, [`      setText(''); // only after success — keep the text for a retry otherwise\n`, '']);
  bug('d1-comment-thread', 'count goes stale', THREAD, [`          commentCount: (n: number = 0) => n + 1,\n`, '']);
  bug('d1-comment-thread', 'comment never added to the cache', THREAD, [`          comments: (refs: readonly any[] = [], { toReference }) => [...refs, toReference(comment)!],\n`, '']);
  bug('d1-comment-thread', 'pending comment unmarked', THREAD, [`{c.id.startsWith('temp-') && <em> Sending…</em>}`, '']);
  bug('d1-comment-thread', 'no optimistic response', THREAD, [`        optimisticResponse: {
          addComment: {
            __typename: 'Comment',
            id: \`temp-\${Date.now()}\`,
            body,
            author: { __typename: 'User', id: currentUser.id, name: currentUser.name },
          },
        },
`, '']);
  bug('d1-comment-thread', 'post failure hidden', THREAD, [`      {postError && <p role="alert">Couldn't post comment: {postError.message}</p>}\n`, '']);
  bug('f11-create-move', 'short title sent', FORM, [`if (clean.length < 3) {`, `if (clean.length < 1) {`]);
  bug('f11-create-move', 'no refetch', FORM, [`    refetchQueries: ['ProjectIssues'],\n    awaitRefetchQueries: true,\n`, '']);
  bug('f11-create-move', 'title not reset', FORM, [`      setTitle('');\n`, '']);
  bug('f11-create-move', 'priority not reset', FORM, [`      setPriority('MEDIUM');\n`, '']);
  bug('f11-create-move', 'created key hidden', FORM, [`      {createdKey && <p role="status">Created {createdKey}</p>}\n`, '']);
  bug('f11-create-move', 'server error hidden', FORM, [`      {error && <p role="alert">Couldn't create issue: {error.message}</p>}\n`, '']);
  bug('f11-create-move', 'no optimistic status', SELECT, [`        optimisticResponse: { updateIssue: { __typename: 'Issue', id: issue.id, status } },\n`, '']);
  bug('f11-create-move', 'moved issue stays in its filter', SELECT, [`        refetchQueries: ['ProjectIssues'],\n`, '']);
  bug('f11-create-move', 'status failure hidden', SELECT, [`      {error && (
        <span role="alert">
          {' '}
          Couldn't update {issue.key}: {error.message}
        </span>
      )}
`, '']);

  // --- m12
  const FC = 'feedCache.ts';
  const FF = 'IssueFeed.tsx';
  bug('d1-load-more-feed', 'filters share one list', FC, [`keyArgs: ['filter']`, `keyArgs: false`]);
  bug('d1-load-more-feed', 'cursors split the list', FC, [`keyArgs: ['filter']`, `keyArgs: ['filter', 'after']`]);
  bug('d1-load-more-feed', 'duplicates kept', FC, [`incoming.edges.filter((e) => !seen.has(e.cursor))`, `incoming.edges`]);
  bug('d1-load-more-feed', 'first page appended', FC, [`if (!existing || !args?.after) return incoming;`, `if (!existing) return incoming;`]);
  bug('d1-load-more-feed', 'pageInfo stale', FC, [`...incoming,\n                edges`, `...existing,\n                edges`]);
  bug('d1-load-more-feed', 'load more restarts', FF, [`after: conn.pageInfo.endCursor`, `after: null`]);
  bug('d1-load-more-feed', 'button stays at the end', FF, [`{conn.pageInfo.hasNextPage && (`, `{(`]);
  bug('d1-load-more-feed', 'empty filter sent', FF, [`filter: status ? { status } : null`, `filter: { status }`]);
  bug('d1-load-more-feed', 'filter not in variables', FF, [`first: pageSize, filter: status ? { status } : null`, `first: pageSize, filter: null`]);
  bug('f12-board', 'no pagination policy', APOLLO, [`          issueConnection: relayStylePagination(['filter']),\n`, '']);
  bug('f12-board', 'filters share one list', APOLLO, [`relayStylePagination(['filter'])`, `relayStylePagination()`]);
  bug('f12-board', 'create does not refresh the board', FORM, [`['ProjectIssues', 'BoardIssues']`, `['ProjectIssues']`]);
  bug('f12-board', 'card count not queried', CARD, [`    commentCount\n    labels {`, `    labels {`]);
  bug('f12-board', 'load more restarts', BOARD, [`after: conn.pageInfo.endCursor`, `after: null`]);
  bug('f12-board', 'button stays at the end', BOARD, [`{conn.pageInfo.hasNextPage && (`, `{(`]);
  bug('f12-board', 'count shows page size', BOARD, [`Showing {issues.length} of {conn.totalCount}`, `Showing {pageSize} of {conn.totalCount}`]);
  bug('f12-board', 'moved card keeps its column', BOARD, [`const board = toBoard(issues as any);`, `const board = useMemoizedBoard(issues);`], [`export const BOARD_ISSUES`, `const first = new Map<string, any>();\nfunction useMemoizedBoard(issues: any[]) {\n  return toBoard(issues.map((i) => { if (!first.has(i.id)) first.set(i.id, i.status); return { ...i, status: first.get(i.id) }; }));\n}\n\nexport const BOARD_ISSUES`]);

  // --- m13
  const BOOT = 'server/index.ts';
  bug('f13-boot', 'indexes not built', BOOT, [`  await Promise.all([User, Project, Issue, Comment].map((model) => model.syncIndexes()));\n`, '']);
  bug('f13-boot', 'context drops the request', BOOT, [`context: ({ req }) => buildContext({ req }),`, `context: () => buildContext({ req: { headers: {} } } as any),`]);
  bug('f13-boot', 'stop leaves mongoose connected', BOOT, [`      await mongoose.disconnect();\n`, '']);
  bug('f13-boot', 'stop leaves the server up', BOOT, [`      await server.stop();\n`, '']);
  bug('f13-boot', 'port ignored', BOOT, [`listen: { port }`, `listen: { port: 0 }`]);
  alt('f13-boot', 'ALT createIndexes', BOOT, [`model.syncIndexes()`, `model.createIndexes()`]);
  const OVERDUE = `!!i.dueDate && i.status !== 'DONE' && new Date(i.dueDate) < startOfTodayUTC()`;
  bug('f13-due-dates', 'done issues overdue', IR, [OVERDUE, `!!i.dueDate && new Date(i.dueDate) < startOfTodayUTC()`]);
  bug('f13-due-dates', 'today counts as overdue', IR, [OVERDUE, `!!i.dueDate && i.status !== 'DONE' && new Date(i.dueDate) <= startOfTodayUTC()`]);
  bug('f13-due-dates', 'compared with now', IR, [OVERDUE, `!!i.dueDate && i.status !== 'DONE' && new Date(i.dueDate) < new Date()`]);
  bug('f13-due-dates', 'null cannot clear', IR, [`if (dueDate !== undefined) patch.dueDate = toDueDate(dueDate);`, `if (dueDate) patch.dueDate = toDueDate(dueDate);`]);
  bug('f13-due-dates', 'bad date accepted', IR, [`  if (!date) throw badInput('dueDate must be a date like 2026-10-31', { dueDate: 'Use the format YYYY-MM-DD' });\n`, '']);
  bug('f13-due-dates', 'create ignores the date', IR, [`dueDate: due, `, '']);
  bug('f13-due-dates', 'date returned as a timestamp', IR, [`dueDate: (i: IssueDoc) => (i.dueDate ? formatDateOnly(i.dueDate) : null)`, `dueDate: (i: IssueDoc) => (i.dueDate ? new Date(i.dueDate).toISOString() : null)`]);
  bug('f13-due-dates', 'filter includes done work', REPO, [`    if (!filter.status) q.status = { $ne: 'DONE' };\n`, '']);
  bug('f13-due-dates', 'explicit status loses', REPO, [`if (!filter.status) q.status = { $ne: 'DONE' };`, `q.status = { $ne: 'DONE' };`]);
  bug('f13-due-dates', 'filter includes today', REPO, [`q.dueDate = { $lt: startOfTodayUTC() }`, `q.dueDate = { $lte: startOfTodayUTC() }`]);
  bug('f13-due-dates', 'date not patchable', REPO, [`'assignee', 'dueDate'] as const`, `'assignee'] as const`]);
  bug('f13-due-dates', 'form drops the date', FORM, [`, ...(dueDate ? { dueDate } : {})`, '']);
  bug('f13-due-dates', 'form sends an empty date', FORM, [`, ...(dueDate ? { dueDate } : {})`, `, dueDate`]);
  bug('f13-due-dates', 'form keeps the old date', FORM, [`      setDueDate('');\n`, '']);
  bug('f13-due-dates', 'overdue not shown', CARD, [`{issue.isOverdue && <strong style={{ color: '#dc2626' }}> · Overdue</strong>}`, '']);
  bug('f13-due-dates', 'card never asks for isOverdue', CARD, [`    isOverdue\n`, '']);

  // --- bug hunts in the GraphQL part
  const EV_R = 'graphql/resolvers.ts';
  const EV_S = 'graphql/schema.ts';
  const NULL_VENUE = `venue: Venue\n`;
  const GUARD = `mongoose.isValidObjectId(id) ? Event.findById(id).lean().exec() : null`;
  const AFTER = `{ $set: { title } }, { returnDocument: 'after' }`;
  bug('b1-blank-events', 'venue stays non-null', EV_S, [NULL_VENUE, `venue: Venue!\n`]);
  bug('b1-blank-events', 'a whole list made nullable instead', EV_S, [NULL_VENUE, `venue: Venue!\n`], [`events: [Event!]!`, `events: [Event]!`]);
  bug('b1-blank-events', 'bad id reaches the database', EV_R, [GUARD, `Event.findById(id).lean().exec()`]);
  bug('b1-blank-events', 'rename returns the old title', EV_R, [AFTER, `{ $set: { title } }`]);
  bug('b1-blank-events', 'date serialised by default', EV_R, [`    startsAt: (event: any) => event.startsAt.toISOString(),\n`, '']);
  bug('b1-blank-events', 'date read as a timestamp', EV_R, [`event.startsAt.toISOString()`, `String(event.startsAt.getTime())`]);
  bug('b1-blank-events', 'events without a venue hidden', EV_R, [`events: () => Event.find().sort({ startsAt: 1 }).lean().exec(),`, `events: async () => {
      const all = await Event.find().sort({ startsAt: 1 }).lean();
      const seen = await Venue.find({ _id: { $in: all.map((e) => e.venue) } }).lean();
      return all.filter((e) => seen.some((v) => String(v._id) === String(e.venue)));
    },`]);
  alt('b1-blank-events', 'ALT Types.ObjectId.isValid', EV_R, [GUARD, `mongoose.Types.ObjectId.isValid(id) ? Event.findById(id).lean().exec() : null`]);
  alt('b1-blank-events', 'ALT new: true style options', EV_R, [AFTER, `{ title }, { returnDocument: 'after' }`]);
  alt('b1-blank-events', 'ALT Date serialised by hand', EV_R, [`event.startsAt.toISOString()`, `new Date(event.startsAt).toISOString()`]);
  const CTX_B = 'context.ts';
  const ERR_B = 'errors.ts';
  const EX = 'resolvers.ts';
  const OWN = `if (!expense.owner.equals(user._id)) throw forbidden();`;
  const USER_LINE = `const currentUser = token ? await User.findOne({ token }) : null;\n  return { currentUser };`;
  bug('b1-whoever-came-last', 'user kept between requests', CTX_B,
    [`export interface Context`, `let currentUser: any = null;\n\nexport interface Context`],
    [USER_LINE, `if (token) currentUser = await User.findOne({ token });\n  return { currentUser };`]);
  bug('b1-whoever-came-last', 'empty token finds a user', CTX_B, [USER_LINE, `const currentUser = await User.findOne(token ? { token } : {});\n  return { currentUser };`]);
  bug('b1-whoever-came-last', 'ids compared as objects', EX, [OWN, `if (expense.owner !== user._id) throw forbidden();`]);
  bug('b1-whoever-came-last', 'update not guarded', EX, [`      ${OWN}\n      expense.title = title;`, `      expense.title = title;`]);
  bug('b1-whoever-came-last', 'delete not guarded', EX, [`      ${OWN}\n      await expense.deleteOne();`, `      await expense.deleteOne();`]);
  bug('b1-whoever-came-last', 'delete open to anonymous', EX, [`      const user = requireUser(ctx);\n      const expense = await loadExpense(id);\n      ${OWN}\n      await expense.deleteOne();`, `      const expense = await loadExpense(id);\n      if (ctx.currentUser && !expense.owner.equals(ctx.currentUser._id)) throw forbidden();\n      await expense.deleteOne();`]);
  bug('b1-whoever-came-last', 'expected errors masked', ERR_B, [`formatted.extensions?.code === 'INTERNAL_SERVER_ERROR'`, `formatted.extensions?.code !== 'UNAUTHENTICATED'`]);
  bug('b1-whoever-came-last', 'crashes leak their message', ERR_B, [`formatted.extensions?.code === 'INTERNAL_SERVER_ERROR'`, `formatted.extensions?.code === 'INTERNAL_ERROR'`]);
  alt('b1-whoever-came-last', 'ALT ids compared as strings', EX, [OWN, `if (String(expense.owner) !== String(user._id)) throw forbidden();`]);
  alt('b1-whoever-came-last', 'ALT own expense looked up directly', EX, [`      ${OWN}\n      expense.title = title;`, `      if (!(await (expense.constructor as any).exists({ _id: id, owner: user._id }))) throw forbidden();\n      expense.title = title;`]);
  const LOAD = 'loaders.ts';
  const RES = 'resolvers.ts';
  const AUTHORS = `const byId = new Map(rows.map((author) => [String(author._id), author]));\n      return ids.map((id) => byId.get(id) ?? null);`;
  const COUNTS = `const counts = new Map(rows.map((row) => [String(row._id), row.n as number]));\n      return ids.map((id) => counts.get(id) ?? 0);`;
  const MANY = `const reviewers = await ctx.loaders.authorById.loadMany(article.reviewers.map(String));\n      return reviewers.filter(Boolean);`;
  bug('b1-wrong-bylines', 'authors returned in database order', LOAD, [AUTHORS, `return rows;`]);
  bug('b1-wrong-bylines', 'missing authors collapse the list', LOAD, [`return ids.map((id) => byId.get(id) ?? null);`, `return ids.map((id) => byId.get(id)).filter(Boolean);`]);
  bug('b1-wrong-bylines', 'counts returned as rows', LOAD, [COUNTS, `return rows.map((row) => row.n);`]);
  bug('b1-wrong-bylines', 'no comments means undefined', LOAD, [`counts.get(id) ?? 0`, `counts.get(id) as number`]);
  bug('b1-wrong-bylines', 'one loader set for every request', LOAD, [`export function createLoaders() {\n  return {`, `let shared: any;\nexport function createLoaders() {\n  return shared ??= {`]);
  bug('b1-wrong-bylines', 'reviewers fetched one by one', RES, [MANY, `const reviewers = [];\n      for (const id of article.reviewers) reviewers.push(await ctx.loaders.authorById.load(String(id)));\n      return reviewers.filter(Boolean);`]);
  bug('b1-wrong-bylines', 'a deleted reviewer breaks the list', RES, [`return reviewers.filter(Boolean);`, `return reviewers;`]);
  alt('b1-wrong-bylines', 'ALT reviewers through Promise.all', RES, [MANY, `const reviewers = await Promise.all(article.reviewers.map((id: unknown) => ctx.loaders.authorById.load(String(id))));\n      return reviewers.filter(Boolean);`]);
  alt('b1-wrong-bylines', 'ALT lookup object instead of a Map', LOAD, [AUTHORS, `const byId = Object.fromEntries(rows.map((author) => [String(author._id), author]));\n      return ids.map((id) => byId[id] ?? null);`]);

  // --- m13: the incident and the brief
  const INC = 'b1-stale-names';
  const FRESH = `export function createLoaders() {\n  return {`;
  const TIE = `{ $or: [{ createdAt: { $lt: c.createdAt } }, { createdAt: c.createdAt, _id: { $lt: c.id } }] }`;
  bug(INC, 'one shared set of loaders', LD, [FRESH, `let shared: any;\nexport function createLoaders() {\n  return shared ??= {`]);
  bug(INC, 'shared loaders, cleared per request', LD, [FRESH, `let shared: any;\nexport function createLoaders() {\n  shared?.userById.clearAll();\n  shared?.commentCountByIssue.clearAll();\n  return shared ??= {`]);
  bug(INC, 'only users fresh', LD,
    [FRESH, `const counts = new DataLoader<string, number>(async (ids) => {\n  const rows: { _id: unknown; count: number }[] = await Comment.aggregate([\n    { $match: { issue: { $in: toObjectIds(ids) } } },\n    { $group: { _id: '$issue', count: { $sum: 1 } } },\n  ]);\n  const map = new Map(rows.map((r) => [String(r._id), r.count]));\n  return ids.map((id) => map.get(id) ?? 0);\n});\nexport function createLoaders() {\n  return {\n    commentCountByIssue: counts,`],
    [`    commentCountByIssue: new DataLoader<string, number>(async (ids) => {\n      const rows: { _id: unknown; count: number }[] = await Comment.aggregate([\n        { $match: { issue: { $in: toObjectIds(ids) } } }, // aggregation never casts for us\n        { $group: { _id: '$issue', count: { $sum: 1 } } },\n      ]);\n      const counts = new Map(rows.map((r) => [String(r._id), r.count]));\n      return ids.map((id) => counts.get(id) ?? 0);\n    }),\n`, '']);
  bug(INC, 'caching turned off instead', LD, [`return new DataLoader<string, any>(async (ids) => {`, `return new DataLoader<string, any>({ cache: false } as any && (async (ids) => {`], [`    return ids.map((id) => map.get(id) ?? null);\n  });`, `    return ids.map((id) => map.get(id) ?? null);\n  }), { cache: false, batch: false });`]);
  bug(INC, 'cursor drops the tiebreak', PG, [TIE, `{ createdAt: { $lt: c.createdAt } }`]);
  bug(INC, 'ties repeat instead of skip', PG, [TIE, `{ createdAt: { $lte: c.createdAt }, _id: { $ne: c.id } }`]);
  bug(INC, 'order lost its tiebreak', PG, [`.sort({ createdAt: -1, _id: -1 })`, `.sort({ createdAt: -1 })`]);
  bug(INC, 'tiebreak points the wrong way', PG, [`createdAt: c.createdAt, _id: { $lt: c.id }`, `createdAt: c.createdAt, _id: { $gt: c.id }`]);
  bug(INC, 'garbage cursors not rejected', PG, [`    throw badInput('Invalid cursor');\n`, `    return { createdAt: new Date(), id: new mongoose.Types.ObjectId() };\n`]);
  alt(INC, 'ALT cursor as a joined string', PG,
    [`Buffer.from(JSON.stringify([new Date(issue.createdAt).getTime(), String(issue._id)])).toString('base64url')`, `Buffer.from(new Date(issue.createdAt).getTime() + ':' + String(issue._id)).toString('base64url')`],
    [`const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));\n    const [t, id] = Array.isArray(parsed) ? parsed : [];`, `const [ms, id] = Buffer.from(cursor, 'base64url').toString('utf8').split(':');\n    const t = ms ? Number(ms) : NaN;`],
    [`typeof t !== 'number' ||`, `!Number.isFinite(t) ||`]);
  alt(INC, 'ALT no $and, spread into the base', PG, [`$and: [base, ${TIE}],`, `...base,\n      ...${TIE},`]);
  const PIN = 'd1-pin-issues';
  const PIN_GUARD = `pinned && !issue.pinned && (await countPinnedIssues(issue.project)) >= MAX_PINS`;
  bug(PIN, 'no default for pinned', ISSUE, [`pinned: { type: Boolean, default: false }`, `pinned: { type: Boolean }`]);
  bug(PIN, 'no limit', IR, [PIN_GUARD, `false`]);
  bug(PIN, 'off by one', IR, [`>= MAX_PINS`, `> MAX_PINS`]);
  bug(PIN, 'unpinning blocked at the limit', IR, [PIN_GUARD, `!issue.pinned && (await countPinnedIssues(issue.project)) >= MAX_PINS`]);
  bug(PIN, 're-pinning blocked at the limit', IR, [PIN_GUARD, `pinned && (await countPinnedIssues(issue.project)) >= MAX_PINS`]);
  bug(PIN, 'limit counts every project', REPO, [`return Issue.countDocuments({ project: projectId, pinned: true });`, `return Issue.countDocuments({ pinned: true });`]);
  bug(PIN, 'wrong error code', IR, [`throw badInput(\`A project can have at most \${MAX_PINS} pinned issues\`);`, `throw forbidden('Too many pins');`]);
  bug(PIN, 'anyone can pin', IR, [`      const { issue } = await loadWritableIssue(ctx, id);\n      // Only`, `      requireUser(ctx);\n      const issue = valid(id) ? await Issue.findById(id) : null;\n      if (!issue) throw notFound('Issue');\n      // Only`]);
  bug(PIN, 'never saved', IR, [`      issue.pinned = pinned;\n      return issue.save();`, `      issue.pinned = pinned;\n      return issue;`]);
  bug(PIN, 'pinned list unsorted', REPO, [`Issue.find({ project: projectId, pinned: true }).sort(SORTS.NEWEST)`, `Issue.find({ project: projectId, pinned: true }).sort({ updatedAt: -1 })`]);
  bug(PIN, 'pinned list crosses projects', REPO, [`Issue.find({ project: projectId, pinned: true })`, `Issue.find({ pinned: true })`]);
  bug(PIN, 'card never asks for pinned', CARD, [`    pinned\n    labels {`, `    labels {`]);
  bug(PIN, 'button always says Pin', CARD, ['aria-label={`${issue.pinned ? \'Unpin\' : \'Pin\'} ${issue.key}`}', 'aria-label={`Pin ${issue.key}`}']);
  bug(PIN, 'button cannot unpin', CARD, [`pinned: !issue.pinned`, `pinned: true`]);
  bug(PIN, 'no Pinned label', CARD, [`        {issue.pinned && <small> · Pinned</small>}\n`, '']);
  bug(PIN, 'refusal swallowed', CARD, [`      {error && <small role="alert">{error.message}</small>}\n`, '']);
  bug(PIN, 'mutation does not return pinned', CARD, [`    setIssuePinned(id: $id, pinned: $pinned) {\n      id\n      pinned\n    }`, `    setIssuePinned(id: $id, pinned: $pinned) {\n      id\n    }`]);
  bug(PIN, 'board ignores pins', BOARD, [`pinnedFirst(board[col.status])`, `board[col.status]`]);
  bug(PIN, 'pinned hide the rest', BOARD, [`[...column.filter((i) => i.pinned), ...column.filter((i) => !i.pinned)]`, `column.some((i) => i.pinned) ? column.filter((i) => i.pinned) : column`]);
  bug(PIN, 'rest reversed', BOARD, [`...column.filter((i) => !i.pinned)]`, `...column.filter((i) => !i.pinned).reverse()]`]);
  bug(PIN, 'empty note section', 'CHANGE_NOTE.md', [`## Why\nTeams were losing track of the few issues that matter most this week. The limit keeps pins meaningful.\n`, `## Why\n<!-- The problem this solves, in your own words. -->\n`]);
  bug(PIN, 'note heading renamed', 'CHANGE_NOTE.md', [`## What it does not do yet`, `## Notes`]);
  alt(PIN, 'ALT findOneAndUpdate after the check', IR, [`      issue.pinned = pinned;\n      return issue.save();`, `      return Issue.findByIdAndUpdate(id, { $set: { pinned } }, { returnDocument: 'after' });`]);
  alt(PIN, 'ALT sort instead of two filters', BOARD, [`[...column.filter((i) => i.pinned), ...column.filter((i) => !i.pinned)]`, `[...column].sort((a, b) => Number(b.pinned) - Number(a.pinned))`]);
  alt(PIN, 'ALT toggle by checking the error in a try', CARD,
    [`onClick={() => setPinned({ variables: { id: issue.id, pinned: !issue.pinned } }).catch(() => {})}`, `onClick={async () => {\n          try {\n            await setPinned({ variables: { id: issue.id, pinned: !issue.pinned } });\n          } catch {\n            // shown below\n          }\n        }}`]);
}
