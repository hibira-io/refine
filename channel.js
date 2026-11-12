// Shared by the client and the server entry points.

/** Event name for live events sent from a backend. */
export const LIVE_EVENT = 'refine';

/** Event name for live events sent by browsers (Pusher client events must start with "client-"). */
export const CLIENT_LIVE_EVENT = 'client-refine';

const INVALID = /[^A-Za-z0-9_\-=@,.;]/g;

/**
 * Turns a Refine channel ("resources/posts") into a Pusher channel name
 * ("resources.posts"). Pusher channel names cannot hold "/", so every
 * character outside [A-Za-z0-9_-=@,.;] becomes ".".
 */
export function toPusherChannel(channel, options = {}) {
  if (typeof options.channel === 'function') return options.channel(channel);
  return (options.channelPrefix ?? '') + String(channel).replace(INVALID, '.');
}

/** The Refine channel a resource's events go to, the same one Refine's hooks subscribe to. */
export function resourceChannel(resource) {
  return `resources/${resource}`;
}

/** A LiveEvent as JSON: the date becomes an ISO string. */
export function serializeLiveEvent(event) {
  const date = event.date instanceof Date ? event.date : new Date(event.date ?? Date.now());
  return {
    channel: event.channel,
    type: event.type,
    payload: event.payload ?? {},
    date: date.toISOString(),
    ...(event.meta !== undefined ? { meta: event.meta } : {}),
  };
}
