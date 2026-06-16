// Single source of truth for the DB-status → public-API-status vocabulary the
// frontend polls on. DB statuses: pending | processing | complete | failed.
// API vocabulary: queued/processing pass through; complete → completed; failed → error.
export function apiStatus(dbStatus) {
  if (dbStatus === 'complete') return 'completed';
  if (dbStatus === 'failed') return 'error';
  return dbStatus; // pending | processing
}
