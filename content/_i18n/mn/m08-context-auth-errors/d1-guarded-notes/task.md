---
title: "Drill: хамгаалалттай notes API"
summary: Context function, operation ба object түвшний authorization, error-ыг хөрвүүлж нууцалдаг formatError.
source: abb84a8d582f47dacbd2c1571fca8295a757269c3a9bbadd85e0b2ee2aee8f0d
---

Notes app: хүн бүр хувийн note-той. Note-ийг `shared` гэж тэмдэглэвэл хэн ч уншиж болно (гэхдээ засаж болохгүй). Client нь **API key** header-ээр authenticate хийнэ, хичээлд үзсэн Bearer token-оор биш:

```text
Authorization: ApiKey 9f1c2d…
```

Model-ууд ба schema бэлэн, эхлээд `schema.ts`-ийг унш. Context, errors модуль, resolver-үүдийг чи бичнэ.

## Даалгавар

### `context.ts` — `buildContext({ req })`
`{ currentUser }`-д resolve болно. `authorization` header-ийг унш. Header нь `ApiKey <key>` хэлбэртэй (scheme нь **case-insensitive**: `apikey`, `APIKEY` ч болно), мөн тэр `apiKey`-тэй user байвал тэр нь одоогийн user. Бусад бүх тохиолдолд (header байхгүй, scheme буруу, key нь ямар ч user-т таарахгүй) `currentUser: null`. Context-оос **хэзээ ч throw хийж болохгүй**, учир нь anonymous request ч shared note-уудыг уншиж чадах ёстой.

### `errors.ts`
- `unauthenticated()`, `forbidden()`, `notFound(what)` helper-ууд. Тус бүр нь харгалзах `extensions.code`-той `GraphQLError` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`).
- `formatError(formatted, error)`:
  - Mongoose `ValidationError` → `{ message: 'Invalid input', extensions: { code: 'BAD_USER_INPUT', fields: { path: message, … } } }`
  - Код нь `INTERNAL_SERVER_ERROR` байгаа аливаа error → `{ message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }`. Анхны message хэзээ ч гарахгүй.
  - Бусад бүгд өөрчлөгдөхгүй.

### `resolvers.ts`

| Field | Дүрэм |
| --- | --- |
| `myNotes` | зөвхөн нэвтэрсэн үед (үгүй бол `UNAUTHENTICATED`); миний note-ууд, хамгийн шинэ нь эхэнд |
| `note(id)` | хэн ч; note нь **shared эсвэл миний** бол буцаана, бусад тохиолдолд `null` (олдохгүй эсвэл буруу хэлбэртэй id-д ч `null`) |
| `createNote(input)` | зөвхөн нэвтэрсэн; эзэмшигч нь би. Буруу input `BAD_USER_INPUT`-аар, `fields`-тэй гарна (чиний `formatError`-оор дамжиж) |
| `updateNote(id, input)` / `deleteNote(id)` | зөвхөн нэвтэрсэн. Огт харагдахгүй note → `NOT_FOUND`. Харагддаг ч эзэмшдэггүй note (бусдын shared note) → `FORBIDDEN`. `deleteNote` id-г буцаана |
| `Note.id`, `Note.owner`, `Note.createdAt` (ISO) | |

### `server.ts`
`createServer()` дотор чиний `formatError`-ыг `ApolloServer`-д дамжуул.

## Hints

### Header-ийг задлах
`const [scheme, key] = (req.headers.authorization ?? '').split(' ')`. `scheme?.toLowerCase() === 'apikey'` гэж харьцуул. Key байгаа үед л database-д query хий.

### Нэг visibility function
`canSee(note, user)`-ийг нэг удаа бич (shared, эсвэл owner нь user-тэй тэнцүү), тэгээд `note`, `updateNote`, `deleteNote`-д хэрэглэ. Update/delete-д: note-ыг ачаал → олдохгүй эсвэл `!canSee` бол `notFound('Note')` → эзэмшигч биш бол `forbidden()`.

### formatError
`@apollo/server/errors`-оос `unwrapResolverError(error)` нь resolver-ийн throw хийсэн зүйлийг өгнө. Эхлээд `instanceof mongoose.Error.ValidationError`-ийг, дараа нь `formatted.extensions?.code === 'INTERNAL_SERVER_ERROR'`-ийг шалга.
