// univault/src/utils/promisePool.js
// Bounded-concurrency worker pool. Generic primitive (no Drive coupling) — COPY-01 / D-01.
// Spawns N long-running async workers that pull from a FIFO queue until empty or paused.
// API: new PromisePool({ concurrency }), submit(taskFn), pause(), resume(), drain().
//
// Drain-don't-abort policy (D-04 / D-12): pause() blocks workers BETWEEN tasks, not mid-task.
// In-flight taskFn invocations always complete; this is the no-orphan-duplicate invariant
// for files.copy (Drive does not document an idempotency token for that endpoint — see
// 07-RESEARCH.md Pitfall 4 and Assumption A6).

export const DEFAULT_CONCURRENCY = 3;

export class PromisePool {
  constructor(concurrency = DEFAULT_CONCURRENCY) {
    if (!(typeof concurrency === "number" && concurrency > 0)) {
      throw new Error("[PromisePool] concurrency must be a positive number");
    }
    this.concurrency = concurrency;
    this.queue = [];           // { taskFn, resolve, reject }
    this.activeCount = 0;      // tasks currently running (incremented before try, decremented in finally)
    this.paused = false;
    this.resumePromise = null; // workers await this when paused
    this.resumeResolve = null;
    this.workers = [];
    for (let i = 0; i < concurrency; i++) {
      this.workers.push(this._runWorker());
    }
  }

  submit(taskFn) {
    if (typeof taskFn !== "function") {
      throw new Error("[PromisePool] submit() requires a function");
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
    });
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.resumePromise = new Promise((r) => { this.resumeResolve = r; });
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    const r = this.resumeResolve;
    this.resumeResolve = null;
    this.resumePromise = null;
    r?.();
  }

  async drain() {
    // Wait until queue is empty AND all workers are idle.
    // Polling at 50ms is acceptable — drain is called once per run, not in a hot loop.
    // T-07-05: 50ms polling interval accepted; cost of event-emitter rewrite exceeds defect cost.
    while (this.queue.length > 0 || this.activeCount > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async _runWorker() {
    // Long-running loop — never throws (caught at item.reject so the worker survives).
    // Pitfall 4: activeCount incremented BEFORE try, decremented in finally — guarantees
    // drain() sees a consistent count even on taskFn exceptions.
    while (true) {
      if (this.paused) await this.resumePromise;
      const item = this.queue.shift();
      if (!item) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      this.activeCount++;
      try {
        const res = await item.taskFn();
        item.resolve(res);
      } catch (err) {
        item.reject(err);
      } finally {
        this.activeCount--;
      }
    }
  }
}
