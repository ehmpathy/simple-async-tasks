import {
  BadRequestError,
  HelpfulError,
  UnexpectedCodePathError,
} from '@ehmpathy/error-fns';
import { addSeconds, isBefore, parseISO } from 'date-fns';
import type { LogMethods } from 'simple-leveled-log-methods';
import { HasMetadata } from 'type-fns';

import { AsyncTaskDao, AsyncTaskDaoContext } from '../domain/constants';
import { AsyncTask, AsyncTaskStatus } from '../domain/objects/AsyncTask';

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
  M extends Partial<T>,
  I extends {
    task: T;
  },
  C extends AsyncTaskDaoContext,
  O extends Record<string, any>,
>(
  logic: (input: I & { task: HasMetadata<T> }, context: C) => O | Promise<O>,
  {
    dao,
    log,
    options,
  }: {
    dao: AsyncTaskDao<T, U, M, C>;
    log: LogMethods;
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
): ((input: I, context: C) => Promise<(O & { task: T }) | { task: T }>) => {
  return async (
    input: I,
    context: C,
  ): Promise<(O & { task: T }) | { task: T }> => {
    // try to find the task by unique; it must be defined in db by now
    const foundTask = await dao.findByUnique(
      {
        ...(input.task as unknown as U),
      },
      context,
    );
    if (!foundTask)
      throw new BadRequestError(
        `task not found by unique: '${JSON.stringify(input.task)}'`,
      );

    // check that the task is not already being attempted
    if (foundTask.status === AsyncTaskStatus.ATTEMPTED) {
      // if the task was updated less than 15 minutes ago, then it may still be being attempted, so throw an error so this message will get retried eventually
      const attemptTimeoutSeconds =
        options?.attempt?.timeout.seconds ?? 15 * 60;
      const attemptTimeoutAt = addSeconds(
        parseISO(foundTask.updatedAt!),
        attemptTimeoutSeconds, // default to 15 min
      );
      const now = new Date();
      if (isBefore(now, attemptTimeoutAt))
        throw new SimpleAsyncTaskRetryLaterError(
          'this task may still be being attempted by a different invocation, last attempt started less than the timeout',
          {
            attemptTimeoutSeconds,
            attemptTimeoutAt,
          },
        );
    }

    // check that the task has not already been fulfilled and is not canceled; if either are true, warn and exit
    if (foundTask.status === AsyncTaskStatus.FULFILLED) {
      log.warn(
        'attempted to execute a task that has already been fulfilled. skipping',
        { task: foundTask },
      );
      return { task: foundTask };
    }
    if (foundTask.status === AsyncTaskStatus.CANCELED) {
      log.warn(
        'attempted to execute a task that has already been canceled. skipping',
        { task: foundTask },
      );
      return { task: foundTask };
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
        throw new SimpleAsyncTaskRetryLaterError(
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
