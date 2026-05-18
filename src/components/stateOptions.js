// src/components/stateOptions.js
// D-10 state enumeration. Neutral module — no React, no side effects.
// Imported by BentoDashboard.jsx AND DevPanel.jsx (04b) to avoid a circular import.
// Adding/removing keys here is a planning decision; never edit ad-hoc.

export const STATE_OPTIONS = Object.freeze({
  auth:   Object.freeze(['disconnected', 'source-only', 'dest-only', 'both', 'expired']),
  scan:   Object.freeze(['idle', 'scanning', 'done', 'error']),
  queue:  Object.freeze(['idle', 'mirroring', 'copying', 'paused', 'done', 'failed-with-retries']),
  gauge:  Object.freeze(['empty', 'partial', 'projected', 'over-quota']),
  resume: Object.freeze(['no-cursor', 'cursor-present']),
});
