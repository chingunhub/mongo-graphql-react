import type { Language } from '../../../shared/languages';

const en = {
  'stage.label': 'Stage {number}: {name}',
  'stage.1': 'Backend',
  'stage.2': 'Full stack',
  'stage.3': 'Real systems',
  'stage.card': 'Stage {number} · {goal}',
  'stage.1.goal': 'The goal',
  'stage.1.intro':
    'MongoDB, Mongoose and a GraphQL API with auth, built up one layer at a time. This is the core of the course, and you can finish here with a complete backend.',
  'stage.2.goal': 'Stretch',
  'stage.2.intro':
    'You write real React here: hooks, the Apollo cache and forms. It asks for more than a React introduction, so expect to look things up. Take it when you have the time.',
  'stage.3.goal': 'When you need it',
  'stage.3.intro':
    'A second project on the problems big repos have: tenants, federation, queues and failure. It is hard on purpose and no one needs all of it. Take the modules you need, when you need them.',
  'home.taskforge': 'Taskforge · foundations',
  'home.relaydesk': 'Relaydesk · connected systems',
  'home.heroLead': 'From junior to',
  'home.heroQuote': '“I can find my way around this codebase.”',
  'home.heroTail': '',
  'home.intro':
    'Mongoose, GraphQL with Apollo Server, and Apollo Client with React — taught visually, practiced in a real sandbox, and assembled into one project you build from the database up:',
  'home.introEnd': ', a mini issue tracker.',
  'home.start': 'Start the course: {title} →',
  'home.continue': 'Continue: {title} →',
  'home.back': 'Back to: {title}',
  'home.stages': 'Three stages',
  'home.stagesNote': 'Each one ends somewhere real, so stopping after any of them counts as finishing.',
  'home.finished': '✓ Finished',
  'home.done': '{done}/{total} done',
  'home.build': "What you'll build",
  'home.buildNote': 'Every ⚒ forge step adds a real piece to your Taskforge codebase. Built pieces light up here.',
  'home.openProject': 'Open the project: browse its files, see what is left, and run what you have built →',
  'home.afterTitle': 'After Taskforge: Relaydesk',
  'home.afterBody':
    'Build and debug connected systems in modules 14–23. Explore the architecture map, every project file, the build path and a separate reference demo.',
  'home.stack': 'The whole stack, in one request',
  'home.stackNote': 'Step through it. Every module in this course zooms into one of these layers.',
  'home.modules': 'Modules',
  'forge.passwords': 'password hooks',
  'forge.dueDates': 'due dates, every layer',
  'stack.title': 'One request, every layer',
  'stack.bson': 'collections of BSON documents',
  'stack.1':
    'A component declares **what data it needs** as a GraphQL query. It doesn\'t know about URLs, databases or REST endpoints.',
  'stack.2':
    'Apollo Client checks its **normalized cache** first. Nothing there yet, so it sends the operation over the network.',
  'stack.3':
    'One endpoint, one POST. The body is just JSON: the query text plus variables.',
  'stack.4':
    'Apollo Server **parses** the text into an AST, **validates** it against the schema (does `project` exist? is `$key` a `String!`?), then **executes** it.',
  'stack.5':
    'Execution walks the query tree and calls a **resolver function** for each field. `Query.project` gets `args = { key: "TF" }` and a per-request `context`.',
  'stack.6':
    'The resolver uses a **Mongoose model**. Mongoose casts your filter to the schema\'s types and builds a MongoDB command.',
  'stack.7':
    'MongoDB runs the query (hopefully using an index) and returns BSON documents.',
  'stack.8':
    'Mongoose wraps the raw document in a **Document** instance: getters, virtuals like `id`, methods, change tracking.',
  'stack.9':
    'The resolver returns that object. Child fields (`name`, `issues`) get resolved next — `issues` triggers another resolver and another query.',
  'stack.10':
    'Apollo Server assembles a result **shaped exactly like the query** and serializes it to JSON.',
  'stack.11':
    'Apollo Client **normalizes** the response into the cache: `Project:66f…a1` stored once, referenced everywhere.',
  'stack.12':
    '`loading` flips to false, `data` arrives, React re-renders. Any other component watching `Project:66f…a1` updates too.',
  'review.label': 'Warm-up',
  'review.title': 'Before you carry on',
  'review.welcome': "Welcome back. It's been {days} days.",
  'review.one': 'One quick thing',
  'review.many': '{word} quick things',
  'review.intro': "{count} from what you've already learned, about {minutes} minutes.",
  'review.why': 'Remembering it now is what makes it stick.',
  'review.whyBack': 'They bring it back faster than rereading, and then you pick up where you stopped.',
  'review.start': 'Start',
  'review.notToday': 'Not today',
  'review.progress': 'Warm-up · {index} of {total}',
  'review.reread': 'Worth a reread:',
  'review.rereadEnd': '. It comes back in a few days.',
  'review.drillTitle': 'Could you still do this one from a blank file?',
  'review.drillBody':
    'Open it, press Reset file on what you wrote, and try it without looking. Your pass stays whatever happens.',
  'review.openDrill': 'Open the drill',
  'review.done': 'Done',
  'review.next': 'Next',
  'review.skip': 'Skip this one',
  'lesson.crumb': 'Module {number} · {title}',
  'lesson.meta': 'Lesson · about {minutes} min',
  'lesson.completed': ' · ✓ completed',
  'lesson.next': 'Got it — next: {title} →',
  'lesson.finish': 'Mark complete ✓',
  'quiz.check': 'Quick check ·',
  'quiz.right': 'Yes. ',
  'quiz.wrong': 'Not quite. ',
  'quiz.retry': 'Retry',
  'callout.NOTE': 'Note',
  'callout.TIP': 'Tip',
  'callout.IMPORTANT': 'Important',
  'callout.WARNING': 'Gotcha',
  'callout.CAUTION': 'Careful',
  'callout.BRIDGE': "You've seen this before",
  'progress.export': 'Export my progress',
  'progress.exportNote':
    'Saves a small file with what you finished, dates and attempts. Your code stays out of it, nothing is sent anywhere, and sharing it is your choice.',
  'mentor.title': 'Mentor',
  'mentor.button': 'Mentor',
  'mentor.buttonTitle': 'Chat with the AI mentor about the open item',
  'mentor.close': 'Close',
  'mentor.settings': 'Mentor settings',
  'mentor.newChat': 'New conversation',
  'mentor.model': 'Model',
  'mentor.addKeyOption': 'Add {name} key…',
  'mentor.keyAdded': ' (key added)',
  'mentor.provider': 'Provider',
  'mentor.keyIntro':
    'Paste an {name} API key from {page}. It goes only to {name}, and each message costs a little on your {name} account.',
  'mentor.keyLabel': '{name} API key',
  'mentor.remember': 'Remember on this computer',
  'mentor.rememberOn': 'Saved in {where}. Forget in the mentor settings removes it.',
  'mentor.rememberOff': 'Off: the key is gone when Forge Academy stops.',
  'mentor.checking': 'Checking…',
  'mentor.useKey': 'Use this key',
  'mentor.cancel': 'Cancel',
  'mentor.unreachable': "Can't reach the mentor.",
  'mentor.openItem': 'Open a lesson or exercise to chat about it.',
  'mentor.askLesson': 'Ask about this lesson, or start with one of these:',
  'mentor.askTask': 'Ask about this exercise, or start with one of these:',
  'mentor.projectNote': 'One conversation covers every step of this project, so the mentor remembers the earlier steps.',
  'mentor.starter.task1': 'Why are my tests failing?',
  'mentor.starter.task2': 'What should I do next?',
  'mentor.starter.task3': 'Explain the idea behind this exercise',
  'mentor.starter.lesson1': 'Explain the main idea simply',
  'mentor.starter.lesson2': 'Quiz me on this lesson',
  'mentor.starter.lesson3': 'Give me another example',
  'mentor.thinking': 'Thinking',
  'mentor.working': 'Working… {s}s',
  'mentor.costUnknown': 'cost unknown',
  'mentor.thisChat': 'This conversation: {cost}',
  'mentor.plusUnknown': ' + unknown',
  'mentor.placeholder': 'Message the mentor (Enter sends, Shift+Enter for a new line)',
  'mentor.effort': 'Reasoning effort',
  'mentor.effort.none': 'none: answers at once, no reasoning. Cheapest.',
  'mentor.effort.low': 'low: a little reasoning. Fast.',
  'mentor.effort.medium': 'medium: the default. A good balance.',
  'mentor.effort.high': 'high: thinks longer. Slower, costs more.',
  'mentor.effort.xhigh': 'xhigh: for hard debugging. Slow.',
  'mentor.effort.max': 'max: the most reasoning. Slowest and most expensive.',
  'mentor.stop': 'Stop',
  'mentor.send': 'Send',
  'mentor.stopped': 'Stopped.',
  'mentor.switchModel': 'Another model starts a new conversation here. Switch?',
  'mentor.movedTo': 'Now on: {title}',
  'mentor.labelModule': 'Module {n} · {title}',
  'mentor.labelStep': '{project} step {n} · {title}',
  'mentor.set.back': 'Back to the chat',
  'mentor.set.keys': 'API keys',
  'mentor.set.noKey': 'No key added.',
  'mentor.set.keySession': 'Added. Kept until Forge Academy stops.',
  'mentor.set.keyRemembered': 'Remembered in {where}.',
  'mentor.set.add': 'Add key',
  'mentor.set.replace': 'Replace',
  'mentor.set.forget': 'Forget',
  'mentor.set.sentTitle': 'What goes to the provider',
  'mentor.set.sent':
    'The open lesson or exercise, your code and test results for it, other lessons the mentor looks up, where you stand in the module, and the conversation itself. Nothing else leaves this computer.',
  'mentor.set.spendTitle': 'Spending',
  'mentor.set.spend': '{cost} across {n} replies since Forge Academy started.',
  'mentor.set.spendUnknown':
    'Some replies were stopped or used a model without a known price, so the real total is higher.',
  'mentor.set.spendNote': "Your provider's dashboard has the exact amount.",
  'mentor.set.convTitle': 'Conversations',
  'mentor.set.convNote':
    'Saved on this computer, in the Forge Academy data folder. They stay apart from your progress and never go into the progress export.',
  'mentor.set.deleteAll': 'Delete all conversations',
  'mentor.set.deleteConfirm': "Delete every saved mentor conversation? This can't be undone.",
  'mentor.set.deleted': 'All conversations deleted.',
};

export type StringKey = keyof typeof en;

/** Anything missing here shows in English, the same way an untranslated page does. */
const mn: Partial<Record<StringKey, string>> = {
  'stage.label': '{number}-р шат: {name}',
  'stage.card': '{number}-р шат · {goal}',
  'stage.1.goal': 'Гол зорилго',
  'stage.1.intro':
    'MongoDB, Mongoose болон auth-тай GraphQL API-г давхарга давхаргаар нь бүтээнэ. Курсын цөм нь энэ. Энд зогссон ч ажилладаг бүтэн backend чамд үлдэнэ.',
  'stage.2.goal': 'Нэмэлт',
  'stage.2.intro':
    'Энд жинхэнэ React бичнэ: hook, Apollo cache, form. Оршил хичээлээс илүү мэдлэг хэрэгтэй тул заримыг нь өөрөө хайж үзэхэд хүрнэ. Цаг гарвал үз.',
  'stage.3': 'Бодит системүүд',
  'stage.3.goal': 'Хэрэг болоход',
  'stage.3.intro':
    'Том repo-д тохиолддог асуудлууд дээр хийх хоёр дахь төсөл: tenant, federation, queue, эвдрэл. Зориудаар хэцүү, бүгдийг нь хийх шаардлагагүй. Хэрэгтэй module-ээ хэрэг болох үед нь л үз.',
  'home.taskforge': 'Taskforge · суурь',
  'home.relaydesk': 'Relaydesk · холбогдсон системүүд',
  'home.heroLead': 'Junior-оос',
  'home.heroQuote': '“Энэ codebase-д би төөрөхгүй”',
  'home.heroTail': 'гэдэг түвшин хүртэл',
  'home.intro':
    'Mongoose, Apollo Server-тэй GraphQL, React дээрх Apollo Client-ийг зургаар тайлбарлаж, жинхэнэ sandbox-д дадлага хийлгээд, database-ээс нь эхлэн бүтээх нэг төсөл болгон холбоно:',
  'home.introEnd': ', жижиг issue tracker.',
  'home.start': 'Курсаа эхлэх: {title} →',
  'home.continue': 'Үргэлжлүүлэх: {title} →',
  'home.back': 'Буцах: {title}',
  'home.stages': 'Гурван шат',
  'home.stagesNote':
    'Шат бүрийн төгсгөлд бодит зүйл бүтсэн байна. Аль ч шатны дараа зогссон курсээ дуусгасан гэж тооц.',
  'home.finished': '✓ Дууссан',
  'home.done': '{done}/{total} дууссан',
  'home.build': 'Юу бүтээх вэ',
  'home.buildNote':
    '⚒ forge step бүр Taskforge codebase-д чинь жинхэнэ нэг хэсэг нэмдэг. Бүтээсэн хэсгүүд чинь энд гэрэлтэнэ.',
  'home.openProject':
    'Төслийг нээх: файлуудыг нь үзэж, юу үлдсэнийг харж, бүтээснээ ажиллуулах →',
  'home.afterTitle': 'Taskforge-ийн дараа: Relaydesk',
  'home.afterBody':
    'Module 14–23-д холбогдсон системүүдийг бүтээж, debug хийнэ. Архитектурын зураг, төслийн файл бүр, build path, тусдаа reference demo-г судлаарай.',
  'home.stack': 'Бүх stack, нэг request-ээр',
  'home.stackNote':
    'Алхам алхмаар үз. Курсын module бүр эдгээр layer-ийн аль нэгийг нарийвчлан үздэг.',
  'home.modules': 'Module-ууд',
  'forge.passwords': 'password hook-ууд',
  'forge.dueDates': 'due date, бүх layer-д',
  'stack.title': 'Нэг request, бүх layer',
  'stack.bson': 'BSON document-уудын collection',
  'stack.1':
    'Component өөрт **ямар өгөгдөл хэрэгтэйгээ** GraphQL query-гээр зарлана. URL, database, REST endpoint-ийн талаар юу ч мэдэхгүй.',
  'stack.2':
    'Apollo Client эхлээд **normalized cache**-ээ шалгана. Одоохондоо хоосон тул operation-ийг network-ээр явуулна.',
  'stack.3':
    'Нэг endpoint, нэг POST. Body нь зүгээр л JSON: query-ийн текст, variable-ууд.',
  'stack.4':
    'Apollo Server текстийг AST болгон **parse** хийж, schema-тай тулган (`project` байдаг уу? `$key` нь `String!` мөн үү?) **validate** хийгээд, дараа нь **execute** хийнэ.',
  'stack.5':
    'Execution нь query tree-ээр явж, field бүрийн **resolver function**-ыг дууддаг. `Query.project` нь `args = { key: "TF" }` болон request бүрт шинээр үүсдэг `context`-ыг авна.',
  'stack.6':
    'Resolver **Mongoose model** ашиглана. Mongoose чиний filter-ийг schema-д заасан төрлүүд рүү cast хийгээд, MongoDB command үүсгэдэг.',
  'stack.7':
    'MongoDB query-г ажиллуулаад (index ашиглана гэж найдъя) BSON document-уудыг буцаана.',
  'stack.8':
    'Mongoose түүхий document-ийг **Document** instance-д ороодог: getter-үүд, `id` шиг virtual-ууд, method-ууд, change tracking.',
  'stack.9':
    'Resolver тэр object-ыг буцаана. Дараа нь child field-үүд (`name`, `issues`) resolve болдог, `issues` бол бас нэг resolver, бас нэг query гэсэн үг.',
  'stack.10':
    'Apollo Server **query-тэй яг ижил хэлбэртэй** үр дүн угсарч, JSON болгон serialize хийнэ.',
  'stack.11':
    'Apollo Client response-ийг cache руу **normalize** хийнэ: `Project:66f…a1` нэг л удаа хадгалагдаж, бусад бүх газраас reference-ээр заагддаг.',
  'stack.12':
    '`loading` нь false болж, `data` ирээд, React дахин render хийнэ. `Project:66f…a1`-ийг ажиглаж буй бусад бүх component ч шинэчлэгдэнэ.',
  'review.label': 'Warm-up',
  'review.title': 'Үргэлжлүүлэхийн өмнө',
  'review.welcome': 'Тавтай эргэн морил. {days} хоног өнгөрчээ.',
  'review.one': 'Нэг товч зүйл',
  'review.many': '{count} товч зүйл',
  'review.intro': 'Өмнө үзсэнээсээ {count}, ойролцоогоор {minutes} минут.',
  'review.why': 'Одоо санаж сэргээвэл л толгойд үлддэг.',
  'review.whyBack':
    'Дахин уншихаас хурдан сэргээнэ, тэгээд зогссон газраасаа үргэлжлүүл.',
  'review.start': 'Эхлэх',
  'review.notToday': 'Өнөөдөр биш',
  'review.progress': 'Warm-up · {index}/{total}',
  'review.reread': 'Дахин уншаад үзэхэд илүүдэхгүй:',
  'review.rereadEnd': '. Хэдэн өдрийн дараа дахин гарч ирнэ.',
  'review.drillTitle': 'Үүнийг одоо ч хоосон файлаас хийж чадах уу?',
  'review.drillBody':
    'Нээгээд, бичсэн кодоо Reset file-аар цэвэрлээд, юу ч харалгүй дахин оролд. Өмнөх pass чинь юу ч болсон хэвээр үлдэнэ.',
  'review.openDrill': 'Drill-ийг нээх',
  'review.done': 'Болсон',
  'review.next': 'Дараагийнх',
  'review.skip': 'Үүнийг алгасах',
  'lesson.meta': 'Хичээл · ойролцоогоор {minutes} мин',
  'lesson.completed': ' · ✓ дууссан',
  'lesson.next': 'Ойлголоо, дараагийнх нь: {title} →',
  'lesson.finish': 'Дууссан гэж тэмдэглэх ✓',
  'quiz.check': 'Богино шалгалт ·',
  'quiz.right': 'Зөв. ',
  'quiz.wrong': 'Яг тийм биш. ',
  'quiz.retry': 'Дахин оролдох',
  'callout.NOTE': 'Тэмдэглэл',
  'callout.TIP': 'Зөвлөгөө',
  'callout.IMPORTANT': 'Чухал',
  'callout.WARNING': 'Урхи',
  'callout.CAUTION': 'Болгоомжтой',
  'callout.BRIDGE': 'Үүнийг өмнө нь харсан',
  'progress.export': 'Ахицаа export хийх',
  'progress.exportNote':
    'Дуусгасан зүйл, огноо, оролдлогуудыг багтаасан жижиг файл хадгална. Код чинь орохгүй, хаа ч юу ч явуулахгүй, хуваалцах эсэх нь өөрийн чинь сонголт.',
  'mentor.title': 'Ментор',
  'mentor.button': 'Ментор',
  'mentor.buttonTitle': 'Нээлттэй байгаа зүйлийнхээ талаар AI ментортой ярилц',
  'mentor.close': 'Хаах',
  'mentor.settings': 'Менторын тохиргоо',
  'mentor.newChat': 'Шинэ яриа',
  'mentor.model': 'Модель',
  'mentor.addKeyOption': '{name} key нэмэх…',
  'mentor.keyAdded': ' (key нэмсэн)',
  'mentor.provider': 'Provider',
  'mentor.keyIntro':
    '{page}-аас {name} API key аваад энд тавь. Key зөвхөн {name} руу очно. Мессеж бүрт {name} данснаас чинь бага зэрэг мөнгө гарна.',
  'mentor.keyLabel': '{name} API key',
  'mentor.remember': 'Энэ компьютер дээр сана',
  'mentor.rememberOn': '{where} дотор хадгална. Менторын тохиргооны "Мартах" товч үүнийг устгана.',
  'mentor.rememberOff': 'Унтраалттай үед Forge Academy зогсоход key алга болно.',
  'mentor.checking': 'Шалгаж байна…',
  'mentor.useKey': 'Энэ key-г ашиглах',
  'mentor.cancel': 'Болих',
  'mentor.unreachable': 'Ментор руу холбогдож чадсангүй.',
  'mentor.openItem': 'Ярилцахын тулд хичээл эсвэл дасгал нээ.',
  'mentor.askLesson': 'Энэ хичээлийн талаар асуу, эсвэл доорхоос нэгийг сонго:',
  'mentor.askTask': 'Энэ дасгалын талаар асуу, эсвэл доорхоос нэгийг сонго:',
  'mentor.projectNote': 'Энэ төслийн бүх алхам нэг яриатай, тиймээс ментор өмнөх алхмуудыг санана.',
  'mentor.starter.task1': 'Тест маань яагаад унаад байна?',
  'mentor.starter.task2': 'Дараа нь юу хийх вэ?',
  'mentor.starter.task3': 'Энэ дасгалын санааг тайлбарлаад өгөөч',
  'mentor.starter.lesson1': 'Гол санааг энгийнээр тайлбарла',
  'mentor.starter.lesson2': 'Энэ хичээлээр намайг шалга',
  'mentor.starter.lesson3': 'Өөр нэг жишээ үзүүл',
  'mentor.thinking': 'Бодол',
  'mentor.working': 'Ажиллаж байна… {s} сек',
  'mentor.costUnknown': 'үнэ тодорхойгүй',
  'mentor.thisChat': 'Энэ яриа: {cost}',
  'mentor.plusUnknown': ' + тодорхойгүй',
  'mentor.placeholder': 'Менторт бич (Enter илгээнэ, Shift+Enter шинэ мөр)',
  'mentor.effort': 'Бодох хэмжээ',
  'mentor.effort.none': 'none: бодолгүйгээр шууд хариулна. Хамгийн хямд.',
  'mentor.effort.low': 'low: бага зэрэг бодно. Хурдан.',
  'mentor.effort.medium': 'medium: үндсэн сонголт, тэнцвэртэй.',
  'mentor.effort.high': 'high: удаан бодож, илүү үнэтэй.',
  'mentor.effort.xhigh': 'xhigh: хэцүү debug-д зориулсан. Удаан.',
  'mentor.effort.max': 'max: хамгийн их бодно. Хамгийн удаан бас хамгийн үнэтэй.',
  'mentor.stop': 'Зогсоох',
  'mentor.send': 'Илгээх',
  'mentor.stopped': 'Зогсоосон.',
  'mentor.switchModel': 'Өөр модель сонговол энд шинэ яриа эхэлнэ. Солих уу?',
  'mentor.movedTo': 'Одоо: {title}',
  'mentor.labelModule': '{n}-р module · {title}',
  'mentor.labelStep': '{project}, {n}-р алхам · {title}',
  'mentor.set.back': 'Яриа руу буцах',
  'mentor.set.keys': 'API key',
  'mentor.set.noKey': 'Key нэмээгүй.',
  'mentor.set.keySession': 'Нэмсэн. Forge Academy зогстол хадгалагдана.',
  'mentor.set.keyRemembered': '{where} дотор хадгалсан.',
  'mentor.set.add': 'Key нэмэх',
  'mentor.set.replace': 'Солих',
  'mentor.set.forget': 'Мартах',
  'mentor.set.sentTitle': 'Provider руу юу очих вэ',
  'mentor.set.sent':
    'Нээлттэй хичээл эсвэл дасгал, түүний код болон тестийн үр дүн, менторын харсан бусад хичээл, module дахь ахиц чинь, мөн яриа өөрөө. Үүнээс өөр юу ч энэ компьютерээс гарахгүй.',
  'mentor.set.spendTitle': 'Зарлага',
  'mentor.set.spend': 'Forge Academy асснаас хойш {n} хариултад {cost}.',
  'mentor.set.spendUnknown':
    'Зарим хариултыг зогсоосон эсвэл үнэ нь тодорхойгүй модель ашигласан тул бодит дүн үүнээс өндөр.',
  'mentor.set.spendNote': 'Яг дүнг provider-ийнхоо dashboard-оос хар.',
  'mentor.set.convTitle': 'Яриа',
  'mentor.set.convNote':
    'Энэ компьютерт, Forge Academy-гийн data folder дотор хадгалагдана. Ахицаас чинь тусдаа бөгөөд progress export-д хэзээ ч орохгүй.',
  'mentor.set.deleteAll': 'Бүх яриаг устгах',
  'mentor.set.deleteConfirm': 'Хадгалсан бүх яриаг устгах уу? Буцааж сэргээх боломжгүй.',
  'mentor.set.deleted': 'Бүх яриаг устгалаа.',
};

let language: Language = 'en';

export function setLanguage(next: Language) {
  language = next;
  document.documentElement.lang = next;
}

export const currentLanguage = () => language;

export function t(key: StringKey, values: Record<string, string | number> = {}) {
  const text = (language === 'mn' ? mn[key] : undefined) ?? en[key];
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
}
