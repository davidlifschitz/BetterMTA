"use client";

type StateMessageProps = {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
};

export function StateMessage({
  title,
  body,
  actionLabel,
  onAction,
  testId,
}: StateMessageProps) {
  return (
    <div className="state-message" role="status" data-testid={testId}>
      <h2>{title}</h2>
      <p>{body}</p>
      {actionLabel && onAction ? (
        <button type="button" className="btn-secondary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="state-message" role="status" aria-live="polite" data-testid="loading-state">
      <h2>Finding routes…</h2>
      <p>Checking schedules and your selected lines.</p>
      <div className="skeleton" aria-hidden="true" />
      <div className="skeleton" aria-hidden="true" />
    </div>
  );
}
