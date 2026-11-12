import { LIVE_EVENT, CLIENT_LIVE_EVENT, toPusherChannel, resourceChannel, serializeLiveEvent } from './channel.js';

export { LIVE_EVENT, CLIENT_LIVE_EVENT, toPusherChannel, resourceChannel };

// Per pusher-js client: how many of our subscriptions use each channel, and
// whether we subscribed to it ourselves (so we never unsubscribe a channel
// that other code in the app opened first).
const registries = new WeakMap();

function registry(pusher) {
  let reg = registries.get(pusher);
  if (!reg) registries.set(pusher, (reg = new Map()));
  return reg;
}

function acquire(pusher, name) {
  const reg = registry(pusher);
  let entry = reg.get(name);
  if (!entry) {
    const owned = !pusher.channel(name);
    entry = { count: 0, owned, channel: pusher.subscribe(name) };
    reg.set(name, entry);
  }
  entry.count++;
  return entry.channel;
}

function release(pusher, name) {
  const reg = registry(pusher);
  const entry = reg.get(name);
  if (!entry) return;
  if (--entry.count > 0) return;
  reg.delete(name);
  if (entry.owned) pusher.unsubscribe(name);
}

function isClientEventChannel(name) {
  return name.startsWith('private-') || name.startsWith('presence-');
}

function reviveLiveEvent(data, channel) {
  const event = typeof data === 'string' ? JSON.parse(data) : data;
  return {
    ...event,
    channel: event.channel ?? channel,
    payload: event.payload ?? {},
    date: event.date ? new Date(event.date) : new Date(),
  };
}

function matches(event, types, params) {
  if (!types.includes('*') && !types.includes(event.type)) return false;
  if (event.type === 'created') return true;
  const eventIds = event.payload?.ids;
  const wanted = params?.ids ?? (params?.id !== undefined ? [params.id] : undefined);
  if (!Array.isArray(eventIds) || !Array.isArray(wanted)) return true;
  const ids = new Set(eventIds.map(String));
  return wanted.some((id) => ids.has(String(id)));
}

/**
 * A Refine liveProvider on a pusher-js client connected to Hibira (or any
 * Pusher-compatible server).
 */
export function liveProvider(pusher, options = {}) {
  if (!pusher || typeof pusher.subscribe !== 'function') {
    throw new TypeError('liveProvider(pusher): pass a pusher-js client (new Pusher(key, options))');
  }
  const publishMode = options.publish ?? 'client';
  const warned = new Set();
  const warnOnce = (key, message) => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[@hibira-io/refine] ${message}`);
  };

  return {
    subscribe({ channel, types, params, callback }) {
      const name = toPusherChannel(channel, options);
      const pusherChannel = acquire(pusher, name);
      const listener = (data) => {
        let event;
        try {
          event = reviveLiveEvent(data, channel);
        } catch {
          return;
        }
        if (matches(event, types ?? ['*'], params)) callback(event);
      };
      pusherChannel.bind(LIVE_EVENT, listener);
      pusherChannel.bind(CLIENT_LIVE_EVENT, listener);
      return { name, listener };
    },

    unsubscribe(subscription) {
      if (!subscription?.name) return;
      const { name, listener } = subscription;
      const pusherChannel = pusher.channel(name);
      if (pusherChannel) {
        pusherChannel.unbind(LIVE_EVENT, listener);
        pusherChannel.unbind(CLIENT_LIVE_EVENT, listener);
      }
      release(pusher, name);
    },

    publish(event) {
      if (publishMode === false) return;
      const name = toPusherChannel(event.channel, options);
      const data = serializeLiveEvent(event);
      if (typeof publishMode === 'function') {
        Promise.resolve()
          .then(() => publishMode(data, name))
          .catch((error) => warnOnce(`publish:${error}`, `publish failed: ${error?.message ?? error}`));
        return;
      }
      if (!isClientEventChannel(name)) {
        warnOnce(
          `public:${name}`,
          `not publishing to "${name}": browsers can only send events on private- or presence- channels. ` +
            "Set channelPrefix: 'private-', pass publish: (event, channel) => fetch(...) to send through your backend, " +
            'or publish: false if your backend already sends events.',
        );
        return;
      }
      const pusherChannel = acquire(pusher, name);
      const send = () => {
        try {
          pusherChannel.trigger(CLIENT_LIVE_EVENT, data);
        } finally {
          release(pusher, name);
        }
      };
      if (pusherChannel.subscribed) {
        send();
        return;
      }
      const cleanup = () => {
        pusherChannel.unbind('pusher:subscription_succeeded', onSucceeded);
        pusherChannel.unbind('pusher:subscription_error', onError);
      };
      const onSucceeded = () => {
        cleanup();
        send();
      };
      const onError = (status) => {
        cleanup();
        release(pusher, name);
        warnOnce(`auth:${name}`, `could not subscribe to "${name}" to publish (${JSON.stringify(status)})`);
      };
      pusherChannel.bind('pusher:subscription_succeeded', onSucceeded);
      pusherChannel.bind('pusher:subscription_error', onError);
    },
  };
}
