import { HasMetadata } from 'type-fns';

import { AsyncTask } from './objects/AsyncTask';

export type AsyncTaskDaoContext = Record<string, any> | void;

/**
 * a dao that can be used to persist the async-task
 *
 * note
 * - supports the dao requiring a db connection as part of the input
 * - supports the dao not requiring a db connection as well
 */
export interface AsyncTaskDao<
  T extends AsyncTask,
  U extends Partial<T>,
  C extends AsyncTaskDaoContext,
> {
  findByUnique: (input: U, context: C) => Promise<HasMetadata<T> | null>;
  upsert: (input: { task: T }, context: C) => Promise<HasMetadata<T>>;
}
