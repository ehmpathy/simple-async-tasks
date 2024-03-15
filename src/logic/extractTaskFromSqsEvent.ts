import { UnexpectedCodePathError } from '@ehmpathy/error-fns';
import type { SQSEvent } from 'aws-lambda';

/**
 * method to extract an async task from an sqs event sent to an aws-lambda
 */
export const extractTaskFromSqsEvent = <T>(event: SQSEvent) => {
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

  // parse the body into task
  const message = event.Records[0]!.body;
  const body = JSON.parse(message) as { task: T };
  if (!body.task)
    throw new UnexpectedCodePathError(
      'could not find task on sqs message body',
      {
        body,
      },
    );
  return body.task;
};
