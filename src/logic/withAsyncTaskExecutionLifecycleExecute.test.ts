import { asUniDateTime, subDuration } from '@ehmpathy/uni-time';
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

  given(
    'a task class with an in memory dao, sqs driver, and mutex keys',
    () => {
      interface AsyncTaskSyncProspects {
        updatedAt?: Date;
        forAgentUuid: string;
        perOpportunityUuid: string;
        status: AsyncTaskStatus;
      }
      class AsyncTaskSyncProspects
        extends DomainEntity<AsyncTaskSyncProspects>
        implements AsyncTaskSyncProspects
      {
        public static unique = ['perOpportunityUuid'] as const;
        public static mutex = ['forAgentUuid'] as const;
      }
      const database: Record<string, HasMetadata<AsyncTaskSyncProspects>> = {};
      const daoAsyncTaskSyncProspects = {
        upsert: jest.fn(
          async (input: {
            task: AsyncTaskSyncProspects;
            mockUpdatedAt?: Date;
          }): Promise<HasMetadata<AsyncTaskSyncProspects>> => {
            const withMetadata = new AsyncTaskSyncProspects({
              ...input.task,
              updatedAt: input.mockUpdatedAt ?? new Date(),
            }) as HasMetadata<AsyncTaskSyncProspects>;
            database[serialize(getUniqueIdentifier(withMetadata))] =
              withMetadata;
            return withMetadata;
          },
        ),
        findByUnique: jest.fn(
          async (input: {
            perOpportunityUuid: string;
          }): Promise<null | HasMetadata<AsyncTaskSyncProspects>> =>
            database[
              serialize({ perOpportunityUuid: input.perOpportunityUuid })
            ] ?? null,
        ),
        findByMutex: jest.fn(
          async (input: { forAgentUuid: string; status: AsyncTaskStatus }) =>
            Object.values(database).filter(
              (task) =>
                task.forAgentUuid === input.forAgentUuid &&
                task.status === input.status,
            ),
        ),
      };
      const executeInnerLogicMock = jest.fn();
      const sqsSendMessageMock = jest.fn();
      const execute = withAsyncTaskExecutionLifecycleExecute(
        async ({ task }) => {
          executeInnerLogicMock({ on: task });
          return {
            task: await daoAsyncTaskSyncProspects.upsert({
              task: { ...task, status: AsyncTaskStatus.FULFILLED },
            }),
          };
        },
        {
          dao: daoAsyncTaskSyncProspects,
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
        then('it should successfully attempt to execute', async () => {
          const task = await daoAsyncTaskSyncProspects.upsert({
            task: new AsyncTaskSyncProspects({
              forAgentUuid: uuid(),
              perOpportunityUuid: uuid(),
              status: AsyncTaskStatus.QUEUED,
            }),
          });
          const result = await execute({ task });
          expect(executeInnerLogicMock).toHaveBeenCalledTimes(1);
          expect(result.task.status).toEqual(AsyncTaskStatus.FULFILLED);
        });
      });

      when(
        'asked to execute on a queued task with an attempted mutex peer',
        () => {
          then(
            'it should retry later since mutex is reserved by peer',
            async () => {
              const task = await daoAsyncTaskSyncProspects.upsert({
                task: new AsyncTaskSyncProspects({
                  forAgentUuid: uuid(),
                  perOpportunityUuid: uuid(),
                  status: AsyncTaskStatus.QUEUED,
                }),
              });
              await daoAsyncTaskSyncProspects.upsert({
                task: new AsyncTaskSyncProspects({
                  forAgentUuid: task.forAgentUuid,
                  perOpportunityUuid: uuid(),
                  status: AsyncTaskStatus.ATTEMPTED, // in attempted status
                }),
              });

              const error = await getError(execute({ task }));
              expect(error.message).toContain(
                'this error was thrown to ensure this task is retried later',
              );
              expect(error.message).toContain(
                'mutex lock is reserved by at least one other task currently being attempted',
              );
            },
          );
        },
      );

      when(
        'asked to execute on a queued task with an attempted mutex peer which was last updated over 17 min ago',
        () => {
          then('it should successfully attempt to execute', async () => {
            const task = await daoAsyncTaskSyncProspects.upsert({
              task: new AsyncTaskSyncProspects({
                forAgentUuid: uuid(),
                perOpportunityUuid: uuid(),
                status: AsyncTaskStatus.QUEUED,
              }),
            });
            await daoAsyncTaskSyncProspects.upsert({
              task: new AsyncTaskSyncProspects({
                forAgentUuid: task.forAgentUuid,
                perOpportunityUuid: uuid(),
                status: AsyncTaskStatus.ATTEMPTED, // in attempted status
              }),
              mockUpdatedAt: new Date(
                subDuration(asUniDateTime(new Date()), {
                  minutes: 17,
                }),
              ),
            });
            const result = await execute({ task });
            expect(executeInnerLogicMock).toHaveBeenCalledTimes(1);
            expect(result.task.status).toEqual(AsyncTaskStatus.FULFILLED);
          });
        },
      );
    },
  );
});
