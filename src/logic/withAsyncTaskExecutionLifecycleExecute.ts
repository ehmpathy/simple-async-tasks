import { HelpfulError, UnexpectedCodePathError } from '@ehmpathy/error-fns';
import { HelpfulErrorMetadata } from '@ehmpathy/error-fns/dist/HelpfulError';
import { addSeconds, isBefore, parseISO } from 'date-fns';
import type { LogMethods } from 'simple-leveled-log-methods';

import {
  AsyncTaskDao,
  AsyncTaskDaoContext,
  SimpleAwsSqsApi,
} from '../domain/constants';
import { AsyncTask, AsyncTaskStatus } from '../domain/objects/AsyncTask';
import { withRetry } from '../utils/withRetry';
import { AsyncTaskQueueParcel } from './extractTaskParcelFromSqsEvent';

export class SimpleAsyncTaskRetryLaterError extends HelpfulError {
  constructor(reason: string, metadata?: Record<string, any>) {
    super(
      `this error was thrown to ensure this task is retried later. ${reason}`,
      metadata,
    );
  }
}

/**
 * enables creating an execute method that conforms to the pit-of-success execution-lifecycle of a task
 *
 * specifically:
 * 1. looks up the latest state of the task from the db by unique, throws BadRequestError if not findable
 * 2. checks that task is attemptable, throws BadRequestError if not
 *     - if task has `status.ATTEMPTED` for less than 15 min, then throw RetryLaterError as it may still be executing
 *     - if task has `status.FULFILLED`, then simply return it, to prevent repeated execution
 *     - if task has `status.CANCELED`, then simply return it, to prevent repeated execution
 * 3. checks that task's mutex is not locked, if StaticPropertyOf<classof Task>.mutex is specified
 *     - if task does not have mutex specified, nothing to check
 *     - otherwise, check whether there are already other tasks in the attempted state
 *     - if no other tasks in the attempted state, proceed
 *     - otherwise, throw RetryLaterError as the mutex is still locked
 * 4. marks the task as `status.ATTEMPTED` to signify that it is being attempted now
 * 5. runs the logic to execute the task
 * 6. checks that the status of the task was changed to something other than `status.ATTEMPTED` while executing the task
 * 7. marks the task as `status.FAILED` if the execution threw an error
 *     - it does not squash the error, it throws the error back up for you to handle
 *
 * note: this wrapper uses BadRequestError specifically to make sure that the lambda invocation is not recorded as an error and that the request is not retried automatically
 */
export const withAsyncTaskExecutionLifecycleExecute = <
  T extends AsyncTask,
  U extends Partial<T>,
  M extends Partial<T> & { status: AsyncTaskStatus },
  I extends AsyncTaskQueueParcel<T>,
  C extends AsyncTaskDaoContext,
  O extends Record<string, any>,
>(
  logic: (input: I & AsyncTaskQueueParcel<T>, context: C) => O | Promise<O>,
  {
    dao,
    log,
    api,
    options,
  }: {
    dao: AsyncTaskDao<T, U, M, C>;
    log: LogMethods;
    api?: {
      sqs?: SimpleAwsSqsApi;
    };
    options?: {
      attempt?: {
        /**
         * how long to wait before retrying an attempted task
         *
         * default = 15 minutes
         */
        timeout: { seconds: number };
      };
    };
  },
): ((
  input: I,
  context: C,
) => Promise<(O & { task: T }) | (Partial<O> & { task: T })>) => {
  return async (
    input: I,
    context: C,
  ): Promise<(O & { task: T }) | (Partial<O> & { task: T })> => {
    // try to find the task by unique; it must be defined in db by now
    const foundTask = await withRetry(
      async () => {
        // lookup the task
        const foundTaskNow = await dao.findByUnique(
          {
            ...(input.task as unknown as U),
          },
          context,
        );

        // if not found, throw an error, as this shouldn't have been called for a non-existent task; => drive to dlq if irrecoverable
        if (!foundTaskNow)
          throw new UnexpectedCodePathError(`task not found by unique`, {
            task: input.task,
          });

        // return the task
        return foundTaskNow;
      },
      {
        // wait 3 seconds before retrying, to attempt to recover from read-after-write out-of-sync issues (e.g., if we tried to search for the task before the db.reader was synced to db.writer)
        delay: { seconds: 3 },
        log,
      },
    )();

    // define the timeout in seconds; this is how long each attempt could take, max
    const attemptTimeoutSeconds = options?.attempt?.timeout.seconds ?? 15 * 60; // default to 15min, a conservative estimate

    // define how to retry later
    const retryLater = (() => {
      // if this is an sqs driven task and the meta is available, requeue and resolve success
      if (input.meta?.queueType === 'SQS') {
        const queueUrl = input.meta.queueUrl;
        return async (message: string, metadata: HelpfulErrorMetadata) => {
          // log what we're up to
          log.debug(`executeTask.progress: requeueing task to retry later`, {
            message,
            metadata,
          });

          // get the sqs api
          const sqs =
            api?.sqs ??
            UnexpectedCodePathError.throw(
              'executeTask.api.sqs was not declared, yet task queue.type is sqs and found metadata',
              {
                meta: input.meta,
                api,
              },
            );

          // requeue the task
          await sqs.sendMessage({
            messageBody: JSON.stringify({ task: input.task, meta: input.meta }),
            queueUrl,
            delaySeconds: attemptTimeoutSeconds,
          });

          // and return the retained state of the task
          return {
            task: foundTask,
          } as any as Partial<O> & { task: T };
        };
      }

      // otherwise, just throw the error; that's the base case
      return async (message: string, metadata: HelpfulErrorMetadata) =>
        SimpleAsyncTaskRetryLaterError.throw(message, metadata);
    })();

    // check that the task is not already being attempted
    if (foundTask.status === AsyncTaskStatus.ATTEMPTED) {
      // if the task was updated less than 15 minutes ago, then it may still be being attempted, so throw an error so this message will get retried eventually
      const updatedAtLast =
        typeof foundTask.updatedAt === 'string'
          ? parseISO(foundTask.updatedAt)
          : foundTask.updatedAt;
      if (!updatedAtLast)
        throw new UnexpectedCodePathError(
          'task did not have an .updatedAt attribute. this is required for reliable async-tasks',
          { foundTask },
        );
      const attemptTimeoutAt = addSeconds(
        updatedAtLast,
        attemptTimeoutSeconds, // default to 15 min
      );
      const now = new Date();
      if (isBefore(now, attemptTimeoutAt))
        return await retryLater(
          'this task may still be being attempted by a different invocation, last attempt started less than the timeout',
          {
            attemptTimeoutSeconds,
            attemptTimeoutAt,
          },
        );
    }

    // check that the task has not already been fulfilled and is not canceled; if either are true, warn and exit
    const emptyResult: Partial<O> = {};
    if (foundTask.status === AsyncTaskStatus.FULFILLED) {
      log.warn(
        'executeTask.progress: attempted to execute a task that has already been fulfilled. skipping',
        { task: foundTask },
      );
      return { ...emptyResult, task: foundTask };
    }
    if (foundTask.status === AsyncTaskStatus.CANCELED) {
      log.warn(
        'executeTask.progress: attempted to execute a task that has already been canceled. skipping',
        { task: foundTask },
      );
      return { ...emptyResult, task: foundTask };
    }

    // determine whether we need to check for mutually exclusive tasks
    const mutexKeys = (foundTask.constructor as { mutex?: keyof T[] }).mutex;
    if (mutexKeys) {
      // verify that the mutex query was defined on the dao
      if (!dao.findByMutex)
        throw new UnexpectedCodePathError(
          'dao.findByMutex was not declared, yet task has .mutex keys specified. please add a findByMutex query',
          { task: foundTask },
        );

      // check whether there are mutually exclusive tasks in flight
      const mutexActiveTasks = await dao.findByMutex(
        { ...(foundTask as unknown as M), status: AsyncTaskStatus.ATTEMPTED },
        context,
      );
      if (mutexActiveTasks.length)
        return await retryLater(
          `this task's mutex lock is reserved by at least one other task currently being attempted by a different invocation`,
          {
            mutexKeys,
            mutexActiveTasks,
          },
        );
    }

    // record that we are now attempting this task
    const attemptedTask = await dao.upsert(
      {
        task: { ...foundTask, status: AsyncTaskStatus.ATTEMPTED },
      },
      context,
    );

    // try and run the logic with db connection in a txn
    try {
      const result = await logic({ ...input, task: attemptedTask }, context); // execute the task

      // if the status of the task was not changed from attempted, then throw an error; its the obligation of the execute function to specify what status the task is in now
      const taskNow = await dao.findByUnique(
        {
          ...(input.task as any as U),
        },
        context,
      );
      if (!taskNow)
        throw new Error(
          'task can no longer be found by unique. this should not be possible',
        ); // fail fast
      if (taskNow.status === AsyncTaskStatus.ATTEMPTED)
        throw new Error(
          'execute function did not end up changing status of task away from attempted. this is required',
        );

      // otherwise, just return the result with the state of the task now, since this is probably a multi-step task
      return { ...result, task: taskNow };
    } catch (error) {
      log.warn(
        'executeTask.progress: caught an error from the execution attempt. marking it as failed. will re-emit the error for sqs retry',
        {
          task: attemptedTask,
          error: {
            class: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : undefined,
          },
        },
      );
      await dao.upsert(
        {
          task: { ...attemptedTask, status: AsyncTaskStatus.FAILED },
        },
        context,
      ); // record that it failed
      throw error; // and pass the error back up
    }
  };
};
