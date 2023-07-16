import { HasMetadata } from 'type-fns';

import { AsyncTask } from './objects/AsyncTask';

export type AsyncTaskDaoDatabaseConnection = Record<string, any>;

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
  D extends AsyncTaskDaoDatabaseConnection | undefined,
> {
  findByUnique: (
    args: U & {
      dbConnection?: D;
    },
  ) => Promise<HasMetadata<T> | null>;
  upsert: (args: { task: T; dbConnection?: D }) => Promise<HasMetadata<T>>;
}
