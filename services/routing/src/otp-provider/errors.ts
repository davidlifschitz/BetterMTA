export type OtpProviderErrorKind = "timeout" | "unavailable" | "bad_response";

/**
 * Thrown by OtpCandidateProvider when the OTP HTTP/GraphQL call fails.
 * Caught by runRouteSearch and mapped to library outcomes (timeout / data_unavailable).
 */
export class OtpProviderError extends Error {
  readonly kind: OtpProviderErrorKind;

  constructor(kind: OtpProviderErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OtpProviderError";
    this.kind = kind;
  }
}
