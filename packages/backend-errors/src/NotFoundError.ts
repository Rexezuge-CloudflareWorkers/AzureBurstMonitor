import { ErrorCode, IServiceError } from './IServiceError';

class NotFoundError extends IServiceError {
  constructor(message?: string | undefined) {
    super(message ?? 'The requested resource was not found.');
  }

  public getErrorCode(): ErrorCode {
    return 404;
  }

  public getErrorType(): string {
    return 'NotFound';
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

export { NotFoundError };
