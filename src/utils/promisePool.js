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
    this.closed = false;       // BL-01: terminate worker fibers + release polling timers
    this.workers = [];
    for (let i = 0; i < concurrency; i++) {
      this.workers.push(this._runWorker());
    }
  }

  submit(taskFn) {
    if (typeof taskFn !== "function") {
      throw new Error("[PromisePool] submit() requires a function");
    }
    if (this.closed) {
      return Promise.reject(new Error("[PromisePool] submit() on closed pool"));
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

  // BL-01: close() flips the closed flag, wakes paused workers so they observe the
  // flag and exit cleanly, and rejects any items still queued so awaiters don't hang.
  // Idempotent — repeated calls are no-ops.
  close() {
    if (this.closed) return;
    this.closed = true;
    // Wake any worker awaiting resumePromise so it can observe `closed`.
    const r = this.resumeResolve;
    this.resumeResolve = null;
    this.resumePromise = null;
    r?.();
    // Reject any unstarted submissions so callers awaiting pool.submit(...) don't hang.
    const stranded = this.queue.splice(0);
    for (const item of stranded) {
      item.reject(new Error("[PromisePool] pool closed before task ran"));
    }
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
    // BL-01: loop exits when this.closed === true so close() releases worker fibers
    // and their 50ms polling timers (otherwise each runCopyQueue leaks 3 zombie workers).
    while (!this.closed) {
      if (this.paused && !this.closed) await this.resumePromise;
      if (this.closed) return;
      const item = this.queue.shift();
      if (!item) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      // WR-01: re-check pause after shift. pause() may have been called between
      // the paused-check above and the shift; if so, put the item back and yield
      // to the pause loop so the task doesn't slip through after pause() returned.
      if (this.paused && !this.closed) {
        this.queue.unshift(item);
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
