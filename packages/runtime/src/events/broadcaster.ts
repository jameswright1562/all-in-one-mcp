export type EventListener<TEvent> = (event: TEvent) => void | Promise<void>;

export class EventBroadcaster<TEvent> {
  private readonly listeners = new Set<EventListener<TEvent>>();

  subscribe(listener: EventListener<TEvent>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: TEvent): void {
    for (const listener of this.listeners) {
      void Promise.resolve(listener(event)).catch(() => {
        // Listener failures should not break the main runtime.
      });
    }
  }
}
