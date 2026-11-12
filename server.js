import { LIVE_EVENT, CLIENT_LIVE_EVENT, toPusherChannel, resourceChannel, serializeLiveEvent } from './channel.js';

export { LIVE_EVENT, CLIENT_LIVE_EVENT, toPusherChannel, resourceChannel };

const BATCH_LIMIT = 10;

function normalize(event) {
  if (!event || typeof event !== 'object') throw new TypeError('expected a live event object');
  const channel = event.channel ?? (event.resource !== undefined ? resourceChannel(event.resource) : undefined);
  if (!channel) throw new TypeError('a live event needs a channel ("resources/posts") or a resource ("posts")');
  if (!event.type) throw new TypeError('a live event needs a type ("created", "updated", "deleted" or your own)');
  const payload = event.payload ?? (event.ids !== undefined ? { ids: event.ids } : {});
  return serializeLiveEvent({ channel, type: event.type, payload, date: event.date, meta: event.meta });
}

function triggerParams(options) {
  return options.socketId ? { socket_id: options.socketId } : undefined;
}

/**
 * Sends one Refine live event from your backend with the `pusher` Node SDK.
 * Every browser on the channel refreshes the affected queries.
 */
export async function publishLiveEvent(pusher, event, options = {}) {
  const data = normalize(event);
  const channel = toPusherChannel(data.channel, options);
  const params = triggerParams(options);
  if (params) await pusher.trigger(channel, LIVE_EVENT, data, params);
  else await pusher.trigger(channel, LIVE_EVENT, data);
  return { channel, event: data };
}

/** Sends many live events, 10 per request (the Pusher batch limit). */
export async function publishLiveEvents(pusher, events, options = {}) {
  const sent = events.map((event) => {
    const data = normalize(event);
    return { channel: toPusherChannel(data.channel, options), event: data };
  });
  for (let i = 0; i < sent.length; i += BATCH_LIMIT) {
    const batch = sent.slice(i, i + BATCH_LIMIT).map(({ channel, event }) => ({
      channel,
      name: LIVE_EVENT,
      data: event,
      ...(options.socketId ? { socket_id: options.socketId } : {}),
    }));
    await pusher.triggerBatch(batch);
  }
  return sent;
}
