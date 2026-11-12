import type { ChannelOptions, SerializedLiveEvent } from './channel.js';

export { LIVE_EVENT, CLIENT_LIVE_EVENT, toPusherChannel, resourceChannel } from './channel.js';
export type { ChannelOptions, SerializedLiveEvent } from './channel.js';

type Id = string | number;

/** Either a full Refine LiveEvent, or the short form { resource, type, ids }. */
export type LiveEventInput =
  | {
      channel: string;
      type: 'created' | 'updated' | 'deleted' | (string & {});
      payload?: { ids?: Id[]; [key: string]: unknown };
      date?: Date | string;
      meta?: Record<string, unknown>;
    }
  | {
      resource: string;
      type: 'created' | 'updated' | 'deleted' | (string & {});
      ids?: Id[];
      payload?: { ids?: Id[]; [key: string]: unknown };
      date?: Date | string;
      meta?: Record<string, unknown>;
    };

export interface PublishOptions extends ChannelOptions {
  /** Leave this connection out (the browser that made the change already refreshed). */
  socketId?: string;
}

/** The parts of the `pusher` Node SDK this uses. */
export interface PusherServerLike {
  trigger(channel: string | string[], event: string, data: unknown, params?: { socket_id?: string }): Promise<unknown>;
  triggerBatch(batch: Array<{ channel: string; name: string; data: unknown; socket_id?: string }>): Promise<unknown>;
}

export declare function publishLiveEvent(
  pusher: Pick<PusherServerLike, 'trigger'>,
  event: LiveEventInput,
  options?: PublishOptions,
): Promise<{ channel: string; event: SerializedLiveEvent }>;

export declare function publishLiveEvents(
  pusher: Pick<PusherServerLike, 'triggerBatch'>,
  events: LiveEventInput[],
  options?: PublishOptions,
): Promise<Array<{ channel: string; event: SerializedLiveEvent }>>;
