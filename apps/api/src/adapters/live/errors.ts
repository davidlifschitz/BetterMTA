/** Thrown by live adapters when an upstream dependency cannot serve truthfully. */
export class DataUnavailableError extends Error {
  readonly code = "data_unavailable" as const;

  constructor(message: string) {
    super(message);
    this.name = "DataUnavailableError";
  }
}

export function isDataUnavailableError(
  err: unknown,
): err is DataUnavailableError {
  return (
    err instanceof DataUnavailableError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "data_unavailable" &&
      err instanceof Error)
  );
}
