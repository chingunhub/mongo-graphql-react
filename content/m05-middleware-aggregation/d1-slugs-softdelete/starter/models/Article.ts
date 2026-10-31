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

// TODO 1: pre('save') — slug from title, only when the title is new or changed

// TODO 2: hide soft-deleted articles from find*, findOneAndUpdate and countDocuments
//         unless the query has the option { withDeleted: true }

// TODO 3: methods softDelete() and restore()

// TODO 4: static findBySlug(slug)

export const Article = mongoose.model('Article', articleSchema);
