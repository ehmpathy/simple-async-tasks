import { paramCase } from 'change-case';
import type { DomainObject } from 'domain-objects';

import { AsyncTask } from '../../domain/objects/AsyncTask';

export type ClassOf<T> = new (...args: any[]) => T;

export const getSqsQueueUrlForTask = async (
  input: ClassOf<DomainObject<AsyncTask>>,
  context: {
    config: {
      aws: {
        account: string;
      };
      project: string;
      environment: {
        access: 'prod' | 'dev' | 'test';
      };
    };
  },
) => {
  const taskName = input.name;
  return [
    'https://sqs.us-east-1.amazonaws.com',
    `/${context.config.aws.account}/`,
    `${context.config.project}-${context.config.environment.access}-${paramCase(
      taskName,
    )}-llq`,
  ].join('');
};
