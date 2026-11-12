import type { LiveProvider } from '@refinedev/core';
import type Pusher from 'pusher-js';
import type { ChannelOptions, SerializedLiveEvent } from './channel.js';

export { LIVE_EVENT, CLIENT_LIVE_EVENT, toPusherChannel, resourceChannel } from './channel.js';
export type { ChannelOptions, SerializedLiveEvent } from './channel.js';

export interface LiveProviderOptions extends ChannelOptions {
  /**
   * How `publish` (called by Refine after a mutation) sends the event.
   * - 'client' (default): a Pusher client event. Needs a private- or presence- channel
   *   (channelPrefix: 'private-') and client events turned on for the app.
   * - a function: you send it, e.g. POST it to your backend, which calls publishLiveEvent.
   * - false: don't publish from the browser (your backend sends the events).
   */
  publish?: 'client' | false | ((event: SerializedLiveEvent, pusherChannel: string) => void | Promise<void>);
}

/** Anything with the pusher-js client API, e.g. `new Pusher(...)` or `echo.connector.pusher`. */
export type PusherClient = Pick<Pusher, 'subscribe' | 'unsubscribe' | 'channel'>;

export declare function liveProvider(pusher: PusherClient, options?: LiveProviderOptions): LiveProvider;
