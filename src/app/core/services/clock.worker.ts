/// <reference lib="webworker" />

const timers = new Map<number, ReturnType<typeof setInterval>>();

addEventListener('message', ({ data }) => {
  if (!data || typeof data !== 'object') {
    return;
  }

  if (data.cmd === 'start') {
    const id = Number(data.id);
    const ms = Number(data.ms);

    if (!Number.isFinite(id) || !Number.isFinite(ms) || ms <= 0) {
      return;
    }

    const existing = timers.get(id);

    if (existing !== undefined) {
      clearInterval(existing);
    }

    timers.set(
      id,
      setInterval(() => {
        postMessage(id);
      }, ms),
    );

    return;
  }

  if (data.cmd === 'stop') {
    const id = Number(data.id);
    const existing = timers.get(id);

    if (existing !== undefined) {
      clearInterval(existing);
      timers.delete(id);
    }
  }
});

postMessage('ready');