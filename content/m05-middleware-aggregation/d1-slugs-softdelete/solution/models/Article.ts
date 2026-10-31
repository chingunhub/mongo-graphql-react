import mongoose, { Schema } from 'mongoose';
import { slugify } from '../lib/slugify';

const articleSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    slug: { type: String, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Slugs follow the title, but never change when only other fields are edited.
articleSchema.pre('save', async function () {
  if (this.isModified('title')) this.slug = slugify(this.title);
});

// Soft-deleted articles are invisible unless a query opts in with { withDeleted: true }.
articleSchema.pre(['countDocuments', /^find/], function () {
  if (this.getOptions().withDeleted) return;
  this.where({ deletedAt: null });
});

articleSchema.methods.softDelete = async function () {
  this.deletedAt = new Date();
  return this.save();
};

articleSchema.methods.restore = async function () {
  this.deletedAt = null;
  return this.save();
};

articleSchema.statics.findBySlug = function (slug: string) {
  return this.findOne({ slug });
};

export const Article = mongoose.model('Article', articleSchema);
