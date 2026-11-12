import type { LiveProvider } from '@refinedev/core';
import Pusher from 'pusher-js';
import PusherServer from 'pusher';
import { liveProvider, toPusherChannel, type LiveProviderOptions } from '../index.js';
import { publishLiveEvent, publishLiveEvents, resourceChannel } from '../server.js';

const pusher = new Pusher('key', { cluster: 'hkg', wsHost: 'ws.hibira.io', forceTLS: true });
const a: LiveProvider = liveProvider(pusher);
const opts: LiveProviderOptions = {
  channelPrefix: 'private-',
  publish: async (event, channel) => {
    await fetch('/api/live', { method: 'POST', body: JSON.stringify({ event, channel }) });
  },
};
const b: LiveProvider = liveProvider(pusher, opts);
liveProvider(pusher, { publish: false, channel: (c) => `private-tenant-1.${c}` });
const name: string = toPusherChannel('resources/posts');

const server = new PusherServer({ appId: '1', key: 'k', secret: 's', host: 'ws.hibira.io', useTLS: true });
await publishLiveEvent(server, { resource: 'posts', type: 'created', ids: [1] });
await publishLiveEvent(server, { channel: resourceChannel('posts'), type: 'updated', payload: { ids: ['a'] } }, { socketId: '1.1' });
await publishLiveEvents(server, [{ resource: 'posts', type: 'deleted', ids: [1, 2] }]);

// @ts-expect-error publish must be 'client', false or a function
liveProvider(pusher, { publish: 'server' });
// @ts-expect-error a live event needs a type
await publishLiveEvent(server, { resource: 'posts' });

export { a, b, name };
