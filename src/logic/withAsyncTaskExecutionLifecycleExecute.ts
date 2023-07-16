import { addMinutes, isBefore, parseISO } from 'date-fns';
import { HasMetadata } from 'type-fns';

import {
  AsyncTaskDao,
  AsyncTaskDaoDatabaseConnection,
} from '../domain/constants';
import { AsyncTask, AsyncTaskStatus } from '../domain/objects/AsyncTask';
import { BadRequestError } from '../utils/BadRequestError';

/**
 * enables creating an execute method that conforms to the pit-of-success execution-lifecycle of a task
 *
 * specifically:
 * 1. looks up the latest state of the task from the db by unique, throws BadRequestError if not findable
 * 2. checks that task is attemptable, throws BadRequestError if not
 *     - if task has `status.ATTEMPTED` for less than 15 min, then throw RetryLaterError as it my still be executing
 *     - if task has `status.FULFILLED`, then throw BadRequestError so that the request wont be retired by sqs
 *     - if task has `status.CANCELED`, then throw BadRequestError so that the request wont be retried by sqs
 * 3. marks the task as `status.ATTEMPTED` to signify that it is being attempted now
 * 4. runs the logic to execute the task
 * 5. checks that the status of the task was changed to something other than `status.ATTEMPTED` while executing the task
 * 6. marks the task as `status.FAILED` if the execution threw an error
 *     - it does not squash the error, it throws the error back up for you to handle
 *
 * note: this wrapper uses BadRequestError specifically to make sure that the lambda invocation is not recorded as an error and that the request is not retried automatically
 */
export const withAsyncTaskExecutionLifecycleExecute = <
  T extends AsyncTask,
  U extends Partial<T>,
  D extends AsyncTaskDaoDatabaseConnection | undefined,
  P extends {
    dbConnection?: D;
    task: T;
  },
  R extends Record<string, any>,
>(
  logic: (args: P & { task: HasMetadata<T> }) => R | Promise<R>,
  {
    dao,
  }: {
    dao: AsyncTaskDao<T, U, D>;
  },
) => {
  return async (args: P) => {
    // try to find the task by unique; it must be defined in db by now
    const foundTask = await dao.findByUnique({
      ...(args.task as any as U),
      dbConnection: args.dbConnection,
    });
    if (!foundTask)
      throw new BadRequestError(
        `task not found by unique: '${JSON.stringify(args.task)}'`,
      );

    // check that the task is not already being attempted
    if (foundTask.status === AsyncTaskStatus.ATTEMPTED) {
      // if the task was updated less than 15 minutes ago, then it may still be being attempted, so throw an error so this message will get retried eventually
      const fifteenMinutesAfterUpdatedAt = addMinutes(
        parseISO(foundTask.updatedAt!),
        15,
      );
      const now = new Date();
      if (isBefore(now, fifteenMinutesAfterUpdatedAt))
        throw new BadRequestError(
          'will not attempt to execute task: it is already being attempted.',
        );
    }

    // check that the task has not already been fulfilled and is not canceled; bad-request because we dont want to try this again automatically
    if (foundTask.status === AsyncTaskStatus.FULFILLED)
      throw new BadRequestError(
        'will not attempt to execute task: it has already succeeded.',
      );
    if (foundTask.status === AsyncTaskStatus.CANCELED)
      throw new BadRequestError(
        'will not attempt to execute task: it has been canceled.',
      );

    // record that we are now attempting this task
    const attemptedTask = await dao.upsert({
      dbConnection: args.dbConnection,
      task: { ...foundTask, status: AsyncTaskStatus.ATTEMPTED },
    });

    // try and run the logic with db connection in a txn
    try {
      const result = await logic({ ...args, task: attemptedTask }); // execute the task

      // if the status of the task was not changed from attempted, then throw an error; its the obligation of the execute function to specify what status the task is in now
      const taskNow = await dao.findByUnique({
        ...(args.task as any as U),
        dbConnection: args.dbConnection,
      });
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
      await dao.upsert({
        dbConnection: args.dbConnection,
        task: { ...attemptedTask, status: AsyncTaskStatus.FAILED },
      }); // record that it failed
      throw error; // and pass the error back up
    }
  };
};
