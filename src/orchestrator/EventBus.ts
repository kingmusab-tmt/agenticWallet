type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<T>(event: string, handler: Handler<T>): void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as Handler<unknown>);
    this.handlers.set(event, set);
  }

  emit<T>(event: string, payload: T): void {
    const set = this.handlers.get(event);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler(payload as unknown);
    }
  }
}
