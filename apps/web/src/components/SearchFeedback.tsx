"use client";

import { useId, useState } from "react";
import { track } from "@/lib/analytics";
import { shouldShowFeedback } from "@/lib/mode";

type SearchFeedbackProps = {
  requestId: string;
};

/**
 * Anonymous thumbs feedback tied to a search requestId only.
 * Gated by shouldShowFeedback() (live + flag off → never mount / no stub path).
 * Never attaches coordinates or OD address free text.
 */
export function SearchFeedback({ requestId }: SearchFeedbackProps) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const commentId = useId();

  // Defense in depth: live builds with flag off must not render or stub.
  if (!shouldShowFeedback()) {
    return null;
  }

  function submit() {
    if (!rating || submitted) return;
    const trimmed = comment.trim().slice(0, 280);
    track("feedback_submitted", {
      requestId,
      rating,
      hasComment: trimmed.length > 0,
      ...(trimmed ? { comment: trimmed } : {}),
    });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="feedback" data-testid="feedback-thanks" role="status">
        <p>Thanks — feedback saved for this search.</p>
        <p className="hint">
          Fixture-mode stub: logged via analytics (no network beacon).
        </p>
      </div>
    );
  }

  return (
    <div className="feedback" data-testid="search-feedback">
      <p className="feedback__title">Was this search helpful?</p>
      <div className="feedback__ratings" role="group" aria-label="Feedback rating">
        <button
          type="button"
          className={`btn-secondary${rating === "up" ? " is-active" : ""}`}
          aria-pressed={rating === "up"}
          onClick={() => setRating("up")}
        >
          Thumbs up
        </button>
        <button
          type="button"
          className={`btn-secondary${rating === "down" ? " is-active" : ""}`}
          aria-pressed={rating === "down"}
          onClick={() => setRating("down")}
        >
          Thumbs down
        </button>
      </div>
      <label className="field" htmlFor={commentId}>
        <span>Optional comment</span>
        <input
          id={commentId}
          type="text"
          maxLength={280}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Short note (no addresses needed)"
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        className="btn-primary"
        disabled={!rating}
        onClick={submit}
      >
        Send feedback
      </button>
      <p className="hint">
        Tied to search id only. Fixture-mode stub uses the analytics pathway.
      </p>
    </div>
  );
}
