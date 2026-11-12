// End-to-end test against a running Hibira (or Pusher-compatible) server with
// client events on for the app. Skipped unless HIBIRA_E2E_KEY is set:
//
//   HIBIRA_E2E_HOST=127.0.0.1 HIBIRA_E2E_PORT=6001 HIBIRA_E2E_TLS=0 \
//   HIBIRA_E2E_APP_ID=... HIBIRA_E2E_KEY=... HIBIRA_E2E_SECRET=... npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Pusher from 'pusher-js';
import PusherServer from 'pusher';
import { liveProvider } from '../../index.js';
import { publishLiveEvent, publishLiveEvents } from '../../server.js';

const env = process.env;
const skip = !env.HIBIRA_E2E_KEY && 'set HIBIRA_E2E_KEY to run';
const host = env.HIBIRA_E2E_HOST ?? '127.0.0.1';
const port = Number(env.HIBIRA_E2E_PORT ?? 8080);
const tls = env.HIBIRA_E2E_TLS === '1';

const server = skip
  ? null
  : new PusherServer({ appId: env.HIBIRA_E2E_APP_ID, key: env.HIBIRA_E2E_KEY, secret: env.HIBIRA_E2E_SECRET, host, port: String(port), useTLS: tls });

const client = () =>
  new Pusher(env.HIBIRA_E2E_KEY, {
    cluster: 'e2e',
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: tls,
    enabledTransports: ['ws'],
    channelAuthorization: { customHandler: ({ socketId, channelName }, cb) => cb(null, server.authorizeChannel(socketId, channelName)) },
  });

const subscribed = (pusher, name) =>
  new Promise((resolve, reject) => {
    const ch = pusher.channel(name);
    if (ch?.subscribed) return resolve();
    ch.bind('pusher:subscription_succeeded', resolve);
    ch.bind('pusher:subscription_error', reject);
  });

const next = (events, count = 1, ms = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out with ${events.length}/${count} events`)), ms);
    const check = () => (events.length >= count ? (clearTimeout(timer), resolve(events)) : setTimeout(check, 10));
    check();
  });

test('backend publishes, Refine subscription receives (ids filter, socketId exclusion)', { skip, timeout: 20000 }, async () => {
  const pusher = client();
  const live = liveProvider(pusher, { channelPrefix: 'private-' });
  const all = [];
  const one = [];
  const subAll = live.subscribe({ channel: 'resources/posts', types: ['*'], callback: (e) => all.push(e) });
  live.subscribe({ channel: 'resources/posts', types: ['updated'], params: { ids: [2] }, callback: (e) => one.push(e) });
  await subscribed(pusher, 'private-resources.posts');

  await publishLiveEvent(server, { resource: 'posts', type: 'updated', ids: [1] }, { channelPrefix: 'private-' });
  await publishLiveEvent(server, { resource: 'posts', type: 'updated', ids: [2] }, { channelPrefix: 'private-' });
  await publishLiveEvents(server, [{ resource: 'posts', type: 'created', ids: [3] }], { channelPrefix: 'private-' });
  await next(all, 3);
  assert.deepEqual(all.map((e) => [e.type, e.payload.ids]), [['updated', [1]], ['updated', [2]], ['created', [3]]]);
  assert.ok(all[0].date instanceof Date);
  assert.equal(all[0].channel, 'resources/posts');
  assert.deepEqual(one.map((e) => e.payload.ids), [[2]]);

  await publishLiveEvent(server, { resource: 'posts', type: 'deleted', ids: [4] }, { channelPrefix: 'private-', socketId: pusher.connection.socket_id });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(all.length, 3, 'the excluded socket gets nothing');

  live.unsubscribe(subAll);
  assert.ok(pusher.channel('private-resources.posts'), 'still subscribed for the second hook');
  pusher.disconnect();
});

test('browser publish: a client event reaches the other tab', { skip, timeout: 20000 }, async () => {
  const tabA = client();
  const tabB = client();
  const liveA = liveProvider(tabA, { channelPrefix: 'private-' });
  const liveB = liveProvider(tabB, { channelPrefix: 'private-' });
  const got = [];
  const sub = liveB.subscribe({ channel: 'resources/orders', types: ['*'], callback: (e) => got.push(e) });
  await subscribed(tabB, 'private-resources.orders');

  liveA.publish({ channel: 'resources/orders', type: 'updated', payload: { ids: [42] }, date: new Date() });
  await next(got, 1);
  assert.equal(got[0].type, 'updated');
  assert.deepEqual(got[0].payload.ids, [42]);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(tabA.channel('private-resources.orders'), undefined, 'tab A unsubscribed after publishing');

  liveB.unsubscribe(sub);
  assert.equal(tabB.channel('private-resources.orders'), undefined);
  tabA.disconnect();
  tabB.disconnect();
});
