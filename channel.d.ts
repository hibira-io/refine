export declare const LIVE_EVENT: 'refine';
export declare const CLIENT_LIVE_EVENT: 'client-refine';

export interface ChannelOptions {
  /** Prepended to every Pusher channel name, e.g. 'private-'. Default ''. */
  channelPrefix?: string;
  /** Maps a Refine channel ("resources/posts") to a Pusher channel name. Overrides channelPrefix. */
  channel?: (refineChannel: string) => string;
}

/** "resources/posts" → "resources.posts" (plus channelPrefix). */
export declare function toPusherChannel(channel: string, options?: ChannelOptions): string;

/** "posts" → "resources/posts", the channel Refine's data hooks subscribe to. */
export declare function resourceChannel(resource: string): string;

/** A LiveEvent as sent over the wire (the date is an ISO string). */
export interface SerializedLiveEvent {
  channel: string;
  type: string;
  payload: { ids?: Array<string | number>; [key: string]: unknown };
  date: string;
  meta?: Record<string, unknown>;
}
