---
title: "Warm-up: backlog-ийг бүлэглэх"
summary: Run, Submit болон test panel-тай танилцаж дасах.
source: fba88d4ad53cbb7bc5282755c62dab04b6e4de438e16d661d9691cdbdf9f55eb
---

Workbench-ийг мэдрэхэд зориулсан богино даалгавар. Одоохондоо database байхгүй, зөвхөн өгөгдлийг хэлбэржүүлнэ. Resolver дээр чи үүнийг байнга хийх болно.

Яг ийм төрлийн зүйл. Номыг жанраар нь бүлэглэе:

```ts
function groupByGenre(books: Book[]) {
  const groups: Record<string, Book[]> = {};
  for (const book of books) {
    (groups[book.genre] ??= []).push(book);
  }
  return groups;
}
```

## Даалгавар

`board.ts`-д `toBoard(issues)`-ийг хэрэгжүүл. Энэ function issue-уудын хавтгай жагсаалтыг Taskforge-ийн kanban board-д гарах шиг **board-ийн багана** болгон хуваана.

```ts
type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
```

Шаардлага:

1. **Яг** дөрвөн status key-тэй object буцаа, **board-ийн дарааллаар**: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`.
2. **Багана бүр** бий, хоосон байсан ч (`[]`). Дээрх жишээ хоосон жанрыг алгасна, харин board тэгж чадахгүй.
3. Багана бүр доторх issue-ууд **priority-оор sort хийгдсэн**, хамгийн яаралтай нь эхэнд (`URGENT` → `HIGH` → `MEDIUM` → `LOW`).
4. Ижил priority-тай issue-ууд **анхны харьцангуй дарааллаа** хадгална.
5. Оролтын array-г бүү өөрчил.

Эхлээд playground дээр туршаад үз (**Run**, эсвэл Ctrl+Enter), дараа нь **Submit** (Ctrl+Shift+Enter) дар.

## Hints

### Хоосон board-оосоо эхэл
Үр дүнгийн object-оо *эхлээд* бүтээ: дөрвөн key-г нь дарааллаар нь хоосон array-тай холбож өг. Дараа нь issue-уудаар loop хийж, тус бүрийг өөрийнх нь багана руу push хий. JavaScript-д string key-ийн дараалал нэмсэн дарааллаараа хадгалагддаг.

### Enum-оор sort хийх
`'HIGH'` шиг string-ээр sort хийвэл утга учиртай дараалал гарахгүй. Priority бүрт тоо өг, жишээ нь `{ URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }` гэсэн lookup object ашиглаад, тэр тоогоор sort хий.

### Тогтвортой sort ба mutation
Орчин үеийн JavaScript-д `Array.prototype.sort` тогтвортой тул ижил priority-тай issue-ууд анхны дарааллаа өөрөө хадгална. Гэхдээ энэ нь array-г **орон дээр нь** sort хийдэг. Өөрийн бүтээсэн багана бүрийн array-г sort хий, эдгээр нь шинэ array тул асуудалгүй. `issues`-ийг хэзээ ч бүү sort хий.
