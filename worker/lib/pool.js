// Bounded-concurrency pool shared by every "run N thunks, at most `limit` at
// once, keep the result order" call site. Replaces three near-duplicate
// copies (worker/engine/engine.js and worker/engine/parallel-engine.js).
//
// `onError` is an optional (err, index) => value mapper for a thunk that
// throws; the default maps every failure to null so one bad thunk never
// rejects the whole batch. Worker count is clamped with
// Math.max(1, Math.min(limit, thunks.length)) so a caller-supplied limit of
// 0 or a negative number can never reach Array.from with a negative length
// (which throws RangeError). It always runs at least one worker.
export async function runPool(thunks, limit, onError) {
  const mapError = onError || (() => null);
  const results = new Array(thunks.length);
  let next = 0;

  const worker = async () => {
    while (next < thunks.length) {
      const index = next++;
      try {
        results[index] = await thunks[index]();
      } catch (err) {
        results[index] = mapError(err, index);
      }
    }
  };

  const workerCount = Math.max(1, Math.min(limit, thunks.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
