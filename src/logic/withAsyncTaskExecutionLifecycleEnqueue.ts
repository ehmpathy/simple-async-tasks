import { UnexpectedCodePathError } from '@ehmpathy/error-fns';
import type { LogMethods } from 'simple-leveled-log-methods';
import { HasMetadata, isAFunction } from 'type-fns';

import { AsyncTaskDao, AsyncTaskDaoContext } from '../domain/constants';
import { AsyncTask, AsyncTaskStatus } from '../domain/objects/AsyncTask';

/**
 * a simple, pit-of-success, contract for async-tasks queued via sqs
 *
 * benefits
 * - guarantees a standard message body
 * - guarantees a simple definition of the minimum inputs required
 */
export type SimpleAsyncTaskSqsQueueContract = {
  type: 'SQS';
  api: {
    sendMessage: (input: {
      queueUrl: string;
      messageBody: string;
    }) => Promise<void>;
  };
  url: string | (() => Promise<string>);
};

/**
 * a simple, generic, contract for async-tasks queued via any queue
 *
 * benefits
 * - enables interoperability with custom queue mechanisms not already supported
 */
export type SimpleAsyncTaskAnyQueueContract<T> = {
  type?: 'ANY';
  push: ((task: T) => void) | ((task: T) => Promise<void>);
};

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
 */
export const withAsyncTaskExecutionLifecycleEnqueue = <
  T extends AsyncTask,
  U extends Partial<T>,
  M extends Partial<T>,
  C extends AsyncTaskDaoContext,
  I extends U,
>({
  getNew,
  dao,
  log,
  queue,
}: {
  getNew: (input: I, context: C) => T | Promise<T>;
  dao: AsyncTaskDao<T, U, M, C>;
  log: LogMethods;
  queue: SimpleAsyncTaskSqsQueueContract | SimpleAsyncTaskAnyQueueContract<T>;
}) => {
  return async (input: I, context: C): Promise<HasMetadata<T>> => {
    // try to find the task by unique
    const taskFound = await dao.findByUnique(
      {
        ...input,
      },
      context,
    );

    // if the task already exists, check that its in a queueable state
    if (taskFound?.status === AsyncTaskStatus.QUEUED) {
      log.debug(
        'enqueueTask.progress: skipped adding task to queue. reason: task is already queued',
        {
          task: taskFound,
        },
      );
      return taskFound; // if already queued, no need to duplicate the request
    }
    if (taskFound?.status === AsyncTaskStatus.ATTEMPTED) {
      log.debug(
        'enqueueTask.progress: skipped adding task to queue. reason: task is already being attempted from queue',
        {
          task: taskFound,
        },
      );
      return taskFound; // if already being attempted, no need to duplicate the request
    }
    if (taskFound?.status === AsyncTaskStatus.FULFILLED) {
      log.debug(
        'enqueueTask.progress: skipped adding task to queue. reason: task was already fulfilled',
        {
          task: taskFound,
        },
      );
      return taskFound; // if already fulfilled, no sense in trying it again
    }
    if (taskFound?.status === AsyncTaskStatus.CANCELED) {
      log.debug(
        'enqueueTask.progress: skipped adding task to queue. reason: task was already canceled',
        {
          task: taskFound,
        },
      );
      return taskFound; // if was canceled, no sense in queuing something that is no longer desired
    }

    // if the task does not exist, create the task with the new initial state
    const taskReadyToQueue = taskFound ?? (await getNew(input, context)); // note: we dont save to the database yet to prevent duplicate calls but also because if this is called within a transaction, the effective_at time is the same for the initial version and the queued version, leading to duplicate-key violations on the version table

    // now queue the task into sqs
    const taskToQueue = {
      ...taskReadyToQueue,
      status: AsyncTaskStatus.QUEUED,
    };
    log.debug('enqueueTask.progress: adding task to queue', {
      task: taskToQueue,
      queue: { type: queue.type },
    });
    await (async () => {
      // support sqs queues natively
      if (queue.type === 'SQS')
        return await queue.api.sendMessage({
          queueUrl: isAFunction(queue.url) ? await queue.url() : queue.url,
          messageBody: JSON.stringify({ task: taskToQueue }),
        });

      // otherwise, assume it has a generic queue contract
      if (queue.push) return await queue.push(taskToQueue);

      // otherwise, this is not a supported queue mechanism
      throw new UnexpectedCodePathError(
        'unsupported queue mechanism specified',
        { queue },
      );
    })();
    log.debug('enqueueTask.progress: added task to queue', {
      task: taskToQueue,
      queue: { type: queue.type },
    });

    // and save that it has been queued
    return await dao.upsert(
      {
        task: taskToQueue,
      },
      context,
    );
  };
};
