---
title: Client найдаж болох error-ууд
source: 35c4bfe884f7b04cfa1d431c6a1093617b68ff4f8bd3101da6333cb3e012fe41
---

API бүр заримдаа унадаг. Сайн API муугаасаа ялгарах нь алдаа нь **урьдчилан таамаглагдахуйц** эсэхээр. Ижил төрлийн асуудал үргэлж ижил харагдана, machine-readable code авч явна, аль field буруу байгааг хэлнэ, дотоод бүтцийг чинь хэзээ ч задруулахгүй. Энэ хичээлээр яг ийм error-ыг бүтээнэ.

## Хоёр төрлийн алдаа

| | Client error | Server error |
| --- | --- | --- |
| Шалтгаан | request буруу | server буруу (bug, server унах) |
| Жишээ | буруу input, нэвтрээгүй, эрхгүй, олдоогүй | null pointer, DB timeout, барьж аваагүй CastError |
| User-д харуулах message | тодорхой, юу хийхийг зааж өгсөн | ерөнхий: "Something went wrong" |
| Чиний log | ихэвчлэн сонирхолгүй | **маш** сонирхолтой: дэлгэрэнгүй мэдээлэл ба id-тай |

Чиний хэрэглэх code-ууд. Apollo-гийн built-in-үүд, мөн өөрөө тавьдаг түгээмэл code-ууд байгаа, сүүлийнхийг нь custom гэж тэмдэглэв:

| `extensions.code` | Утга | Client ихэвчлэн… |
| --- | --- | --- |
| `GRAPHQL_PARSE_FAILED` / `GRAPHQL_VALIDATION_FAILED` | query өөрөө эвдэрхий (HTTP 400) | client доторх bug |
| `BAD_USER_INPUT` | argument-ууд validation-д унасан | form дээр field тус бүрийн error харуулна |
| `UNAUTHENTICATED` (custom) | нэвтрээгүй / token хүчингүй | login руу redirect хийнэ |
| `FORBIDDEN` (custom) | нэвтэрсэн ч эрхгүй | "хандах эрхгүй" гэж харуулна |
| `NOT_FOUND` (custom) | тэр зүйл байхгүй (эсвэл харагдахгүй) | 404 төлөв харуулна |
| `INTERNAL_SERVER_ERROR` | чиний урьдчилан тооцоогүй бүх зүйл | ерөнхий error харуулж, дахин оролдоно |

> [!BRIDGE]
> REST дээр алдааг status code авч явдаг: 400, 401, 403, 404, 500. GraphQL-д resolver-ийн throw хийсэн error ихэвчлэн HTTP 200-тай, `data`-ийн хажууд `errors` array-д ирдэг, учир нь нэг request хагас амжилттай болж болно. Status code-ын хийдэг ажлыг `extensions.code` хийдэг тул `response.status` биш үүнийг шалга.

## Errors модуль

Code-оо гараар бичсэн `new GraphQLError(...)`-ийг codebase даяар бүү тарь, хэн нэг нь заавал `NOT_FOUNDD` гэж бичнэ. Нэг газарт нэгтгэ:

```ts title="graphql/errors.ts"
import { GraphQLError } from 'graphql';

export const badInput = (message: string, fields?: Record<string, string>) =>
  new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', ...(fields && { fields }) } });
export const unauthenticated = () =>
  new GraphQLError('You must be logged in', { extensions: { code: 'UNAUTHENTICATED' } });
export const forbidden = (message = 'You are not allowed to do that') =>
  new GraphQLError(message, { extensions: { code: 'FORBIDDEN' } });
export const notFound = (what: string) =>
  new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } });
```

Ингэснээр resolver-үүд өгүүлбэр шиг уншигдана: `if (!issue) throw notFound('Issue')`.

## Mongoose error-уудыг client error болгох

Resolver дотор `Issue.create(...)` validation-д унахад Apollo Server үүнийг Mongoose-ийн түүхий message-тэй `INTERNAL_SERVER_ERROR` гэж мэдээлнэ. Техникийн хувьд server үүнийг боловсруулаагүй юм, гэхдээ жинхэнэ буруутан нь user-ийн input. Mutation бүрийг try/catch-д ороож *болно*, гэхдээ **нэг газарт** хөрвүүлэх нь дээр. Тэр газар нь Apollo Server-ийн `formatError` hook: client рүү гарч байгаа error бүр заавал эндээр дамждаг.

```viz-flow
{
  colWidth: 190,
  rowHeight: 74,
  nodes: [
    { id: 'r', label: 'resolver throw хийнэ', sub: 'юу ч байж болно', col: 0, row: 0.5, color: 'gql' },
    { id: 'f', label: 'formatError()', sub: 'нэг газар', col: 1, row: 0.5, color: 'forge' },
    { id: 'gql', label: 'GraphQLError', sub: 'code-той → хэвээр нь нэвтрүүлнэ', col: 2, row: 0, color: 'ok' },
    { id: 'mv', label: 'Mongoose ValidationError', sub: '→ BAD_USER_INPUT + fields', col: 2, row: 1, color: 'ok', w: 175 },
    { id: 'other', label: 'бусад бүх зүйл', sub: '→ log хий, нуу', col: 2, row: 2, color: 'bad' },
  ],
  edges: [
    { from: 'r', to: 'f' }, { from: 'f', to: 'gql' }, { from: 'f', to: 'mv' }, { from: 'f', to: 'other' },
  ],
}
```

```ts title="graphql/errors.ts"
import mongoose from 'mongoose';
import { unwrapResolverError } from '@apollo/server/errors';
import type { GraphQLFormattedError } from 'graphql';

export function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = unwrapResolverError(error); // the thing your resolver actually threw

  if (original instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(original.errors).map(([path, e]) => [path, e.message]));
    return { ...formatted, message: 'Invalid input', extensions: { code: 'BAD_USER_INPUT', fields } };
  }

  if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
    console.error(original); // the real details go to YOUR logs…
    return { message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }; // …not to the client
  }

  return formatted;
}
```

```ts
new ApolloServer({ typeDefs, resolvers, formatError });
```

> [!CAUTION] Apollo Server чиний error message-үүдийг нуудаггүй
> Resolver `new Error('connect ECONNREFUSED 10.0.3.12:27017')` throw хийвэл тэр message client рүү **яг байгаагаараа** гарна, `NODE_ENV=production` үед ч (энэ нь зөвхөн stack trace-ийг хасдаг). Үүнийг энэ sandbox дотор Apollo Server 5 дээр шалгасан. Урьдчилан тооцоогүй error-уудыг нуух нь **чиний** ажил, `formatError` бол үүнийг хийх газар.

> [!WARNING] "ValidationError" нэртэй хоёр зүйл
> GraphQL-ийн өөрийн query-validation error-ууд (`GRAPHQL_VALIDATION_FAILED`) ч `name`-даа `"ValidationError"` гэж авч явдаг. `err.name === 'ValidationError'` гэж шалгавал client-ийн буруу бичсэн query-г Mongoose-ийн асуудал гэж андуурна. `instanceof mongoose.Error.ValidationError` хэрэглэ. Том codebase дээр нэр байнга давхцдаг тул string нэрээс илүү `instanceof` эсвэл тодорхой code-д найд.

Давхардал (`E11000`) ба `CastError`-ууд яах вэ? Санаа ижил. Эдгээр бас client-ийн алдаа (аль хэдийн авагдсан email, буруу хэлбэртэй id) тул `BAD_USER_INPUT` болгож хөрвүүл. *Message* нь хүнд ойлгомжтой хэвээр байж болно: "That email is already registered".

## Error ба nullability, дахин

Throw хийгдсэн error нь гарсан field-ээ null болгоод, дараа нь non-null parent-уудаар дээш гарна (Module 6). Тиймээс шалгалтыг **хаана** тавьснаас response өөрчлөгдөнө:

```compare
--- check in a field resolver (User.email)
{
  "data": {
    "issue": {
      "title": "Login page",
      "reporter": { "name": "Ada", "email": null }
    }
  }
}
// returned null instead of throwing —
// the rest of the page is fine
--- throw in a non-null field (reporter: User!)
{
  "data": { "issue": null },
  "errors": [{
    "message": "You are not allowed…",
    "path": ["issue", "reporter", "email"]
  }]
}
// email: String! threw, so the null bubbled
// up and took the whole issue with it
```

Field түвшний permission ихэвчлэн throw хийхгүй, **null буцаах** нь зөв. `email` nullable field байгаагийн учир энэ: бусад user-д `null` гарна. Харин operation (mutation, хамгаалалттай root query) дээр throw хий, тэнд бүхэлд нь унах нь зөв үр дүн.

## Mutation-ууд: цэвэрхэн унах

Mutation-д хэрэгтэй contract нь: **ажилласан бол object-оо авна, ажиллаагүй бол code-той error авна** (бас юу ч өөрчлөгдөөгүй). Тэгэхээр database-д бичихээс *өмнө* validate хийж, permission шалга:

```ts
updateIssue: async (_p, { id, input }, ctx) => {
  const user = requireUser(ctx);                  // 1. who? (UNAUTHENTICATED)
  const issue = await Issue.findById(id);
  if (!issue) throw notFound('Issue');             // 2. exists? (NOT_FOUND)
  await assertCanWriteProject(user, issue.project); // 3. allowed? (FORBIDDEN)
  return updateIssue(id, input);                   // 4. do it (validation → BAD_USER_INPUT via formatError)
},
```

Дараалал чухал. Дуудагч нэвтэрсэн эсэхийг мэдэхээсээ өмнө `X` issue байгааг (NOT_FOUND, FORBIDDEN-ын ялгаагаар) илчилж болохгүй. Бүх шалгалт давтал юу ч бүү бич.

```quiz
Q: Resolver `new Error('Cannot read properties of undefined (reading "role")')` throw хийв. Custom formatError байхгүй бол client юу харах вэ?
- [ ] "Internal server error"
- [x] Яг тэр message, INTERNAL_SERVER_ERROR code-той
- [ ] Юу ч үгүй, зүгээр л field нь null
> Apollo Server message-ийг хэвээр нь дамжуулдаг. Урьдчилан тооцоогүй error-уудыг `formatError` дотор нууж, анхныхыг нь debug хийхэд хүрэлцэхүйц context-той log хий.
```

```quiz
Q: `formatError` Mongoose error-уудыг хөрвүүлэхийн тулд `err.name === 'ValidationError'` гэж шалгадаг. Юу буруу болох вэ?
- [x] Буруу бичсэн query-ууд (GraphQL validation error) BAD_USER_INPUT гэж андуурагдана
- [ ] Юу ч болохгүй, зөвхөн Mongoose л энэ нэрийг хэрэглэдэг
- [ ] Mongoose error-ууд formatError руу хэзээ ч очдоггүй
> GraphQL-ийн validation error-ууд яг ижил `name` хэрэглэдэг. `instanceof mongoose.Error.ValidationError` хэрэглэ.
```
