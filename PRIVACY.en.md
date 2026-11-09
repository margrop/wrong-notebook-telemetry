# Privacy

This service stores counts aggregated by UTC day, application version, deployment platform and limited dimensions, error fingerprint counts, and maintainer settings. Each error fingerprint also keeps the first sanitized message sample, normalized top application frame, ID-free path, deployment platform and render digest. Source code is public; data is visible only to the maintainer.

It does not store user or instance identifiers, questions, OCR content, AI conversations, full error stacks or user agents. The first error message sample is sanitized and truncated but may still contain residual text; only one sample is kept per fingerprint. The ingest API does not use authentication cookies and rejects extra fields.

For rate limiting only, the application temporarily reads a trusted proxy's source IP and derives an in-memory key with a random per-process HMAC secret. Neither the IP nor that key is persisted or logged. Hosting providers may retain access and security logs containing IP addresses under their own policies.

Daily aggregates and application usage records are retained for 400 days. Fingerprints not seen within that window are removed; first-seen metadata and lifetime totals remain while a fingerprint stays active. Anonymous records cannot be located or deleted by individual or instance identity.

The maintainer session cookie is HttpOnly, SameSite=Strict and Secure in production, expires after seven days, and is used only for dashboard access. Rotating the password or signing secret revokes existing sessions.

Reports may be duplicated, missing or forged and are intended only for trend analysis. Instance administrators control forwarding; consent and opt-out behavior belong to the instance application.
