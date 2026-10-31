---
title: Context, authentication ба authorization
source: c0cb84882d10df4024fc7b19e512e53fb93ad3183e4c21630c7000f6f4879764
---

Өнөөг хүртэл чиний resolver-үүд тестийн өгсөн `currentUser`-д итгэж ирсэн. Жинхэнэ server дээр энэ утга HTTP request-ээс гарч, verify хийгдэж, дараа нь дуудагч бүр юу хийж болохыг шийдэхэд ашиглагдана. Хоорондоо хутгалдаад байдаг гурван тусдаа асуудал бий:

| | Асуулт | Хаана хийгддэг |
| --- | --- | --- |
| **Context** | *Энэ request*-ийн resolver бүрт юу хэрэгтэй вэ? | context function, request бүрт нэг удаа |
| **Authentication** (authn) | *Хэн* дуудаж байна вэ? | context function: token → user |
| **Authorization** (authz) | Тэр үүнийг хийж *болох уу*? | resolver-үүд / service-үүд / field resolver-үүд |

> [!BRIDGE]
> Express дээр token уншиж, `req.user` тавиад `next()` дууддаг auth middleware бичдэг байсан. Context function бол тэр middleware-ийн эхний хагас: request бүрт нэг удаа, handler-уудаас өмнө ажиллаж, `req.user` чинь `context.currentUser` болно. Хоёр дахь хагас нь өөр газар шилжсэн. Token байхгүй байсан ч request энд ихэвчлэн дуусдаггүй, учир нь зарим field нийтэд нээлттэй. Тиймээс user хэрэгтэй resolver бүр өөрөө татгалзана.

## Context: request бүрт нэг object

Apollo Server request бүрийн эхэнд чиний **context function**-ыг дууддаг. Түүний буцаасан зүйл тэр request-ийн resolver бүрийн гурав дахь argument болно:

```ts
const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => ({
    currentUser: await userFromRequest(req),
    requestId: crypto.randomUUID(),
  }),
});
```

```viz-sequence
{
  actors: [
    { id: 'c', label: 'client', color: 'react' },
    { id: 's', label: 'Apollo Server', color: 'gql' },
    { id: 'ctx', label: 'context()', color: 'forge' },
    { id: 'r', label: 'resolvers', color: 'gql' },
  ],
  steps: [
    { from: 'c', to: 's', label: 'POST /graphql + Authorization header', note: 'Request A ирлээ.' },
    { from: 's', to: 'ctx', label: 'context({ req })', note: 'Execution-ээс өмнө, **request бүрт нэг удаа** дуудагдана.' },
    { from: 'ctx', to: 's', label: '{ currentUser, … }', ret: true, note: 'Шинэхэн object. Яг тэр үед ирсэн Request B **өөрийн** context-ыг авна. User-үүдийн өгөгдөл хоорондоо холилдохгүй байгаагийн учир энэ.' },
    { from: 's', to: 'r', label: 'resolver(parent, args, ctx)', note: 'Энэ request-ийн resolver бүр **нэг** `ctx` object-ыг хүлээн авна.' },
    { from: 'r', to: 's', label: 'values', ret: true },
    { from: 's', to: 'c', label: '{ data, errors }', ret: true, note: 'Request дууслаа. Context хэрэггүй болсон: дотор нь юу ч дараагийн request хүртэл үлдэхгүй.' },
  ],
}
```

Сүүлийн санаа бол дүрэм: **user бүрийн эсвэл request бүрийн зүйл context-д орно, модулийн түвшний variable-д хэзээ ч биш.** Модулийн түвшний `let currentUser` нэг user-тэй development дээр төгс ажиллаад, ачаалал ирэхэд нэг user-ийн өгөгдлийг нөгөөд нь задруулна. (Module 9-д DataLoader-уудыг context-д тавих болно, яг энэ шалтгаанаар.)

## Token-оор authentication

Нэлээд түгээмэл схем, Taskforge ч яг үүнийг хэрэглэдэг:

```viz-sequence
{
  actors: [
    { id: 'c', label: 'client', color: 'react' },
    { id: 's', label: 'server', color: 'gql' },
    { id: 'db', label: 'users', color: 'mongo' },
  ],
  steps: [
    { from: 'c', to: 's', label: 'mutation login(email, password)', note: 'Password зөвхөн энэ нэг удаа дамжина.' },
    { from: 's', to: 'db', label: 'findByCredentials', note: 'Hash харьцуулалт, чиний Module 5-ийн код.' },
    { from: 's', to: 'c', label: '{ token, user }', ret: true, note: 'Server user id болон хугацаа дуусах цагийг агуулсан token-ыг **sign хийнэ**. Sign хийх secret-ийг зөвхөн server мэднэ.' },
    { from: 'c', to: 's', label: 'Authorization: Bearer <token>', note: 'Дараагийн request бүр token-ыг header-т авч явна.' },
    { from: 's', to: 's', label: 'verify signature + expiry', note: 'Context function signature-ийг (энэ token-ыг бид үүсгэсэн үү, өөрчлөгдөөгүй юу?) болон хугацааг шалгана.' },
    { from: 's', to: 'db', label: 'User.findById(token.sub)', note: '*Одоогийн* user-ийг ачаал: token гарснаас хойш тэр устсан эсвэл эрх нь бууруулагдсан байж магадгүй.' },
    { from: 's', to: 's', label: 'ctx.currentUser = user', note: 'Одоо resolver-үүд хэн дуудаж байгааг мэднэ.' },
  ],
}
```

Sign хийсэн token иймэрхүү харагдана:

```text
eyJzdWIiOiI2NmYxYzJhOSIsImV4cCI6MTc5MjAwMDAwMH0.k3l2…signature
└──────────── payload (base64url JSON) ──────────┘ └── HMAC ──┘
```

Хүмүүсийн андуурдаг хоёр зүйл:

- **Sign хийсэн нь encrypt хийсэн гэсэн үг биш.** Хэн ч payload-ыг base64-аар decode хийж уншиж чадна. Token-д нууц мэдээллийг хэзээ ч бүү хий. Өөрчилж *болохгүй* (tamper-proof), гэхдээ нууц биш.
- **Request бүрт verify хий.** Signature таарч, мөн хугацаа нь дуусаагүй байж л token утга учиртай. Verify амжилтгүй бол дуудагчийг anonymous гэж үз (`currentUser: null`). Public query-үүд ажилласаар байх ёстой тул context function дотроос throw хийж болохгүй.

(JWT бол яг үүнд зориулсан стандарт формат. Taskforge жижигхэн HMAC token helper хэрэглэдэг, нэг суултад уншиж дуусна. Browser app дээр JS-ээс уншигдах header-ээс HttpOnly cookie ихэвчлэн аюулгүй *дамжуулах суваг* болдог. Verify хийх логик нь адилхан.)

> [!CAUTION]
> Дуудагч хэн бэ гэдгийг client-ийн input-оос хэзээ ч бүү ав. `createIssue(input: { reporterId: "…" })` гэвэл хэн ч хэн нэгний нэрээр issue нээж чадна. Дуудагч хэн бэ гэдэг **context доторх verify хийгдсэн token**-оос л гарна, өөр юунаас ч биш. Чиний `createIssue` өмнө нь `ctx.currentUser`-ийг хэрэглэж байсан нь үүнээс.

## Authorization: шалгалтууд хаана байх вэ?

Бүдүүнээс нарийн руу гурван түвшин:

```viz-flow
{
  colWidth: 210,
  rowHeight: 78,
  nodes: [
    { id: 'op', label: 'Operation түвшин', sub: 'нэвтэрсэн байх ёстой', col: 0, row: 0, color: 'gql' },
    { id: 'obj', label: 'Object түвшин', sub: 'ЭНЭ issue-г засаж болох уу?', col: 1, row: 0, color: 'gql' },
    { id: 'field', label: 'Field түвшин', sub: 'ЭНЭ field-ийг харж болох уу?', col: 2, row: 0, color: 'gql' },
    { id: 'op2', label: 'requireUser(ctx)', col: 0, row: 1, color: 'neutral' },
    { id: 'obj2', label: 'assertCanEdit(user, issue)', sub: 'services/permissions', col: 1, row: 1, color: 'neutral', w: 190 },
    { id: 'field2', label: 'User.email resolver', sub: 'өөрөө/admin биш бол null', col: 2, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'op', to: 'op2', dashed: true }, { from: 'obj', to: 'obj2', dashed: true }, { from: 'field', to: 'field2', dashed: true },
  ],
}
```

**Operation түвшин**: "issue-г зөвхөн нэвтэрсэн user нээж чадна". Resolver-ийн эхэнд нэг мөр guard:

```ts
export function requireUser(ctx: Context) {
  if (!ctx.currentUser) throw new GraphQLError('You must be logged in', { extensions: { code: 'UNAUTHENTICATED' } });
  return ctx.currentUser;
}
```

**Object түвшин**: "project-ийн issue-г зөвхөн тэр project-ийн гишүүд засна". Үүнд *object* хэрэгтэй (энэ issue аль project-д байна, гишүүд нь хэн бэ?), мөн ижил дүрэм хэд хэдэн mutation-д үйлчилнэ. Таван resolver-т copy-paste хийхийн оронд **permissions/service модуль доторх нэг function**-д тавь:

```ts title="services/permissions.ts"
export function canWriteProject(user, project) {
  return user.role === 'ADMIN'
    || String(project.owner) === String(user._id)
    || project.members.some((m) => String(m) === String(user._id));
}
```

Дүрэм өөрчлөгдөхөд ("…мөн гэрээт ажилтнууд устгаж болохгүй") засах газар нэг л байна. Том codebase дээр энэ *асар* чухал: тараагдсан authorization шалгалтууд дээр security bug амьдардаг, учир нь хэн нэг нь заавал нэг copy-г мартдаг.

**Field түвшин**: "user-ийн email-ийг зөвхөн тэр user өөрөө болон admin-ууд харна". Үүнийг field resolver өөрөө шийднэ:

```ts
User: {
  email: (user, _args, ctx) =>
    ctx.currentUser && (ctx.currentUser.role === 'ADMIN' || String(ctx.currentUser._id) === String(user._id))
      ? user.email
      : null,
},
```

`email` чиний schema-д nullable байгаагийн учир энэ: field хүн бүрт байгаа ч түүний *утга* хэн асууж байгаагаас хамаарна. Field түвшний шалгалт бол field-ийг **аль query замаар хүрсэн ч** хамгаалах цорын ганц арга: `me { email }`, `issue { reporter { email } }`, `project { members { email } }`… бүх зам тэр нэг resolver-т ирж төгсдөг.

### FORBIDDEN уу, NOT_FOUND уу?

User-д private project-ийг харах эрх байхгүй бол "forbidden" гэх үү, "not found" гэх үү? "Forbidden" гэвэл тэр project *байгааг* баталж өгч байгаа юм. Заримдаа энэ нь мэдээлэл задрах хэрэг (private repo-уудын нэрийг бод). Түгээмэл бодлого: **огт харж чадахгүй зүйлд NOT_FOUND, харж чадах ч өөрчилж чадахгүй зүйлд FORBIDDEN.** Нэг бодлого сонгоод хаа сайгүй адилхан хэрэгжүүл.

```quiz
Q: Одоогийн user яагаад context-д байх ёстой вэ, context function-аар тохируулсан модулийн түвшний variable-д биш юм бэ?
- [ ] Модулийн түвшний variable удаан
- [x] Зэрэгцээ request-үүд бие биенийхээ user-ийг дарж бичнэ: нэг хүн нөгөөгийнх нэрээр үйлдэл хийж болно
- [ ] Apollo Server модулийн түвшний variable-ыг хориглодог
> Node нэг process дотор олон request-ийг зэрэг боловсруулдаг. Модулийн түвшний variable тэдгээр бүгдэд нийтлэг, харин context object request бүрт тусдаа үүснэ.
```

```quiz
Q: Token-ы payload нь `{"sub":"66f1…","exp":1792000000}`, base64url-ээр encode хийгдсэн, дээрээс нь HMAC signature-тай. Үүнийг замд нь барьж авсан халдагч юу хийж чадах вэ?
- [ ] Юу ч хийж чадахгүй, учир нь encrypt хийгдсэн
- [ ] `sub`-ийг өөр user-ийн id болгож сольж, дахин ашиглана
- [x] Payload-ыг уншиж, хугацаа дуустал token-ыг дахин ашиглаж (replay) чадна, харин өөрчилж чадахгүй
> Sign хийсэн нь encrypt хийсэн гэсэн үг биш: payload-ыг уншиж болно. Өөрчилбөл signature эвдэрнэ. Replay байдаг учраас token-д хугацаа тавьдаг, мөн transport (HTTPS, HttpOnly cookie) чухал.
```
