import { UniDuration, sleep } from '@ehmpathy/uni-time';
import type { LogMethods } from 'simple-leveled-log-methods';

/**
 * function which calls the wrapped function and runs it again one time if an error is caught
 */
export const withRetry = <T extends (...args: any[]) => Promise<any>>(
  logic: T,
  options?: {
    delay?: UniDuration;
    log?: LogMethods;
  },
): T => {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await logic(...args);
    } catch (error: any) {
      if (options?.log)
        options.log.warn('withRetry.progress: caught an error, will retry', {
          errorMessage: error.message,
        });
      if (options?.delay) await sleep(options.delay);
      return await logic(...args);
    }
  }) as T;
};
