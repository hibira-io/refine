// A minimal in-memory stand-in for the pusher-js client API.
export class FakeChannel {
  constructor(name) {
    this.name = name;
    this.subscribed = false;
    this.handlers = new Map();
    this.triggered = [];
  }
  bind(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    return this;
  }
  unbind(event, fn) {
    this.handlers.get(event)?.delete(fn);
    return this;
  }
  emit(event, data) {
    for (const fn of [...(this.handlers.get(event) ?? [])]) fn(data);
  }
  listeners(event) {
    return this.handlers.get(event)?.size ?? 0;
  }
  trigger(event, data) {
    if (!this.subscribed) throw new Error('not subscribed');
    this.triggered.push({ event, data });
    return true;
  }
}

export class FakePusher {
  constructor() {
    this.channels = new Map();
    this.subscribes = [];
    this.unsubscribes = [];
  }
  subscribe(name) {
    this.subscribes.push(name);
    let ch = this.channels.get(name);
    if (!ch) this.channels.set(name, (ch = new FakeChannel(name)));
    return ch;
  }
  unsubscribe(name) {
    this.unsubscribes.push(name);
    this.channels.delete(name);
  }
  channel(name) {
    return this.channels.get(name);
  }
}
