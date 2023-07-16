/**
 * an error which indicates that the request that the client made is invalid
 *
 * specifically
 * - although the codepath is valid
 * - the inputs used by the client were logically invalid
 */
export class BadRequestError extends Error {
  constructor(message: string, metadata?: Record<any, any>) {
    super([message, JSON.stringify(metadata, null, 2)].join('\n'));
  }
}
