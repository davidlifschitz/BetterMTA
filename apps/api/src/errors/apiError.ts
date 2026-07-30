import type { ApiErrorCode } from "../types.js";

const HTTP_BY_CODE: Record<ApiErrorCode, number> = {
  invalid_input: 400,
  unknown_place: 400,
  unknown_line: 400,
  no_transit_path: 404,
  incomplete_selected_line_satisfaction: 200,
  insufficient_candidate_coverage: 503,
  timeout: 504,
  data_unavailable: 503,
  stale_realtime: 200,
  rate_limited: 429,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;
  readonly requestId: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    requestId: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = HTTP_BY_CODE[code];
    this.requestId = requestId;
    this.details = details;
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId: this.requestId,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function httpStatusForCode(code: ApiErrorCode): number {
  return HTTP_BY_CODE[code];
}
