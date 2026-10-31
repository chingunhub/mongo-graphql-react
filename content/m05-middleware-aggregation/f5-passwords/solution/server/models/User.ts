import mongoose, { Schema } from 'mongoose';
import { hashPassword, verifyPassword, isHashed } from '../auth/password';

export const ROLES = ['MEMBER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

const PASSWORD_MESSAGE = 'Password must be at least 8 characters';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    role: { type: String, enum: ROLES, default: 'MEMBER' },
    password: { type: String, minlength: [8, PASSWORD_MESSAGE], select: false },
  },
  { timestamps: true },
);

// Validation runs before this hook, so minlength checked the plain password.
userSchema.pre('save', async function () {
  if (this.isModified('password') && this.password && !isHashed(this.password)) {
    this.password = hashPassword(this.password);
  }
});

// Save hooks don't run for update queries — cover those paths too.
userSchema.pre(['updateOne', 'findOneAndUpdate'], function () {
  const update = this.getUpdate() as Record<string, any> | null;
  if (!update) return;
  for (const target of [update, update.$set]) {
    if (!target || target.password === undefined || target.password === null) continue;
    if (isHashed(target.password)) continue;
    if (String(target.password).length < 8) throw new Error(PASSWORD_MESSAGE);
    target.password = hashPassword(String(target.password));
  }
  this.setUpdate(update);
});

userSchema.methods.checkPassword = async function (plain: string) {
  if (this.password === undefined) {
    throw new Error('Password not loaded: query the user with .select("+password")');
  }
  return !!this.password && verifyPassword(plain, this.password);
};

userSchema.statics.findByCredentials = async function (email: string, password: string) {
  const user = await this.findOne({ email }).select('+password');
  if (!user || !(await user.checkPassword(password))) return null;
  return user;
};

userSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.password;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);

export async function createUser(data: { name: string; email: string; role?: Role; password?: string }) {
  return User.create(data);
}

export async function findUserByEmail(email: string) {
  // The schema's trim + lowercase setters also apply to this filter.
  return User.findOne({ email });
}

export async function listUsers() {
  return User.find().sort({ name: 1 });
}
