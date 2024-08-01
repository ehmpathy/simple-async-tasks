import { DomainEntity } from 'domain-objects';

import { AsyncTask, AsyncTaskStatus } from '../../domain/objects/AsyncTask';
import { getSqsQueueUrlForTask } from './getSqsQueueUrlForTask';

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
class AsyncTaskEmitToRemote
  extends DomainEntity<AsyncTaskEmitToRemote>
  implements AsyncTaskEmitToRemote {}

describe('getSqsQueueUrlForTask', () => {
  it('should define queue url accurately based on config and task name', async () => {
    const url = await getSqsQueueUrlForTask(AsyncTaskEmitToRemote, {
      config: {
        aws: {
          account: '__account_id__',
        },
        project: 'svc-doitall',
        environment: {
          access: 'prod',
        },
      },
    });
    expect(url).toEqual(
      'https://sqs.us-east-1.amazonaws.com/__account_id__/svc-doitall-prod-async-task-emit-to-remote-llq',
    );
  });
});
