---
title: "Bug hunt: хоосон roster"
summary: Support ticket, жижиг codebase, мөн алдаа throw хийдэггүй гурван bug.
source: be6ddaa3baa9f65fccb6d000e1d05fecc049badc91bdf0e2d68a032e791c428c
---

Чи спортын лигийн app ажиллуулдаг багт дөнгөж орлоо. Эхний ticket чинь:

> **TICKET-4512 — Team page эвдэрсэн** (priority: high)
>
> Өнгөрсөн sprint-ийн "roster" refactor-оос хойш:
> 1. Team-ийн хуудас бүр, тоглогчтой нь лавтай багууд дээр ч **"No players yet"** гэж харуулж байна.
> 2. QA тест хийхээр тоглогчдыг гараар нэмсэн: жагсаалт DB-д гарсан ч **captain badge** хэнд ч харагдахгүй байна.
> 3. Frontend-ийн хэлснээр roster response-д team-ийн **id алга**, тиймээс "edit team" холбоос `/teams/undefined` руу очиж байна.
>
> Log дээр алдаа алга.

"Log дээр алдаа алга" гэдэг нь хамгийн чухал хэсэг. Code review-ээс мултарч, production хүртэл хүрдэг bug-ууд яг ийм байдаг: бүх зүйл *ажиллаж* байгаа ч буруу.

## Даалгавар

`services/roster.ts` дахь `getRoster(teamId)` доорх зүйлийг буцаахаар bug-уудыг ол, засаарай:

```ts
{
  id: '66f1…',            // the team id as a string
  name: 'Harbor Hawks',
  players: [              // sorted by shirt number
    { id: '66f2…', name: 'Ines', number: 4, isCaptain: false },
    { id: '66f3…', name: 'Theo', number: 7, isCaptain: true },
  ],
}
```

…эсвэл team олдохгүй бол `null`. Файлуудыг шинээр бүү бич. Юу буруу байгааг олоод, зөв байх хамгийн жижиг засварыг хий. Жинхэнэ codebase дээр ингэж ажилладаг, учир нь дахин бичвэл хэн нэгэн хянах ёстой том diff гарна.

Playground ашигла. Debug хийх сайн зуршил бол таамаглахаасаа өмнө алхам бүрт түүхий өгөгдлөө **log хийх** (query-н дараахан `console.log(team)`).

## Hints

### Шинж тэмдэг 1: тоглогч алга
Тоглогчид `player.team`-ийг хадгалдаг. Team өөрийн тоглогчдыг virtual populate-аар авдаг. Virtual-ийн тодорхойлолтыг өгүүлбэр болгон чангаар унш: "players бол ___ нь миний ___-тэй тэнцүү Player-ууд". Утга гарч байна уу?

### Шинж тэмдэг 2: captain badge алга
"Энэ тоглогч captain мөн үү" гэдгийг яаж шийдэж байна вэ? Харьцуулж буй хоёр утгын *төрөл* юу вэ, `===` хоёр object дээр юу хийдэг вэ?

### Шинж тэмдэг 3: id алга
Query `.lean()`-ээр төгсдөг. Lean object Mongoose document-тэй харьцуулахад юутай, юугүй вэ? Хоёр засвар аль аль нь ажиллана: lean-ийг хэрэглэхээ болих, эсвэл id-г lean object-д *байдаг* зүйлээс бүтээх.
