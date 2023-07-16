import { HasMetadata } from 'type-fns';

import {
  AsyncTaskDao,
  AsyncTaskDaoDatabaseConnection,
} from '../domain/constants';
import { AsyncTask, AsyncTaskStatus } from '../domain/objects/AsyncTask';

/**
 * enables creating an `queue` method that conforms to the pit-of-success execution-lifecycle of a task
 *
 * specifically:
 * 1. looks up the latest state of the task from the db by unique
 * 2. if the task does not already exist by unique
 *    1. uses the `getInitialStateForCreate` function to create the initial state
 *    2. upserts the initialState of the task
 *    3. queues the task
 * 3. if the task already existed by unique
 *    1.. checks that the task is queueable
 *       1. if task has `status.QUEUED`, returns the current state of the task and does nothing, since the task is already in the queue, no need to duplicate
 *       2. if task has `status.ATTEMPTED`, returns current state of the task and does nothing, since the task is already currently being executed
 *       3. if task has `status.FULFILLED`, returns current state of the task and does nothing, since task was already successfully completed before
 *       3. if task has `status.CANCELED`, returns current state of the task and does nothing, since task was marked as something that shouldn't be done
 *    2. queues the task
 *       1. writes to the sqs queue
 *       2. updates the status of the task to `status.QUEUED`
 *
 * note: this wrapper uses BadRequestError specifically to make sure that the lambda invocation is not recorded as an error and that the request is not retried automatically
 */
export const withAsyncTaskExecutionLifecycleQueue = <
  T extends AsyncTask,
  U extends Partial<T>,
  D extends AsyncTaskDaoDatabaseConnection | undefined,
  P extends { dbConnection?: D } & U,
>({
  getNew,
  dao,
  queue,
}: {
  getNew: (args: P) => T | Promise<T>;
  dao: AsyncTaskDao<T, U, D>;
  queue: { push: (task: T) => Promise<void> | void };
}) => {
  return async (args: P): Promise<HasMetadata<T>> => {
    // try to find the task by unique
    const taskFound = await dao.findByUnique({
      ...args,
      dbConnection: args.dbConnection,
    });

    // if the task already exists, check that its in a queueable state
    if (taskFound?.status === AsyncTaskStatus.QUEUED) return taskFound; // if already queued, no need to duplicate the request
    if (taskFound?.status === AsyncTaskStatus.ATTEMPTED) return taskFound; // if already being attempted, no need to duplicate the request
    if (taskFound?.status === AsyncTaskStatus.FULFILLED) return taskFound; // if already fulfilled, no sense in trying it again
    if (taskFound?.status === AsyncTaskStatus.CANCELED) return taskFound; // if was canceled, no sense in queuing something that is no longer desired

    // if the task does not exist, create the task with the new initial state
    const taskReadyToQueue = taskFound ?? (await getNew(args)); // note: we dont save to the database yet to prevent duplicate calls but also because if this is called within a transaction, the effective_at time is the same for the initial version and the queued version, leading to duplicate-key violations on the version table

    // now queue the task into sqs
    const taskToQueue = {
      ...taskReadyToQueue,
      status: AsyncTaskStatus.QUEUED,
    };
    await queue.push(taskToQueue);

    // and save that it has been queued
    return await dao.upsert({
      dbConnection: args.dbConnection,
      task: taskToQueue,
    });
  };
};
