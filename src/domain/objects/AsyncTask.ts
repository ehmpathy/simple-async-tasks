/**
 * the statuses an async-task can be in, describing its *execution lifecycle*
 *
 * note
 * - if your async task needs to track additional state for its *logical lifecycle*, consider using a `progress` property or `completedAt` timestamps to track its progress
 */
export enum AsyncTaskStatus {
  /**
   * the task will not be executed until something changes
   *
   * usecases
   * - waiting for user intervention
   * - waiting for some event
   */
  HALTED = 'HALTED',

  /**
   * the task is scheduled for execution
   *
   * usecases
   * - waiting a set amount of time until attempting it
   */
  SCHEDULED = 'SCHEDULED',

  /**
   * the task is queued for immediate execution
   */
  QUEUED = 'QUEUED',

  /**
   * the task is currently being attempted
   */
  ATTEMPTED = 'ATTEMPTED',

  /**
   * the task was executed successfully
   */
  FULFILLED = 'FULFILLED',

  /**
   * the task had a failure while executing
   */
  FAILED = 'FAILED',

  /**
   * the task was canceled and will never be executed
   */
  CANCELED = 'CANCELED',
}

/**
 * the minimum implementation of an async task
 */
export interface AsyncTask {
  uuid?: string;
  updatedAt?: string | Date;
  status: AsyncTaskStatus;
}
