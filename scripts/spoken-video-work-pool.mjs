export function createWorkPool(limit, {onError = () => {}} = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid work pool limit");
  const active = new Set();
  return {
    get size() { return active.size; },
    get hasCapacity() { return active.size < limit; },
    start(work) {
      if (active.size >= limit) throw new Error("Work pool is full");
      let observed;
      observed = Promise.resolve().then(work).catch(error => onError(error)).finally(() => active.delete(observed));
      active.add(observed);
      return observed;
    },
    async waitForCapacity() {
      if (active.size >= limit) await Promise.race(active);
    },
    async drain() { await Promise.allSettled(active); },
  };
}

export function createWorkGate(limit) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid work gate limit");
  let active = 0;
  const waiting = [];
  const acquire = async onWait => {
    if (active < limit) { active += 1; return; }
    await onWait?.();
    await new Promise(resolve => waiting.push(resolve));
    active += 1;
  };
  const release = () => {
    active = Math.max(0, active - 1);
    waiting.shift()?.();
  };
  return {
    get active() { return active; },
    get queued() { return waiting.length; },
    async run(work, {onWait} = {}) {
      await acquire(onWait);
      try { return await work(); }
      finally { release(); }
    },
  };
}
