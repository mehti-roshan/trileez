import mongoose from 'mongoose';
import { schemas } from './schemas.js';
import type { ResourceName } from '../types/entities.js';

export const models = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [
    name,
    mongoose.models[name] || mongoose.model(name, schema),
  ]),
) as Record<ResourceName, mongoose.Model<Record<string, unknown>>>;
