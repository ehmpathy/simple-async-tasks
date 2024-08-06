import { DomainEntity, getUniqueIdentifier, serialize } from 'domain-objects';
import { getError, given, then, when } from 'test-fns';
import { HasMetadata } from 'type-fns';

import { uuid } from '../deps';
import { AsyncTaskStatus } from '../domain/objects/AsyncTask';
import { withAsyncTaskExecutionLifecycleEnqueue } from './withAsyncTaskExecutionLifecycleEnqueue';
import { withAsyncTaskExecutionLifecycleExecute } from './withAsyncTaskExecutionLifecycleExecute';

describe('withAsyncTaskExecutionLifecycleExecute', () => {
  given('a task class with an in memory dao and sqs driver', () => {
    interface AsyncTaskEnrichProduct {
      updatedAt?: Date;
      productUuid: string;
      status: AsyncTaskStatus;
    }
    class AsyncTaskEnrichProduct
      extends DomainEntity<AsyncTaskEnrichProduct>
      implements AsyncTaskEnrichProduct
    {
      public static unique = ['productUuid'] as const;
    }
    const database: Record<string, HasMetadata<AsyncTaskEnrichProduct>> = {};
    const daoAsyncTaskEnrichProduct = {
      upsert: jest.fn(
        async (input: {
          task: AsyncTaskEnrichProduct;
        }): Promise<HasMetadata<AsyncTaskEnrichProduct>> => {
          const withMetadata = new AsyncTaskEnrichProduct({
            ...input.task,
            updatedAt: new Date(),
          }) as HasMetadata<AsyncTaskEnrichProduct>;
          database[serialize(getUniqueIdentifier(withMetadata))] = withMetadata;
          return withMetadata;
        },
      ),
      findByUnique: jest.fn(
        async (input: {
          productUuid: string;
        }): Promise<null | HasMetadata<AsyncTaskEnrichProduct>> =>
          database[serialize({ productUuid: input.productUuid })] ?? null,
      ),
    };
    const executeInnerLogicMock = jest.fn();
    const sqsSendMessageMock = jest.fn();
    const execute = withAsyncTaskExecutionLifecycleExecute(
      async ({ task }) => {
        executeInnerLogicMock({ on: task });
        return {
          task: await daoAsyncTaskEnrichProduct.upsert({
            task: { ...task, status: AsyncTaskStatus.FULFILLED },
          }),
        };
      },
      {
        dao: daoAsyncTaskEnrichProduct,
        log: console,
        api: {
          sqs: {
            sendMessage: sqsSendMessageMock,
          },
        },
      },
    );

    beforeEach(() => {
      executeInnerLogicMock.mockReset();
      sqsSendMessageMock.mockReset();
    });

    when('asked to execute on a queued task', () => {
      const promiseTask = daoAsyncTaskEnrichProduct.upsert({
        task: new AsyncTaskEnrichProduct({
          productUuid: uuid(),
          status: AsyncTaskStatus.QUEUED,
        }),
      });

      then('it should successfully attempt to execute', async () => {
        const result = await execute({ task: await promiseTask });
        expect(executeInnerLogicMock).toHaveBeenCalledTimes(1);
        expect(result.task.status).toEqual(AsyncTaskStatus.FULFILLED);
      });
    });

    when(
      'asked to execute on a task which is already in ATTEMPTED mode, without sqs metadata',
      () => {
        const promiseTask = daoAsyncTaskEnrichProduct.upsert({
          task: new AsyncTaskEnrichProduct({
            productUuid: uuid(),
            status: AsyncTaskStatus.ATTEMPTED,
          }),
        });

        then(
          'it should throw an error, to trigger a retry later, without invoking the inner execution logic',
          async () => {
            const error = await getError(execute({ task: await promiseTask }));
            expect(error.message).toContain(
              'this error was thrown to ensure this task is retried later',
            );
          },
        );
      },
    );

    when(
      'asked to execute on a task which is already in ATTEMPTED mode, with sqs metadata',
      () => {
        const promiseTask = daoAsyncTaskEnrichProduct.upsert({
          task: new AsyncTaskEnrichProduct({
            productUuid: uuid(),
            status: AsyncTaskStatus.ATTEMPTED,
          }),
        });

        then(
          'it should sqs.sendMessage on the task, to try again later, without invoking the inner execution logic',
          async () => {
            const result = await execute({
              task: await promiseTask,
              meta: {
                queueUrl: '__queue_url__',
                enqueueUuid: uuid(),
                queueType: 'SQS',
                requeueDepth: 1,
              },
            });
            console.log(result);
            expect(sqsSendMessageMock).toHaveBeenCalledTimes(1);
            expect(executeInnerLogicMock).toHaveBeenCalledTimes(0);
          },
        );
      },
    );
  });
});
