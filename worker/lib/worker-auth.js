/**
 * Shared authentication helpers for internal endpoints and worker-authenticated requests.
 */

// Constant-time string comparison. Hash both sides to fixed-length SHA-256
// digests so the byte-compare loop runs the full length regardless of where
// (or whether) the inputs first differ — no early-out timing side-channel.
export async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function isWorkerAuthed(request, env) {
  const secret = request.headers.get('X-Worker-Secret');
  if (!env.WORKER_SECRET || !secret) return false;
  return timingSafeEqual(secret, env.WORKER_SECRET);
}
