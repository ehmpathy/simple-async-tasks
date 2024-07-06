import { UnexpectedCodePathError } from '@ehmpathy/error-fns';
import type { SQSEvent } from 'aws-lambda';
import { HasMetadata } from 'type-fns';

import { SimpleAsyncTaskEnqueueMetadata } from './withAsyncTaskExecutionLifecycleEnqueue';

/**
 * a queue parcel contains both the task and meta about how the task was enqueued
 */
export interface AsyncTaskQueueParcel<T extends Record<string, any>> {
  /**
   * the task contained within the parcel
   */
  task: HasMetadata<T>;

  /**
   * metadata about how this parcel was enqueued
   */
  meta?: SimpleAsyncTaskEnqueueMetadata;
}

/**
 * method to extract an async task parcel from an sqs event sent to an aws-lambda
 */
export const extractTaskParcelFromSqsEvent = <T extends Record<string, any>>(
  event: SQSEvent,
) => {
  // extract the body
  if (event.Records.length > 1)
    throw new UnexpectedCodePathError(
      'more than one message delivered in sqs event. this should not occur', // fail fast, this should not occur for observability
      { event },
    );

  // delay if needed
  // todo: support delay
  // const { requeued } = await requeueToDelayMessageIfNeeded({
  //   record: event.Records[0]!,
  // });
  // if (requeued) return { delayed: true }; // stop here if we requeued the message due to sqs scheduling

  // parse the body
  const message = event.Records[0]!.body;
  const body = JSON.parse(message) as AsyncTaskQueueParcel<T>;
  if (!body.task)
    throw new UnexpectedCodePathError(
      'could not find task on sqs message body',
      {
        body,
      },
    );
  return { task: body.task, meta: body.meta };
};
