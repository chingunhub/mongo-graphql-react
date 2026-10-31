import mongoose, { Schema } from 'mongoose';

// TODO: name, key, description, owner, members (+ timestamps)
const projectSchema = new Schema({});

export const Project = mongoose.model('Project', projectSchema);
