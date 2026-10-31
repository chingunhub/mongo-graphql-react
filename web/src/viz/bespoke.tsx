import type { ComponentType } from 'react';
import { StackMap } from './StackMap';
import { ObjectIdViz } from './ObjectIdViz';
import { NullabilityViz } from './NullabilityViz';
import { CacheViz } from './CacheViz';
import {
  TenantCacheLab,
  DeliveryLab,
  BlastRadiusLab,
  DualWriteLab,
  RetryLab,
  LoaderLab,
  OptimisticLab,
} from './SystemLabs';

/** Hand-built visuals referenced from lessons as ```viz <name>```. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BESPOKE: Record<string, ComponentType<{ spec: any }>> = {
  'stack-map': StackMap,
  objectid: ObjectIdViz,
  nullability: NullabilityViz,
  cache: CacheViz,
  'tenant-cache': TenantCacheLab,
  'delivery-lab': DeliveryLab,
  'blast-radius': BlastRadiusLab,
  'dual-write': DualWriteLab,
  'retry-lab': RetryLab,
  'loader-lab': LoaderLab,
  'optimistic-lab': OptimisticLab,
};
