---
title: Type system ба SDL
source: 5dc1e39102a1be10442e55dcbcc2933cbd5fa0e9b413f7501afe7693aa8301de
---

Schema бол чиний API ба түүнийг ашиглах client бүрийн хоорондох **contract**. Том codebase дээр энэ нь хамгийн сайн газрын зураг ч бас: schema-г нээхэд нэг ч resolver уншилгүйгээр систем юу хийж чадахыг мэдэж авна. Үүнийг **SDL** буюу Schema Definition Language-ээр бичдэг.

## Object type ба scalar-ууд

```graphql title="Bookshelf schema"
"""A book on the shelf."""
type Book {
  id: ID!
  title: String!
  year: Int
  rating: Float
  inPrint: Boolean!
  author: Author!
  tags: [String!]!
}

type Author {
  id: ID!
  name: String!
  books: [Book!]!
}
```

**Type** нь **field**-үүдтэй, field бүр өөрийн type-тай. Өөр object type-тай field (`author: Author!`) байгаагаас үүнийг *graph* гэж нэрлэдэг: client номоос зохиолч руу, тэндээс зохиолчийн бусад ном руу алхаж чадна.

Built-in таван **scalar** байдаг, query бүрийн навч нь эдгээр:

| Scalar | Юу вэ | Тайлбар |
| --- | --- | --- |
| `Int` | 32-bit тэмдэгтэй бүхэл тоо | 2,147,483,647-оос их бол унана; том тоонд `Float` эсвэл string хэрэглэ |
| `Float` | double | |
| `String` | UTF-8 текст | |
| `Boolean` | true / false | |
| `ID` | давтагдашгүй identifier | string болж serialize хийгдэнэ; "үүн дээр тооцоо бүү хий" гэсэн дохио |

Built-in огноо байхгүй. Түгээмэл сонголт нь ISO-8601 `String`, эсвэл `DateTime` шиг **custom scalar**, чиний өмнөөс validate хийж хөрвүүлнэ. Taskforge бүх зүйлийг ил байлгахын тулд ISO string хэрэглэнэ. "Date object-ыг шууд буцаа" гэсэн санаа яагаад чиний бодсоноор ажилладаггүйг Module 7-д харна.

Type эсвэл field-ийн өмнөх `"""triple-quoted text"""` бол **description**. Энэ нь tooling болон introspection дээр харагдана. Хамтдаа хэрэглэдэг schema-д нэрнээс нь утга нь ойлгогдохгүй бүх зүйлд description бич.

## Non-null ба list-үүд

Default-оор **field бүр nullable**. `!` нь түүнийг non-null болгоно: server утга өгнө гэж амлана. Дөрвөлжин хаалт list үүсгэнэ. Хоёр нь хослодог, эхэндээ хүн бүр эдгээр хослолд будлиддаг:

```viz nullability
```

Дотроос гадагш нь унш: `[String!]!` бол "non-null string-үүдийн non-null list". Практикт хамгийн түгээмэл хэлбэрүүд:

- `[Issue!]!` нь үргэлж list (хоосон байж болно), доторх нь хэзээ ч null биш. Олон зүйл буцаах field-д default сонголт нь энэ.
- `Issue` (nullable) нь юу ч олдохгүй байж болох хайлтад: `issue(id: ID!): Issue`.
- `String!` нь title шиг үнэхээр үргэлж байдаг field-үүдэд.

### Nullability сонгох нь API дизайны шийдвэр

Non-null бол **амлалт**, буцаахад хэцүү. `String!`-ийг `String` болгох нь утга байна гэж тооцсон client-уудын хувьд breaking change. Дараагийн хичээлд харах илүү нарийн зардал бас бий: non-null field resolve хийгдэхгүй бол null **дээш гарч**, response-ийн хамаагүй том хэсгийг арилгаж болно.

Практик дүрэм:

- Утга **үргэлж** байдаг, түүнийг тооцоолоход алдаа гарах нь бодит биш бол field-ийг non-null болго (`id`, `title`, `createdAt`).
- Domain-д заавал биш бол (`assignee`), id-аар хайдаг бол (`issue(id)`), эсвэл унасан байж болзошгүй өөр service-ээс хамаарч байвал nullable үлдээ.
- Argument-ууд эсрэгээрээ: `issue(id: ID!)`. **Input**-уудыг хатуу болго, ингэвэл буруу request validation дээр эрт унана.

## Enum-ууд

```graphql
enum Format {
  HARDCOVER
  PAPERBACK
  EBOOK
}
```

Enum бол тогтсон утгуудын олонлогтой scalar. Client өөр утга илгээж чадахгүй: server validation дээр, чиний код ажиллахаас өмнө reject хийнэ. Mongoose schema-д чинь `enum` байгаа газар бүрт хэрэглэ, хоёр жагсаалтыг яг ижил байлга.

## Argument, input ба default-ууд

Дурын field argument авч болно, хүсвэл default-тай:

```graphql
type Author {
  books(format: Format, sort: BookSort = NEWEST, limit: Int = 20): [Book!]!
}
```

Argument-ууд бүтэцтэй багц болбол (ялангуяа mutation-д) **input type** болгож нэгтгэ:

```graphql
input AddBookInput {
  title: String!
  year: Int
  authorId: ID!
  tags: [String!]
}

type Mutation {
  addBook(input: AddBookInput!): Book!
}
```

Input type нь object type-тай төстэй ч `input` keyword-оор зарлана. Field нь зөвхөн scalar, enum эсвэл өөр input байж чадна (resolver-гүй, object type руу буцах цикл-гүй). `addBook(title: String!, year: Int, …)` гэж бичихийн оронд яагаад энэ вэ? Mutation-ий signature-ийг өөрчлөхгүйгээр field нэмж болно. Ижил input-ыг дахин ашиглана. Client ч зургаан variable-ийн оронд ганц `$input` илгээнэ.

## Root type-ууд: Query ба Mutation

`Query` ба `Mutation` бол энгийн object type, гэхдээ онцгой үүрэгтэй: **entry point** нь эд. Operation бүр эдний аль нэгээс эхэлнэ.

```graphql
type Query {
  books(tag: String): [Book!]!
  book(id: ID!): Book
}

type Mutation {
  addBook(input: AddBookInput!): Book!
}
```

## Schema-г файлуудад хуваах

Жинхэнэ codebase-д 2,000 мөр schema-г нэг файлд хадгалдаггүй. Domain бүр өөрийн хэсгийг эзэмшиж, root field нэмэхдээ `extend type` хэрэглэнэ:

```ts title="graphql/schema/base.ts"
export const baseTypeDefs = /* GraphQL */ `
  type Query
  type Mutation
`;
```

```ts title="graphql/schema/book.ts"
export const bookTypeDefs = /* GraphQL */ `
  type Book { id: ID!  title: String! }

  extend type Query {
    books: [Book!]!
  }
`;
```

```ts title="graphql/schema/index.ts"
export const typeDefs = [baseTypeDefs, bookTypeDefs, authorTypeDefs];
```

Field-гүй `type Query` нь root-ыг зарласан хэрэг, модуль бүр түүнийг `extend` хийдэг. Apollo Server typeDefs-ийн array авч, өөрөө нэгтгэнэ. (`/* GraphQL */` comment нь editor plugin-д string-ийг syntax highlight хийх сануулга төдий.)

Taskforge-ийн schema яг ийм бүтэцтэй. "`createIssue` хаана зарлагдсан бэ?" гэж хайвал хариу нь `schema/issue.ts`.

## Abstract type-ын товч танилцуулга

Module 9-д хэрэглэх type-ын дахин хоёр төрөл:

```graphql
# a field that can return different object types
union SearchResult = Book | Author

# a contract several types share
interface Node { id: ID! }
type Book implements Node { id: ID!  title: String! }
```

## Schema evolution

Олон client schema-аас хамаардаг тул түүнийг болгоомжтой өөрчилдөг:

- Type, field, эсвэл *заавал биш* argument **нэмэх** нь аюулгүй.
- Field-ийг **устгах** эсвэл **нэрийг нь солих**, *input* дахь nullable field-ийг non-null болгох, эсвэл non-null *output* field-ийг nullable болгох нь breaking.
- Field-ийг ашиглалтаас гаргахын тулд эхлээд тэмдэглэж, хожим устга: `oldField: String @deprecated(reason: "Use newField")`.

Том codebase-ийн schema ихэвчлэн жаахан хачин харагддаг нь үүнээс: `issues` *болон* `issueConnection` зэрэгцэж байдаг, учир нь шинэ нь хуучныг орлоогүй, дээр нь нэмэгдсэн. Үүнийг Module 9-д яг ингэж хийнэ.

```quiz
Q: `labels: [Label!]!` field-ийн хувьд эдгээрийн аль response хүчинтэй вэ?
- [ ] `null`
- [x] `[]`
- [ ] `[{ "name": "bug" }, null]`
> Гаднах `!` нь list өөрөө null байхыг, дотоод `!` нь item null байхыг хориглоно. Хоосон list үргэлж зөвшөөрөгдөнө.
```

```quiz
Q: Mongoose schema-д чинь `status: { enum: ['TODO', 'DONE'] }` байна. Энэ field-д хамгийн тохиромжтой GraphQL type аль нь вэ?
- [ ] `status: String!`
- [x] `status: IssueStatus!` ба `enum IssueStatus { TODO DONE }`
- [ ] `status: [String!]!`
> Enum нь зөвшөөрөгдөх утгуудыг contract-ийн нэг хэсэг болгодог: client өөр утга илгээж чадахгүй, tool-ууд autocomplete хийж чадна.
```
