import mongoose, { Schema } from 'mongoose';
export interface ContactData {
  tenant: string;
  id: string;
  name: string;
}
const schema = new Schema<ContactData>({
  tenant: { type: String, required: true },
  id: { type: String, required: true },
  name: { type: String, required: true },
});
schema.index({ tenant: 1, id: 1 }, { unique: true });
export const Contact =
  (mongoose.models.RelayContact as mongoose.Model<ContactData>) || mongoose.model<ContactData>('RelayContact', schema);
