---
title: "Drill: Operation-ууд бичих"
summary: Variable, nested selection, alias, fragment ба mutation, бүгдийг жинхэнэ schema-д бичнэ.
source: 6363001f65a73d3ccdc4649bfa8adbc58c71fa85473d1f672e19bef6cb6991e7
---

Server бичихээс өмнө түүнтэй *ярьж* чөлөөтэй болъё. `api/schema.ts` дотор жижиг **Mission Control** API байдаг (in-memory, аль хэдийн бичигдсэн). Файлын дээд хэсэгт байгаа SDL-ийг унш. Schema-г уншиж, юуг асууж болохоо тодруулах нь өдөр бүр хэрэглэх ур чадвар.

## Даалгавар

`operations.ts`-д таван GraphQL operation-ийг string хэлбэрээр бич. Operation бүрийг доор заасан нэрээр яг **нэрлэ**, өөрчлөгдөх утга бүрт **variable** хэрэглэ (id, status-ыг hard-code хийхгүй), мөн асуусан field-үүдийг **яг** сонго: тест response-ийг `toEqual`-аар харьцуулдаг тул илүү field байвал ч унана.

1. **`MISSIONS_BY_STATUS`** — `MissionsByStatus` query, **заавал байх** `$status` variable-тай. Тэр status-тай `missions`-ийг буцаана; `name`, `launchYear`-ийг сонго.

2. **`MISSION_DETAIL`** — `MissionDetail($id)` query: нэг mission-ийн `name` ба `status`, түүний `rocket`-ийн `name` ба `reusable`, мөн `crew`-ийн `name` ба `role`.

3. **`COMPARE_MISSIONS`** — `CompareMissions` query, `$a` ба `$b` гэсэн id variable хоёртой. Хоёр mission-ийг нэг request-ээр татаж, response key-үүд нь **`first`** ба **`second`** байна. Тус бүрээс `name`, `launchYear`-ийг сонго.

4. **`MISSION_CREW`** — `MissionCrew($id)` query: mission-ийн `name`, `commander` ба `crew`. Commander, crew-ийн гишүүн хоёуланд `name`, `role`, `nationality`-г сонго. Үүнийг хоёр газарт хэрэглэх **`CrewMember` нэртэй нэг fragment**-ээр хий.

5. **`ADD_ASTRONAUT`** — `AddAstronaut` mutation, нэг `$input` variable авна (input type-ыг schema-аас хар). Шинэ astronaut-ийн `id`, `name`, `role`-ийг буцаа.

Operation-уудаа туршихын тулд **Run** дар. Playground эдгээрийг API-д ажиллуулж, үр дүнг хэвлэнэ.

## Hints

### Variable-ийн type-уудыг олох
Variable-ийн type нь argument-ийн type-тай таарах ёстой, `!`-г оруулаад. `missions(status: MissionStatus)` nullable status авдаг, харин даалгавар **заавал байх** variable шаардаж байна. `MissionStatus!` variable-ийг nullable argument руу дамжуулж болно. `mission(id: ID!)`-д variable нь `ID!` байна.

### Нэг field хоёр удаа
Alias-гүй бол `mission(id: $a)` ба `mission(id: $b)` хоёулаа `mission` гэсэн response key-г шаардаж, зөрчилдөнө. `first: mission(id: $a) { … }` нь нэрийг нь солино.

### Fragment-үүд
`fragment CrewMember on Astronaut { name role nationality }`-г query-тэй ижил string-д, түүний дараа бич. `Astronaut` сонгосон газар бүрт `...CrewMember` гэж spread хий.
