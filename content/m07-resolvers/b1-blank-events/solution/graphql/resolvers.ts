import mongoose from 'mongoose';
import { Event } from '../models/Event';
import { Venue } from '../models/Venue';

export const resolvers = {
  Query: {
    events: () => Event.find().sort({ startsAt: 1 }).lean().exec(),
    event: (_: unknown, { id }: { id: string }) =>
      mongoose.isValidObjectId(id) ? Event.findById(id).lean().exec() : null,
  },
  Mutation: {
    renameEvent: (_: unknown, { id, title }: { id: string; title: string }) =>
      Event.findByIdAndUpdate(id, { $set: { title } }, { returnDocument: 'after' }).lean().exec(),
  },
  Event: {
    id: (event: any) => String(event._id),
    startsAt: (event: any) => event.startsAt.toISOString(),
    venue: (event: any) => Venue.findById(event.venue).lean().exec(),
  },
  Venue: {
    id: (venue: any) => String(venue._id),
  },
};
