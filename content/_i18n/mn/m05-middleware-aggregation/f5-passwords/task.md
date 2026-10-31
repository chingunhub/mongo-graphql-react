---
title: "Taskforge: нууцаа хадгалдаг user-ууд"
summary: Тойрч гарахын аргагүй password hashing, далд field, method, static ба JSON transform.
source: 2f6479cb55c9b8d9154ed5159a1889a2f60366dd071516f3457da94e1c1cdab6
---

Taskforge-д login хэрэгтэй (GraphQL `login` mutation module 8-д ирнэ). Тэр хүртэл `User` model password-ыг **аюулгүй** хадгалах ёстой гэсэн үг: hash хийсэн, санамсаргүйгээр хэзээ ч буцдаггүй, мөн ямар код зам бичиж байгаагаас үл хамааран plain text-ээр хадгалагдах аргагүй.

Криптографийн хэсгийг `server/auth/password.ts`-д бид хийж өгсөн (уншаарай, богино): `hashPassword(plain)`, `verifyPassword(plain, stored)`, `isHashed(value)`. Чиний ажил бол үүнийг model-д холбож, багийн хэн ч буруу хэрэглэж чадахгүй болгох.

## Даалгавар

Бүгд `server/models/User.ts` дотор:

1. **`password` field** — string, наад зах нь 8 тэмдэгт (мессеж: `Password must be at least 8 characters`), мөн **ил хүсээгүй бол query-д буцахгүй** (`.select('+password')`). Заавал биш: урьсан user-д хараахан password байхгүй байж болно.

2. **Save дээр hash хий** — user-ийг шинэ эсвэл өөрчилсөн password-той хадгалахад `hashPassword(plain)`-ийг хадгал. Зөвхөн нэрийг өөрчлөөд хадгалахад дахин hash **хийгдэхгүй** (хадгалсан hash яг хэвээр үлдэнэ).

3. **Update дээр бас hash хий** — `User.updateOne(filter, { password })`, `User.updateOne(filter, { $set: { password } })`, мөн `findOneAndUpdate`-ийн адил хувилбарууд бас hash хадгална. Мөн 8-аас богино password-ыг няцаана (ижил мессежтэй `Error` throw хий). Энэ бол хичээлийн diagram дахь bug, түүнийг хаа.

4. **`user.checkPassword(plain)`** — `true`/`false`-ээр resolve болдог instance method. User-ийг password field-гүйгээр ачаалсан бол (default нь ийм!) тэр тухай хэлсэн `Error` throw хий. Чимээгүйхэн `false` буцаавал login бүр ямар ч сэжүүргүйгээр унана.

5. **Хэзээ ч serialize хийхгүй** — field-ийг select хийсэн үед ч `user.toJSON()` дотор `password` байхгүй.

6. **`User.findByCredentials(email, password)`** — email (ямар ч том жижиг үсгээр) болон password таарвал user-ээр, эс бөгөөс `null`-аар resolve болдог static.

Мөн `createUser` заавал биш `password` хүлээн авдаг болго.

## Hints

### Далд field, save дээр hash
Field дээрх `select: false` үүнийг нууна. `pre('save')` дотор: `if (this.isModified('password') && this.password) this.password = hashPassword(this.password)`. Validation аль хэдийн ажилласан (validate → pre-save), тиймээс `minlength` *энгийн* password-ыг шалгасан.

### Update
`['updateOne', 'findOneAndUpdate']` дээр query middleware бүртгэ. Дотор нь `const update = this.getUpdate()`. Password `update.password` эсвэл `update.$set?.password` дээр байж болно. Уртыг шалга, hash-ээр солиод, дараа нь `this.setUpdate(update)`. `isHashed()` нь аль хэдийн hash болсон утгыг алгасахад тусална.

### JSON ба static
`userSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.password; return ret; } })`. Static дотор `this.findOne({ email }).select('+password')`, дараа нь `await user.checkPassword(password)`.
