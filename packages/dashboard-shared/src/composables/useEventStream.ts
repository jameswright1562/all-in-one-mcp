import { onBeforeUnmount } from "vue";

type EventHandlerMap = Record<
  string,
  (event: MessageEvent<string>) => void | Promise<void>
>;

export function useEventStream(
  createEventSource: () => EventSource,
  handlers: EventHandlerMap,
) {
  let eventSource: EventSource | null = null;

  function connect(): void {
    if (typeof window === "undefined" || eventSource) {
      return;
    }

    eventSource = createEventSource();

    for (const [eventName, handler] of Object.entries(handlers)) {
      eventSource.addEventListener(eventName, (event) => {
        void handler(event as MessageEvent<string>);
      });
    }
  }

  function disconnect(): void {
    eventSource?.close();
    eventSource = null;
  }

  onBeforeUnmount(() => {
    disconnect();
  });

  return {
    connect,
    disconnect,
  };
}
