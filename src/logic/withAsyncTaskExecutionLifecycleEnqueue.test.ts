import { QueueOrder, createQueue } from 'simple-in-memory-queue';
import { given, when, then } from 'test-fns';
import { HasMetadata } from 'type-fns';

import { AsyncTask, AsyncTaskStatus } from '../domain/objects/AsyncTask';
import {
  SimpleAsyncTaskSqsQueueContract,
  withAsyncTaskExecutionLifecycleEnqueue,
} from './withAsyncTaskExecutionLifecycleEnqueue';

/**
 * an async task for emitting some data to remote persistance
 *
 * e.g., for @mhetrics/app-usage-events-react
 */
interface AsyncTaskEmitToRemote extends AsyncTask {
  uuid?: string;
  updatedAt?: string;
  status: AsyncTaskStatus;
  endpoint: string;
  bytes: number;
  payload: string;
}

const exampleDao = {
  upsert: async ({ task }: { task: AsyncTaskEmitToRemote }) => {
    console.log('mock.dao.upsert', { task });
    return task as HasMetadata<AsyncTaskEmitToRemote>;
  },
  findByUnique: async () => null,
};

const exampleGetNew = (): AsyncTaskEmitToRemote => ({
  status: AsyncTaskStatus.QUEUED,
  payload: 'hello',
  bytes: 7,
  endpoint: 'yes',
});

describe('withAsyncTaskExecutionLifecycleQueue', () => {
  given('a simple queue', () => {
    const queue = createQueue({
      order: QueueOrder.FIRST_IN_FIRST_OUT,
    });

    when('using it with async task lifecycle', () => {
      const enqueue = withAsyncTaskExecutionLifecycleEnqueue({
        getNew: exampleGetNew,
        dao: exampleDao,
        log: console,
        queue,
      });

      then('it should successfully allow enqueue', async () => {
        const enqueued = await enqueue({});
        expect(enqueued).toHaveProperty('status');
        expect(enqueued.status).toEqual(AsyncTaskStatus.QUEUED);
      });
    });
  });

  given('an sqs queue', () => {
    const queue: SimpleAsyncTaskSqsQueueContract = {
      type: 'SQS',
      api: {
        sendMessage: async (input) =>
          console.log('mock: sqs.api.sendMessage', { input }),
      },
      url: '__url__',
    };

    when('using it with async task lifecycle', () => {
      /**
       * use the lifecycle
       */
      const enqueue = withAsyncTaskExecutionLifecycleEnqueue({
        getNew: exampleGetNew,
        dao: exampleDao,
        log: console,
        queue,
      });

      then('it should successfully allow enqueue', async () => {
        const enqueued = await enqueue({});
        expect(enqueued).toHaveProperty('status');
        expect(enqueued.status).toEqual(AsyncTaskStatus.QUEUED);
      });
    });
  });
});
