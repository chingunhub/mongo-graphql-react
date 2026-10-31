---
title: "Taskforge: бүртгүүл, нэвтэр, API-г хамгаал"
summary: Token орж, user гарна. Дараа нь operation, object, field түвшний authorization ба жинхэнэ error layer.
source: c8fff8d55a7d069b093e019a6133b7be73e87bae9deb2cafa1648419f025caff
---

Одоогоор хэн ч Taskforge-д юу ч хийж чадна, request бүр "тест хэн гэж хэлснээр" явдаг. Энэ forge step API-г жинхэнэ болгоно. User-ууд бүртгүүлж, нэвтэрнэ. Server хэн дуудаж байгааг `Authorization` header-ээс мэднэ. Доорх дүрэм бүр **тус бүрдээ нэг газарт** хэрэгжинэ.

```viz-flow
{
  colWidth: 185,
  rowHeight: 72,
  nodes: [
    { id: 'hdr', label: 'Authorization header', col: 0, row: 0, color: 'neutral', w: 170 },
    { id: 'ctx', label: 'context.ts', sub: 'token → currentUser', col: 1, row: 0, color: 'forge' },
    { id: 'res', label: 'resolvers', sub: 'requireUser(ctx)', col: 2, row: 0, color: 'gql' },
    { id: 'perm', label: 'services/permissions', sub: 'assertCanWriteProject', col: 2, row: 1, color: 'forge', w: 175 },
    { id: 'err', label: 'errors.ts', sub: 'codes + formatError', col: 1, row: 1, color: 'forge' },
  ],
  edges: [
    { from: 'hdr', to: 'ctx' }, { from: 'ctx', to: 'res' }, { from: 'res', to: 'perm' }, { from: 'res', to: 'err', dashed: true }, { from: 'perm', to: 'err', dashed: true },
  ],
}
```

Token helper-ууд `server/auth/tokens.ts` дотор бэлэн: `signToken(userId)` ба `verifyToken(token)`. Унш, богинохон, санаа нь JWT-тэй адилхан.

## Даалгавар

### 1. `server/graphql/context.ts` — `buildContext({ req })`
Хүчинтэй token-тэй `Authorization: Bearer <token>` (scheme нь case-insensitive) → `{ currentUser: <User document> }`. Token байхгүй, хүчингүй, хугацаа нь дууссан, эсвэл user нь байхаа больсон бол → `{ currentUser: null }`. Хэзээ ч throw хийхгүй.

### 2. `server/graphql/errors.ts`
- `badInput(message, fields?)`, `unauthenticated(message?)`, `forbidden(message?)`, `notFound(what)`: `BAD_USER_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND` code-той `GraphQLError`-ууд.
- `requireUser(ctx)`: одоогийн user-ийг буцаана, эсвэл `UNAUTHENTICATED` throw хийнэ.
- `formatError(formatted, error)`:
  - Mongoose `ValidationError` → `BAD_USER_INPUT`, message нь `Invalid input`, `extensions.fields` = `{ path: message }`
  - Mongoose `CastError` → `BAD_USER_INPUT`
  - давхардсан key (`code === 11000`) → `BAD_USER_INPUT`, `extensions.fields` нь давхардсан field-ийн нэрийг агуулна (жишээ нь `{ email: '…' }`)
  - `INTERNAL_SERVER_ERROR` → message нь `Internal server error`, өөр юу ч задрахгүй
  - бусад нь хэвээр

Дараа нь `formatError`-ыг `server.ts` доторх `ApolloServer`-д дамжуул.

### 3. `server/services/permissions.ts`
- `canWriteProject(user, project)`: admin-ууд, эзэмшигч, гишүүдэд true буцаана.
- `assertCanWriteProject(user, projectId)`: project-ийг ачаална. Байхгүй бол `NOT_FOUND`, эрхгүй бол `FORBIDDEN`, эс бөгөөс project-ийг буцаана.

### 4. Resolver-ууд

**`user.ts`**
- `signUp(input)` → `{ token, user }`. Богино password эсвэл аль хэдийн авагдсан email `BAD_USER_INPUT` болж буцна (чиний model болон `formatError` ажлыг аль хэдийн хийдэг, гараар дахин validate хийх хэрэггүй).
- `login(email, password)` → `{ token, user }`, эсвэл `Invalid email or password` message-тэй `UNAUTHENTICATED`. Email байгаа ч бай, байхгүй ч бай message **яг ижил**.
- `User.email` → email-ийг **зөвхөн** тэр user өөрөө эсвэл admin-д харуулна. Бусад бүх хүнд (anonymous-г оруулаад) `null`.

**Mutation бүр** нэвтэрсэн user шаардана (үгүй бол `UNAUTHENTICATED`). Query-үүд нийтэд нээлттэй хэвээр.

**Project-ийн дүрэм**: `createProject` нь нэвтэрсэн ямар ч user-д нээлттэй. `addMember` нь зөвхөн project-ийн **эзэмшигч** эсвэл admin-д (үгүй бол `FORBIDDEN`). Байхгүй project → `NOT_FOUND`.

**Issue-ийн дүрэм**: `createIssue`, `updateIssue`, `addLabel`, `removeLabel`, `addComment`-д user тухайн issue-ийн project руу бичих эрхтэй байх ёстой (`assertCanWriteProject`). `deleteIssue`-д үүнээс гадна зөвхөн issue-ийн **reporter**, project-ийн **эзэмшигч**, эсвэл admin. Шалгах дараалал: нэвтэрсэн → issue байгаа → зөвшөөрөгдсөн.

**reporter/author/owner-ыг `currentUser`-ээс** ав, input-оос хэзээ ч биш.

## Hints

### Header
`String(req.headers.authorization ?? '').trim().split(/\s+/)` → `[scheme, token]`. Дараа нь `verifyToken(token)` → `{ userId }` эсвэл `null`, тэгээд `User.findById(userId)`.

### "Засаж болох issue"-д нэг helper
`issue.ts` дотор жижиг `loadWritableIssue(ctx, id)` бич: requireUser → findById (NOT_FOUND) → assertCanWriteProject дарааллаар ажиллана. Үүнийг update/delete/addLabel/removeLabel-д хэрэглэвэл mutation бүр нэг хэв маягтай үлдэнэ. Copy-paste хийсэн шалгалтууд бие биенээсээ холдоно.

### formatError
`@apollo/server/errors`-оос `unwrapResolverError(error)` нь анхны error-ыг өгнө. `instanceof mongoose.Error.ValidationError` / `instanceof mongoose.Error.CastError`-ийг шалгаад, дараа нь `original.code === 11000`-ийг шалга (field нь `Object.keys(original.keyValue)[0]`).
