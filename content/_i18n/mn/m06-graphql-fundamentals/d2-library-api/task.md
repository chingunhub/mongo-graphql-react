---
title: "Drill: Жижиг library API"
summary: Анхны Apollo Server, хадгалагдсан хэлбэр ба schema-н хэлбэрийг холбох resolver-үүд, мөн нэг mutation.
source: b42227d96d9ba8a375106e4b47604812a254870db671c26a832d0df06c7eda0b
---

Чиний анхны жинхэнэ GraphQL server. Өгөгдөл `data.ts`-д санах ойд байгаа тул чи GraphQL тал дээр төвлөрч болно. Эхлээд өгөгдлөө хар: ном бүр **`authorId`** хадгалдаг боловч schema нь **`author`** object-ыг харуулдаг. Хадгалагдсан хэлбэр ба харагдах хэлбэрийг холбох нь resolver-ийн ажлын ихэнх хэсэг.

## Даалгавар

`server.ts`-д:

1. **SDL-ээ дуусга.** Type-ууд ба query-ууд бичигдсэн байна. Нэм:
   - `AddBookInput` input type: `title` (заавал string), `year` (заавал int), `genre` (заавал `Genre`) ба `authorId` (заавал id),
   - `Mutation` type, түүн дотор `addBook(input: AddBookInput!): Book!`.

2. **Resolver-үүдээ бич** дараах байдлаар:
   - `books(genre)` бүх номыг буцаана, эсвэл genre өгсөн бол зөвхөн тэр genre-ийнхийг. **`year`-ээр sort хий, хуучин нь эхэнд.**
   - `book(id)` ном эсвэл `null` буцаана.
   - `authors` бүх зохиолчийг буцаана.
   - `Book.author` тухайн номын `authorId`-д тохирох зохиолчийн object-ыг буцаана.
   - `Author.books` тухайн зохиолчийн номуудыг буцаана, хуучин нь эхэнд.
   - `addBook(input)` шинэ, давтагдашгүй `id`-тай ном үүсгэж, өгөгдөлд нэмээд буцаана. `authorId` ямар ч зохиолчтой таарахгүй бол `GraphQLError` throw хий, message нь `Unknown author` байна (`graphql`-ээс import хий).

3. **`createServer()`** `new ApolloServer({ typeDefs, resolvers })` буцаана.

Playground хэдэн operation-ийг `server.executeOperation(...)`-ээр ажиллуулна. Apollo Server HTTP-гүйгээр operation ажиллуулдаг арга энэ, тест (мөн Apollo-ийн docs) ч server-ийг яг ингэж тест хийдэг.

## Hints

### Ямар resolver хэрэгтэй вэ?
Зөвхөн `parent[fieldName]` зөв утгыг гаргахгүй field-үүдэд л resolver хэрэгтэй. `Book.title` гэвэл default resolver өөрөө шийдэнэ. `Book.author`-ийн хувьд ном object дээр `author` property байхгүй, зөвхөн `authorId` байдаг. Энэ нь resolver шаардана.

### Resolver-ийн signature
`Query: { books: (_parent, args) => … }`-д `args.genre` нь дамжуулаагүй үед `undefined` байна. `Book: { author: (book) => … }`-д эхний argument нь parent resolver-ийн буцаасан ном object.

### In place sort хийж болохгүй
`books.sort(...)` хуваалцсан array-г өөрчилчихнө. Эхлээд хуул: `[...books].sort(...)` эсвэл `books.filter(...).sort(...)` (filter аль хэдийн шинэ array буцаадаг).
