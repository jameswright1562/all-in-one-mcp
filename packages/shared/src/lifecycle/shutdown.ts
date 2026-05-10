type ShutdownTask = () => Promise<void> | void;

export async function shutdown(
  timeoutMs: number,
  tasks: ShutdownTask[],
): Promise<void> {
  await Promise.race([
    Promise.allSettled(tasks.map((task) => Promise.resolve().then(task))).then(
      () => undefined,
    ),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Shutdown timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    }),
  ]);
}
