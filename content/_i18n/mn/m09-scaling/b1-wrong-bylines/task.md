---
title: "Bug hunt: буруу byline-ууд"
summary: Хэн нэгэн DataLoader нэмсэн, одоо article-ууд буруу зохиолчийг зааж байна. Batching-ээ хэвээр үлдээгээд contract-ыг зас.
source: b50d62be4f959cce8ae500c4f2239a7605ffa6453a0931912f435306ec644400
---

Редакцийн нэг API-д сонгодог N+1 асуудал байсан. Гадны contractor DataLoader нэмж, query-ийн тоо буурч, бүгд баярлаж, contractor дараагийн ажил руугаа явсан. Тэгтэл засвар хүсэлтүүд орж ирэв:

> **TICKET-6310 — "Яагаад миний нэр тэнд байгаа юм?"** (priority: high)
>
> 1. Article-ууд жинхэнэ зохиолчийг үзүүлж байгаа ч **буруу нэгийг**. Санамсаргүй харагдах ч refresh бүрд ижил буруу нэр гарна.
> 2. Нэг freelancer-ийн account-ыг устгасан, тэгтэл хуудас дээрх **бүх** зохиолч error болов.
> 3. Comment-гүй шинэ article нийтлэгдэнгүүт жагсаалт ачаалагдахаа болино.
> 4. Ops: жагсаалт хэрэгтэй хэмжээнээсээ удаан хэвээр. Article-ийн тоогоор өсөхөө больсон ч редакторууд reviewer нэмэх тусам өссөөр байна.

Өмнөх хичээл batch function юу буцаахыг яагаад ийм хатуу шаардсан бэ гэвэл яг ийм bug-уудаас болж. Batch function чинь DataLoader-д амлалт өгдөг, DataLoader тэр амлалтад итгэдэг.

Playground-ийг ажиллуул. Энэ нь byline-ууд, error-ууд болон query-ийн тоог хэвлэнэ.

## Даалгавар

DataLoader-ийг бүү ав, мөн response-ийн хэлбэрийг бүү өөрчил.

1. Article бүр өөрийн зохиолчийг харуулна.
2. Байхгүй болсон зохиолч зөвхөн тухайн article дээр `author: null` болж гарч, `reviewers`-аас хасагдана. Бусад article-д нөлөөлөхгүй.
3. Comment-гүй article-д `commentCount: 0`.
4. `{ articles { title author { name } reviewers { name } commentCount } }` нь article, reviewer хичнээн байсан ч **3 query**-гээр ажиллана. Reviewer-ууд article дээр хадгалагдсан дарааллаараа байна.

## Hints

### Шинж тэмдэг 1-ээс 3 нь нэг bug
Contract-ыг бичиж ав: `[a, b, c]` key-үүдэд batch function юу буцаах вэ? Одоо `find` болон `$group` чамд яг юу өгдгийг хар. Ямар дараалалтай? Key-д юу ч таарахгүй бол хэдэн мөр?

### Шинж тэмдэг 4
Batching зөвхөн `load` дуудлагууд хамт хийгдэх үед ажиллана. Reviewer-ийн resolver-ийг удаан унш: нэг `load`, дараагийнх хоёрын хооронд юу болдог вэ?

### Зөв болгох
Мөрүүдийг id-аар key хийсэн `Map` болго, дараа нь үр дүнг мөрөөр биш, **key**-үүдээр алхаж бүтээ. Reviewer-ийн хувьд `loadMany` бүгдийг нэг дор асууна. Байхгүй зохиолчид `null` өгдөг, харин schema-д `[Author!]!` гэж байгаа.

### Дөрвөн шинж тэмдэг бүгд
`authorById`: `const byId = new Map(rows.map((a) => [String(a._id), a])); return ids.map((id) => byId.get(id) ?? null);`. `commentCountByArticle` ижил хэлбэртэй, `?? 0`-тэй. `Article.reviewers` бүх id-тай `loadMany` дуудаад, хоосон утгуудыг нь filter хийж хаяна.
