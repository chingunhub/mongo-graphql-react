---
title: Query хэрхэн execute хийгддэг
source: e7878cef61fa719a7daad22e7712f51cb7f6d6dd18a3f8beaaf3c95bf7c2f890
---

GraphQL server ид шид шиг санагдахаа болиулдаг хичээл нь энэ. Execution-ыг нүдэнд харж чадвал performance-ийн асуудлыг урьдчилан таамаглаж, error response-ыг ойлгож, field буруу ирэхэд аль function-ыг нээхээ яв цав мэднэ.

## Гурван шат

```viz-flow
{
  colWidth: 175,
  rowHeight: 86,
  nodes: [
    { id: 'text', label: 'query text', sub: 'string', col: 0, row: 0, color: 'neutral' },
    { id: 'parse', label: 'parse', sub: '→ AST', col: 1, row: 0, color: 'gql' },
    { id: 'validate', label: 'validate', sub: 'schema-тай тулгана', col: 2, row: 0, color: 'gql' },
    { id: 'exec', label: 'execute', sub: 'resolver дуудна', col: 3, row: 0, color: 'gql' },
    { id: 'syntax', label: 'syntax error', sub: 'data-гүй', col: 1, row: 1, color: 'bad' },
    { id: 'invalid', label: 'validation error', sub: 'data-гүй', col: 2, row: 1, color: 'bad' },
    { id: 'result', label: '{ data, errors? }', col: 3, row: 1, color: 'ok' },
  ],
  edges: [
    { from: 'text', to: 'parse' },
    { from: 'parse', to: 'validate' },
    { from: 'validate', to: 'exec' },
    { from: 'parse', to: 'syntax', dashed: true },
    { from: 'validate', to: 'invalid', dashed: true },
    { from: 'exec', to: 'result' },
  ],
  steps: [
    { focus: ['text', 'text>parse', 'parse'], caption: '**Parse** текстийг abstract syntax tree болгоно. Хаалт дутсан бол энд унана.' },
    { focus: ['parse>syntax', 'syntax'], caption: 'Syntax error шууд буцна: зөвхөн `errors`, `data` байхгүй. Чиний код огт ажиллахгүй.' },
    { focus: ['parse>validate', 'validate'], caption: '**Validate** AST-г schema-тай тулгана: эдгээр field эдгээр type дээр байдаг уу? Argument, variable зөв type-тай юу? Тэр enum утга бодитоор байдаг уу?' },
    { focus: ['validate>invalid', 'invalid'], caption: 'Validation error ч execution-ээс өмнө буцна. Query доторх үсгийн алдаа тэр дороо, аюулгүйгээр баригддаг нь үүнээс.' },
    { focus: ['validate>exec', 'exec', 'exec>result', 'result'], caption: '**Execute** query tree-г даган алхаж, field бүрт **resolver** дууддаг. Чиний код зөвхөн энэ шатанд ажиллана, хэсэгчилсэн өгөгдөл гарч чадах нь ч зөвхөн энэ шат.' },
  ],
}
```

## Resolver-ууд: field бүрт нэг function

Resolver бол **нэг field**-ийн утгыг гаргадаг function. Schema дахь field бүр resolver-тэй: заримыг нь чи бичнэ, үлдсэнд нь GraphQL default өгнө.

```ts
const resolvers = {
  Query: {
    project: (parent, args, context) => Project.findOne({ key: args.key }).exec(),
  },
  Project: {
    issues: (project, args) => Issue.find({ project: project._id }).limit(args.limit).exec(),
  },
  Issue: {
    assignee: (issue) => (issue.assignee ? User.findById(issue.assignee).exec() : null),
  },
};
```

Resolver дөрвөн argument авна: `(parent, args, context, info)`. **parent** нь дээд field-ийн утга, **args** нь энэ field-ийн argument-ууд, **context** нь request бүрт тусдаа үүсэх object, `info` нь AST ба path (ховор хэрэгтэй). Тус бүрийг Module 7-д нарийвчлан үзнэ.

### Execution бол tree-г даган алхах явц

1-р хичээлийн query энэ. Алхам алхмаар үз: аль resolver хэзээ ажиллаж, тус бүрт нь `parent` болж юу орж ирж байгааг ажигла:

```viz-tree
{
  title: 'query { project(key: "TF") { name issues(limit: 2) { title assignee { name } } } }',
  root: {
    id: 'q', label: 'Query', color: 'neutral',
    children: [
      { id: 'p', label: 'project(key: "TF")', children: [
        { id: 'pn', label: 'name' },
        { id: 'pi', label: 'issues(limit: 2)', children: [
          { id: 'i0', label: '[0]', color: 'neutral', children: [
            { id: 'i0t', label: 'title' },
            { id: 'i0a', label: 'assignee', children: [ { id: 'i0an', label: 'name' } ] },
          ]},
          { id: 'i1', label: '[1]', color: 'neutral', children: [
            { id: 'i1t', label: 'title' },
            { id: 'i1a', label: 'assignee', children: [ { id: 'i1an', label: 'name' } ] },
          ]},
        ]},
      ]},
    ],
  },
  steps: [
    { focus: ['q'], caption: 'Execution root type-аас эхэлнэ. Root-ын `parent` ихэвчлэн зүгээр л `undefined` (эсвэл чиний тохируулсан `rootValue`).' },
    { focus: ['p'], caption: '`Query.project` `args = { key: "TF" }`-тэй ажиллана. Project document буцаана, **тэр object нь доор сонгогдсон field бүрийн `parent` болно**.', reveal: { p: 'Project{ _id, name, … }' } },
    { focus: ['pn', 'pi'], caption: 'Ижил түвшний field-үүд **зэрэг** resolve хийгдэнэ. `name`-д custom resolver байхгүй тул **default resolver** `parent.name`-ийг буцаана. `issues` бол custom, MongoDB-г query хийнэ.', reveal: { pn: '"Taskforge"', pi: '[Issue, Issue]' } },
    { focus: ['i0', 'i1'], caption: 'List field: execution **item бүрийн хувьд** үргэлжилж, тэр item нь `parent` болно.' },
    { focus: ['i0t', 'i1t', 'i0a', 'i1a'], caption: '`title` дахин default resolver. `assignee` бол custom, **issue бүрт нэг удаа** ажиллана. Assignee-тай issue бүрт нэг `User.findById` дуудлага, тийм зуун issue бол зуу. Энэ хэлбэрийг санаж яв: Module 4-ийн N+1 асуудал яг энэ, Module 9 үүнийг засна.', reveal: { i0t: '"Keyboard shortcuts"', i1t: '"Export to CSV"', i0a: 'User{ name: "Grace…" }', i1a: 'null' } },
    { focus: ['i0an', 'i1an'], caption: '`null`-ын доор юу ч ажиллахгүй: `issue[1].assignee` нь null тул түүний `name` хэзээ ч resolve хийгдэхгүй. Response-д зүгээр л `"assignee": null` гарна.', reveal: { i0an: '"Grace Hopper"' } },
  ],
}
```

### Default resolver

Field-д resolver бичээгүй үед GraphQL үүнийг хэрэглэнэ (хялбарчилсан):

```ts
function defaultResolver(parent, args, context, info) {
  const value = parent[info.fieldName];
  return typeof value === 'function' ? value.call(parent, args, context, info) : value;
}
```

Ихэнх field өөрөө ажилладаг нь үүнээс: `Query.project`-оос Mongoose document буцаавал `name`, `key`, `description` бүгд түүний property-гээс resolve хийгдэнэ. Resolver зөвхөн **ажил** шаардсан field-д бичнэ: query, тооцоолол, өөр нэрээр буцаах, эсвэл permission шалгах.

*Зарим* field учир битүүлэг `null` ирдэг нь ч үүнтэй холбоотой: object дээрх property-ийн нэр field-ийн нэртэй таардаггүй (`_id` ба `id`, user-ийн оронд ObjectId агуулсан `assignee`…). Field буруу гарвал эхний асуулт: **"Энд parent нь ямар object, тэнд яг ямар property байна?"**

### Дарааллын баталгаа

- Ижил түвшний **Query** field-үүд зэрэгцээ resolve хийгдэж болно. Дарааллад бүү найд.
- **Mutation**-ий root field-үүд бичсэн дарааллаараа **нэг нэгээр** ажиллана. `mutation { a: createIssue(…) b: createIssue(…) }` дээр `a` эхэлж үүснэ. (Mutation-ий үр дүн доторх field-үүд query шиг resolve хийгдэнэ.)

## Error ба null propagation

Resolver throw хийхэд GraphQL бүх request-ийг унагадаггүй. Error-ыг (field хүртэлх **path**-тай нь) бүртгээд, утга байх байсан газарт `null` тавьдаг:

```json
{
  "data": { "project": { "name": "Taskforge", "stats": null } },
  "errors": [{ "message": "Stats service timed out", "path": ["project", "stats"] }]
}
```

Хуудасны үлдсэн хэсэг ердийнхөөрөө render хийгдэж чадна. Гэхдээ нэг нюанс бий: **тэр field non-null байсан бол яах вэ?** Түүнд `null` тавьж болохгүй. Тиймээс null **дээш гарч**, хамгийн ойрын nullable parent хүртэл очно:

```viz-tree
{
  title: 'Issue.reporter нь User!, resolver нь throw хийв',
  root: {
    id: 'q', label: 'Query', color: 'neutral',
    children: [
      { id: 'p', label: 'project: Project   (nullable)', children: [
        { id: 'pn', label: 'name: String!' },
        { id: 'pi', label: 'issues: [Issue!]!', children: [
          { id: 'i0', label: '[0]: Issue!', color: 'neutral', children: [
            { id: 'i0t', label: 'title: String!' },
            { id: 'i0r', label: 'reporter: User!' },
          ]},
        ]},
      ]},
    ],
  },
  steps: [
    { focus: ['i0r'], caption: '`reporter` throw хийнэ. Энэ нь `User!`, өөрөөр хэлбэл non-null тул өөрөө null болж **чадахгүй**.', reveal: { i0r: '!throws', i0t: '"Login page"', pn: '"Taskforge"' } },
    { focus: ['i0'], caption: 'Null parent руу, `[0]` issue рүү дээшилнэ. Гэтэл list-ийн item `Issue!` буюу тэр ч бас non-null.', reveal: { i0: '!null' } },
    { focus: ['pi'], caption: 'Дахин дээш: `issues` нь `[Issue!]!`, мөн non-null.', reveal: { pi: '!null' } },
    { focus: ['p'], caption: '`project` nullable тул дээш гарах явц энд зогсоно. **Project бүхлээрээ `null` болно**: нэр нь ч, issue бүр ч, учир нь нэг reporter хайлт унасан. `!`-г хэт амархан тавьсны төлбөр энэ.', reveal: { p: '!null' } },
  ],
}
```

Nullability дизайны шийдвэр болдгийн жинхэнэ шалтгаан энэ. Non-null field client-д маш тохиромжтой (null шалгах хэрэггүй), гэвч `!` бүр алдааны **эвдрэлийн хүрээ**-г томсгоно. `data` өөрөө null болох байсан бол response-д `"data": null` ба зөвхөн error үлдэнэ.

```quiz
Q: `Query.book`-ийн resolver Mongoose document буцаадаг. Query `title`, `year`-ийг сонгосон, `Book.title` / `Book.year` resolver байхгүй. Эдгээр утга хаанаас ирэх вэ?
- [ ] GraphQL field бүрт номыг дахин ачаалдаг
- [x] Default resolver document-аас `parent.title`, `parent.year`-ийг уншдаг
- [ ] Тодорхой resolver байхгүй бол null ирнэ
> Default resolver `parent[fieldName]`-ийг буцаадаг. Ихэнх field-д resolver огт хэрэггүй.
```

```quiz
Q: `Query.project` nullable. Түүний гүнд байгаа non-null field-ийн resolver throw хийж, хоёрын хооронд байгаа field бүр non-null. Client `project`-д юу авах вэ?
- [ ] Тэр ганц field дутуу project
- [x] `null`, мөн `errors`-т унасан field хүртэлх path-тай нэг бичилт
- [ ] HTTP 500
> Null non-null field-үүдээр дамжин, nullable-д хүрэх хүртлээ дээш гарна. Response-ийн бусад хэсэгт хэсэгчилсэн өгөгдөл буцсаар байна.
```
