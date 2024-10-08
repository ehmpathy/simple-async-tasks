import { HasMetadata } from 'type-fns';

import { AsyncTask, AsyncTaskStatus } from './objects/AsyncTask';

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
  M extends Partial<T> & { status: AsyncTaskStatus },
  C extends AsyncTaskDaoContext,
> {
  findByMutex?: (
    input: M & { status: AsyncTaskStatus }, // needs to be able to search by mutex keys + status
    context: C,
  ) => Promise<HasMetadata<T>[]>;
  findByUnique: (input: U, context: C) => Promise<HasMetadata<T> | null>;
  upsert: (input: { task: T }, context: C) => Promise<HasMetadata<T>>;
}

/**
 * the shape of a simple aws sqs api
 */
export type SimpleAwsSqsApi = {
  sendMessage: (input: {
    queueUrl: string;
    messageBody: string;
    delaySeconds?: number;
  }) => Promise<void>;
};
