# Private-beta support ledger template

Store the active ledger in an owner-restricted location, not in Git. Copy this shape and
keep only privacy-minimized references.

| Field | Value |
|---|---|
| Case ID | `PB-YYYYMMDD-NNN` |
| Opened / closed | ISO timestamps |
| Severity / status | `SEV-0..3` / `OPEN`, `MITIGATED`, `CLOSED` |
| Request ID | If provided; no tester identity |
| Approximate time window | Coarse window + timezone |
| Report category | route, preferred-line claim, place search, stale data, timeout, accessibility, privacy, other |
| Data mode / feed age | Privacy-safe runtime facts |
| Reproduction | Minimal station-based or synthetic case; no raw address |
| Mitigation | flag-off, workaround, rollback manifest ID, none |
| Evidence | Restricted incident path or public regression-test path |
| Engineering owner | Role/name approved for support access |
| Rider response sent | Timestamp only |
| Sensitive original deleted | Timestamp or not applicable |
| Follow-up / regression | Issue/test/runbook reference |

Never place tester emails, access credentials, private hostnames, raw address/POI text,
precise coordinates, encrypted PlaceRefs, or unrestricted screenshots in the ledger.
