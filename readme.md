# simple-async-tasks

easily create and use async-tasks within a pit-of-success

# install

```
npm install simple-async-tasks
```

# use

### define your async task

define the domain object of the async task you want to be able to run

```ts
import { DomainEntity } from 'domain-objects';
import { AsyncTask, AsyncTaskStatus } from 'simple-async-tasks';

/**
 * for example: an async task for emitting some data to remote persistance
 */
export interface AsyncTaskEmitToRemote extends AsyncTask {
  uuid?: string;
  updatedAt?: string;
  status: AsyncTaskStatus;

  /**
   * the endpoint to emit the data to
   */
  endpoint: string;

  /**
   * the payload to emit
   *
   * note
   * - supports string and binary buffer
   */
  payload: string | Buffer;
}
export class AsyncTaskEmitToRemote
  extends DomainEntity<AsyncTaskEmitToRemote>
  implements AsyncTaskEmitToRemote
{
  public static unique = ['endpoint', 'payload'];
}
```

### define your dao

define the database-access-object we can use to persist this async-task

usually, you should be using a library to code-generate or instantiate the dao for you
  - e.g., [sql-dao-generator](https://github.com/ehmpathy/sql-dao-generator)
  - e.g., [dynamodb-dao-generator](https://github.com/ehmpathy/dynamodb-dao-generator)
  - e.g., [cache-dao-generator](https://github.com/ehmpathy/simple-cache-dao)

for example
```ts
import { createCacheDao } from 'simple-cache-dao';
import { createCache } from 'simple-in-memory-cache';

const daoTaskEmitToRemote = createCacheDao({ cache: createCache() })
```

### define how to queue

define how to queue your task for execution

```ts
import { createQueue, QueueOrder } from 'simple-in-memory-queue';

// TODO: load all queued tasks from db on page load
export const asyncTaskEmitToRemoteQueue = createQueue<AsyncTaskEmitToRemote>({
  order: QueueOrder.FIRST_IN_FIRST_OUT,
});

export const queueTaskEmitToRemote = withAsyncTaskExecutionLifecycleQueue({
  dao: daoTaskEmitToRemote,
  queue: asyncTaskEmitToRemoteQueue,
  getNew: ({ endpoint, payload }) =>
    new AsyncTaskEmitToRemote({
      status: AsyncTaskStatus.QUEUED,
      endpoint,
      payload,
    }),
});
```

### define how to execute

define how to execute your async task

```ts
export const executeTaskEmitToRemote = withAsyncTaskExecutionLifecycleExecute(
  async ({ task }: { task: HasMetadata<AsyncTaskEmitToRemote> }) => {
    // execute your logic

    // mark it as fulfilled
    await daoTaskEmitToRemote.upsert({ task: { ...task, status: AsyncTaskStatus.FULFILLED }})
  },
  {
    dao: daoTaskEmitToRemote,
  },
);
```

***⚠️ note: you must change the status of the task away from attempted by the time the execute function resolves to some non-attempted , otherwise it will be considered a failure***

### define the execution trigger

define the trigger that will consume from your queue and invoke the execute function

note
- this will vary based on which queue implementation you use
- for example,
  - if using aws.sqs, you will probably invoke an aws.lambda with an [aws.event-source-mapping](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping)
  - if using a simple-in-memory-queue, you may choose to use a [resilient remote consumer](https://github.com/ehmpathy/simple-in-memory-queue#resilient-remote-consumer)
