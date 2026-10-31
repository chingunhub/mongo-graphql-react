---
title: Mutation, алдаа, томорч чадах resolver бүтэц
source: 65213ca3bf44abb47d109f185652809ca4db15baa0101a19068894711b9c0c9e
---

Query уншдаг, mutation өөрчилдөг. Механик нь адил (resolver-тэй root field), харин дизайны асуулт өөр: юуг хүлээн авах, юуг буцаах, унахад юу болох вэ? Үүний дараа resolver-үүдээ том codebase-ийн хийдэг шигээ зохион байгуулна.

## Сайн mutation-ий хэлбэр

```graphql
input AddReviewInput {
  bookId: ID!
  rating: Int!
  text: String
}

type Mutation {
  addReview(input: AddReviewInput!): Review!
  updateReview(id: ID!, input: UpdateReviewInput!): Review!
  deleteReview(id: ID!): ID!
}
```

Ихэнх codebase-д тааралдах дүрмүүд:

- **Үйл үг + нэр үг** нэршил: `createIssue`, `updateIssue`, `assignIssue`. Үйлдэл нь өөрийн дүрэмтэй бол ерөнхий `updateProject(archived: true)`-оос тодорхой үйлдлийг (`archiveProject`) илүүд үз.
- Create, update-д **нэг `input` argument**, update-д нэмээд `id`.
- **Өөрчлөгдсөн object-ыг буцаа**, `Boolean` биш. Client энэ mutation-ийг үр дүнг харуулахын тулд дуудсан. Object-ыг (`id`-тай нь) буцаавал Apollo Client cache-ээ автоматаар шинэчилж чадна (Module 11). Delete ихэвчлэн устгагдсан `ID`-г буцаана.

Resolver өөрөө ихэвчлэн нимгэн. Жинхэнэ ажил чинь аль хэдийн бүтээсэн data layer-д байдаг:

```ts
Mutation: {
  addReview: async (_parent, { input }, ctx) => {
    const { bookId, ...rest } = input;
    return Review.create({ ...rest, book: bookId, by: ctx.currentUser._id });
  },
},
```

Input-ийн **field нэр model-ийнхтэй таарах албагүйг** анзаар: API `bookId` гэнэ (id учраас тэгж нэрлэнэ), model `book` гэж хадгална. Энэ хоёр нэрийг хооронд нь хөрвүүлдэг layer бол resolver. Хөрвүүлэлтийг *энд* хий, business дүрмээ data/service layer-д байлга.

## Resolver-ээс алдаа throw хийх

Ямар нэг зүйл буруу үед, жишээ нь ном олдохгүй бол throw хий. GraphQL үүнийг барьж аваад field-ийн path-тай нь `errors`-т бүртгэж, `data` дотор `null` тавина (өмнө нь харснаар non-null field-үүдээр дээш гарна):

```ts
import { GraphQLError } from 'graphql';

updateReview: async (_parent, { id, input }) => {
  const review = await Review.findByIdAndUpdate(id, { $set: input }, { returnDocument: 'after', runValidators: true });
  if (!review) {
    throw new GraphQLError('Review not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }
  return review;
},
```

```json
{
  "data": null,
  "errors": [{
    "message": "Review not found",
    "path": ["updateReview"],
    "extensions": { "code": "NOT_FOUND" }
  }]
}
```

Client-ууд code-оор нь салаалж шийддэг учраас **`extensions.code`** чухал. Message хүнд зориулагдсан, өөрчлөгддөг; code бол гэрээ. Apollo Server зарим code-ыг аль хэдийн ашигладаг (`BAD_USER_INPUT`, `GRAPHQL_VALIDATION_FAILED`, `INTERNAL_SERVER_ERROR`…), чи `NOT_FOUND` шиг өөрийнхөө code-ыг нэмнэ. Зохистой error layer бол Module 8-ын сэдэв. Одоохондоо ямар нэг зүйл олдохгүй бол code-той `GraphQLError` throw хий.

Харин санаатайгаар throw хийгээгүй алдаа, жишээ нь `Review.create`-ээс гарсан Mongoose `ValidationError` яах вэ? Тэр ч бас Mongoose-ийн message-тэй `errors`-т орно (code нь `INTERNAL_SERVER_ERROR`). Сайн биш ч, эвдрээгүй. Module 8 эдгээрийг field бүрийн дэлгэрэнгүйтэй цэвэр `BAD_USER_INPUT` алдаа болгоно.

## Хэсэгчилсэн update, болгоомжтой

`UpdateReviewInput` зөвхөн заавал биш field-үүдтэй. Өмнөх хичээлийн "орхигдсон" ба "null" хоёрын ялгааг хадгалан, input-ыг repository-ийн "patch" function руу дамжуул:

```ts
const { bookId, ...patch } = input;  // rename/translate fields that differ
if (bookId !== undefined) patch.book = bookId; // keep null as null, skip undefined
```

"Энэ field-ийг цэвэрлэ" гэдэг утгыг амьд үлдээдэг шалгалт нь `!== undefined` (truthiness биш!).

## Mutation-ууд дарааллаараа ажиллана

Execution-ийн хичээлд үзсэнчлэн, root mutation field-үүд **дараалж** execute хийгдэнэ:

```graphql
mutation {
  first: addReview(input: { bookId: "b1", rating: 5 }) { id }
  second: addReview(input: { bookId: "b1", rating: 4 }) { id }
}
```

`first` дуусч байж `second` эхэлнэ. Query ийм баталгаа өгөхгүй.

## Томорч чадах resolver бүтэц

1,500 мөртэй нэг `resolvers.ts` бол codebase-ийг замбараагүй болгох хамгийн богино зам. **Domain**-оор нь хувааж, schema файлуудыг даган хий:

```viz-flow
{
  colWidth: 175,
  rowHeight: 64,
  nodes: [
    { id: 's1', label: 'schema/book.ts', col: 0, row: 0, color: 'gql' },
    { id: 's2', label: 'schema/author.ts', col: 0, row: 1, color: 'gql' },
    { id: 'r1', label: 'resolvers/book.ts', col: 1, row: 0, color: 'gql' },
    { id: 'r2', label: 'resolvers/author.ts', col: 1, row: 1, color: 'gql' },
    { id: 'idx', label: 'resolvers/index.ts', sub: '[book, author]', col: 2, row: 0.5, color: 'gql' },
    { id: 'srv', label: 'server.ts', sub: 'createApolloServer()', col: 3, row: 0.5, color: 'forge' },
  ],
  edges: [
    { from: 's1', to: 'r1', dashed: true }, { from: 's2', to: 'r2', dashed: true },
    { from: 'r1', to: 'idx' }, { from: 'r2', to: 'idx' }, { from: 'idx', to: 'srv' },
  ],
}
```

Domain файл бүр өөрийн эзэмшдэг key-үүдтэй resolver map export хийнэ, root field ч үүнд орно:

```ts title="resolvers/book.ts"
export const bookResolvers = {
  Query: { books: …, book: … },
  Mutation: { addBook: … },
  Book: { id: …, author: …, createdAt: … },
};
```

```ts title="resolvers/author.ts"
export const authorResolvers = {
  Query: { authors: … },
  Author: { id: …, books: … },
};
```

Apollo Server resolver map-уудын **array** хүлээн авч нэгтгэдэг. Хоёр файлын `Query` нэг болно:

```ts title="resolvers/index.ts"
export const resolvers = [bookResolvers, authorResolvers];
```

```ts title="server.ts"
import { ApolloServer } from '@apollo/server';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';

export function createApolloServer() {
  return new ApolloServer({ typeDefs, resolvers });
}
```

Модулийн түвшинд `const server = new ApolloServer(...)` бичихийн оронд **factory function** хэрэглэх нь харагдаж байгаагаас илүү чухал: тест бүрт шинэ server үүсгэж болно, мөн хэзээ эхлүүлэхийг startup код (Module 13) шийднэ. Том codebase-д баримтлах ерөнхий дүрэм нь: **модуль import хийснээр юу ч эхэлж ажиллахгүй.**

### Ийм codebase дотроос юуг хаанаас олох вэ

Bug report-д "`Issue.assignee` буруу хүн харуулж байна" гэвэл зам одоо таамаглахуйц:

1. `schema/issue.ts` — field-ийн type, argument-ууд нь юу вэ?
2. `resolvers/issue.ts` → `Issue.assignee` — юуг, parent-ийн аль property-оос ачаалж байна?
3. түүний дууддаг repository/model.

Төлөвшүүлэх зуршил энэ: **schema → resolver → data layer.** Чиний орох GraphQL codebase бүр энэ газрын зургийн ямар нэг хувилбартай.

## HTTP-гүйгээр тест хийх

`server.executeOperation()` operation-ийг бүтэн pipeline-аар (parse, validate, execute, error format) сүлжээгүйгээр ажиллуулна:

```ts
const server = createApolloServer();
const res = await server.executeOperation(
  { query: 'mutation($input: AddReviewInput!) { addReview(input: $input) { id rating } }', variables: { input } },
  { contextValue: { currentUser: sam } }, // context you'd normally build from the request
);
// res.body.singleResult → { data, errors }
```

Энэ course-ийн далд тестүүд чиний Taskforge server-тэй яг ингэж харилцдаг.

```quiz
Q: Mutation resolver `const patch = { ...input, assignee: input.assigneeId || null }` гэж бичжээ. Bug нь юу вэ?
- [ ] `||` нь `??`-оос удаан
- [x] Орхигдсон `assigneeId` `null` болж, update бүр issue-ийн assign-ийг салгана
- [ ] Юу ч биш: MongoDB update дээр null, undefined хоёр адил
> Орхигдсон → undefined → `|| null` → null → "unassign". `if (input.assigneeId !== undefined) patch.assignee = input.assigneeId` хэрэглэ.
```

```quiz
Q: Хоёр файл хоёулаа `Query` key-тэй resolver map export хийдэг. `[a, b]`-г Apollo Server-ийн `resolvers` болгон дамжуулбал юу болох вэ?
- [ ] Хоёр дахь Query эхнийхийг дарна
- [x] Нэгдэнэ: Query хоёр файлын field-ийг бүгдийг нь авна
- [ ] Startup алдаа: давхардсан Query
> Resolver map-ууд field бүрээр нэгдэнэ. (*Ижил* field-ийг хоёуланд нь тодорхойлбол зөрчил эндээс эхэлнэ, тиймээс field бүрийг яг нэг domain файлд байлга.)
```
