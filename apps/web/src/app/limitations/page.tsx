import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Beta limitations | BetterMTA",
  description:
    "Scope, data freshness, privacy, and safety limitations for BetterMTA.",
};

export default function LimitationsPage() {
  return (
    <main className="info-shell">
      <header className="info-header">
        <p className="info-kicker">Public beta</p>
        <h1>BetterMTA beta limitations</h1>
        <p>
          BetterMTA is designed for familiar NYC subway planning with the lines
          you prefer. This page explains what the beta does and does not cover.
        </p>
      </header>

      <section className="info-card" aria-labelledby="scope-heading">
        <h2 id="scope-heading">NYC subway-first scope</h2>
        <p>
          BetterMTA is not a complete regional trip planner. The beta does not
          promise bus, commuter rail, PATH, ferry, driving, cycling, or
          native-app coverage.
        </p>
      </section>

      <section className="info-card" aria-labelledby="freshness-heading">
        <h2 id="freshness-heading">Data freshness and route coverage</h2>
        <p>
          Routes depend on the available schedule, realtime feed, and candidate
          set. BetterMTA labels information as live, stale, schedule-only,
          synthetic, or unavailable. A missing route does not prove that no
          possible trip exists.
        </p>
      </section>

      <section className="info-card" aria-labelledby="preferences-heading">
        <h2 id="preferences-heading">Preferred lines</h2>
        <p>
          BetterMTA uses every selected line when feasible within the candidates
          it can validate. When that is not feasible, it ranks routes using the
          maximum feasible subset it found and names omitted preferences.
          Walking, transfers, and unselected connector lines may still be needed
          to complete a practical trip.
        </p>
      </section>

      <section className="info-card" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Privacy and accounts</h2>
        <p>
          No account is required. BetterMTA must not retain precise trip
          locations or preference history beyond an approved privacy and consent
          model. Address and place search stays disabled until its provider,
          attribution, privacy, and operating gates are approved.
        </p>
      </section>

      <section className="info-card" aria-labelledby="independence-heading">
        <h2 id="independence-heading">Independent beta</h2>
        <p>
          BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper,
          the MTA, or another product. Comparative statements require a
          published methodology and reproducible evidence. BetterMTA is not
          affiliated with or endorsed by the Metropolitan Transportation
          Authority.
        </p>
      </section>

      <section className="info-card" aria-labelledby="safety-heading">
        <h2 id="safety-heading">Travel safety</h2>
        <p>
          BetterMTA is not an emergency service. Confirm critical accessibility
          needs and urgent service conditions with official MTA information, and
          follow station staff, posted signs, alerts, and emergency instructions
          when they conflict with an app result.
        </p>
      </section>

      <nav className="info-actions" aria-label="Trip planner">
        <Link href="/">Back to trip planner</Link>
      </nav>
    </main>
  );
}
