import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveProvider, toPusherChannel, resourceChannel, LIVE_EVENT, CLIENT_LIVE_EVENT } from '../index.js';
import { publishLiveEvent, publishLiveEvents } from '../server.js';
import { FakePusher } from './fake-pusher.mjs';

const wire = (type, ids, extra = {}) => ({
  channel: 'resources/posts',
  type,
  payload: ids === undefined ? {} : { ids },
  date: '2026-11-12T00:00:00.000Z',
  ...extra,
});

test('channel names: "/" is not allowed by Pusher, prefix and custom mapping', () => {
  assert.equal(toPusherChannel('resources/posts'), 'resources.posts');
  assert.equal(toPusherChannel('resources/posts', { channelPrefix: 'private-' }), 'private-resources.posts');
  assert.equal(toPusherChannel('a b/c#d'), 'a.b.c.d');
  assert.equal(toPusherChannel('resources/posts', { channel: (c) => `private-t1.${c.split('/')[1]}` }), 'private-t1.posts');
  assert.equal(resourceChannel('posts'), 'resources/posts');
});

test('subscribe binds both event names and delivers a LiveEvent with a Date', () => {
  const pusher = new FakePusher();
  const live = liveProvider(pusher);
  const got = [];
  live.subscribe({ channel: 'resources/posts', types: ['*'], callback: (e) => got.push(e) });
  const ch = pusher.channel('resources.posts');
  ch.emit(LIVE_EVENT, wire('updated', [1]));
  ch.emit(CLIENT_LIVE_EVENT, wire('created', [2]));
  assert.equal(got.length, 2);
  assert.ok(got[0].date instanceof Date);
  assert.equal(got[0].date.toISOString(), '2026-11-12T00:00:00.000Z');
  assert.deepEqual(got[0].payload, { ids: [1] });
  assert.equal(got[1].type, 'created');
});

test('types filter', () => {
  const pusher = new FakePusher();
  const got = [];
  liveProvider(pusher).subscribe({ channel: 'resources/posts', types: ['deleted'], callback: (e) => got.push(e.type) });
  const ch = pusher.channel('resources.posts');
  ch.emit(LIVE_EVENT, wire('updated', [1]));
  ch.emit(LIVE_EVENT, wire('deleted', [1]));
  assert.deepEqual(got, ['deleted']);
});

test('ids filter: string/number agnostic, created always passes, id param for useOne', () => {
  const pusher = new FakePusher();
  const many = [];
  const one = [];
  const live = liveProvider(pusher);
  live.subscribe({ channel: 'resources/posts', types: ['*'], params: { ids: ['1', 2] }, callback: (e) => many.push(e.payload.ids) });
  live.subscribe({ channel: 'resources/posts', types: ['*'], params: { id: 3 }, callback: (e) => one.push(e.payload.ids) });
  const ch = pusher.channel('resources.posts');
  ch.emit(LIVE_EVENT, wire('updated', [1]));
  ch.emit(LIVE_EVENT, wire('updated', ['2', 9]));
  ch.emit(LIVE_EVENT, wire('updated', [9]));
  ch.emit(LIVE_EVENT, wire('deleted', ['3']));
  ch.emit(LIVE_EVENT, wire('created', [10]));
  ch.emit(LIVE_EVENT, wire('updated'));
  assert.deepEqual(many, [[1], ['2', 9], [10], undefined]);
  assert.deepEqual(one, [['3'], [10], undefined]);
});

test('JSON string data and malformed data', () => {
  const pusher = new FakePusher();
  const got = [];
  liveProvider(pusher).subscribe({ channel: 'resources/posts', types: ['*'], callback: (e) => got.push(e) });
  const ch = pusher.channel('resources.posts');
  ch.emit(LIVE_EVENT, JSON.stringify({ type: 'updated', payload: { ids: [1] } }));
  ch.emit(LIVE_EVENT, '{not json');
  assert.equal(got.length, 1);
  assert.equal(got[0].channel, 'resources/posts');
  assert.ok(got[0].date instanceof Date);
});

test('shared channel: unsubscribe only when the last subscription goes', () => {
  const pusher = new FakePusher();
  const live = liveProvider(pusher);
  const a = live.subscribe({ channel: 'resources/posts', types: ['*'], callback: () => {} });
  const b = live.subscribe({ channel: 'resources/posts', types: ['*'], callback: () => {} });
  const ch = pusher.channel('resources.posts');
  assert.equal(ch.listeners(LIVE_EVENT), 2);
  live.unsubscribe(a);
  assert.equal(ch.listeners(LIVE_EVENT), 1);
  assert.deepEqual(pusher.unsubscribes, []);
  live.unsubscribe(b);
  assert.equal(ch.listeners(LIVE_EVENT), 0);
  assert.equal(ch.listeners(CLIENT_LIVE_EVENT), 0);
  assert.deepEqual(pusher.unsubscribes, ['resources.posts']);
  live.unsubscribe(undefined);
});

test('never unsubscribes a channel other code opened first', () => {
  const pusher = new FakePusher();
  pusher.subscribe('resources.posts');
  const live = liveProvider(pusher);
  live.unsubscribe(live.subscribe({ channel: 'resources/posts', types: ['*'], callback: () => {} }));
  assert.deepEqual(pusher.unsubscribes, []);
});

test('publish: client event on a private channel once subscribed', () => {
  const pusher = new FakePusher();
  const live = liveProvider(pusher, { channelPrefix: 'private-' });
  live.publish({ channel: 'resources/posts', type: 'updated', payload: { ids: [5] }, date: new Date('2026-11-12T00:00:00Z') });
  const ch = pusher.channel('private-resources.posts');
  assert.equal(ch.triggered.length, 0);
  ch.subscribed = true;
  ch.emit('pusher:subscription_succeeded');
  assert.deepEqual(ch.triggered, [{ event: CLIENT_LIVE_EVENT, data: wire('updated', [5]) }]);
  assert.deepEqual(pusher.unsubscribes, ['private-resources.posts']);
  assert.equal(ch.listeners('pusher:subscription_succeeded'), 0);
  assert.equal(ch.listeners('pusher:subscription_error'), 0);
});

test('publish: reuses a live subscription and keeps it', () => {
  const pusher = new FakePusher();
  const live = liveProvider(pusher, { channelPrefix: 'private-' });
  live.subscribe({ channel: 'resources/posts', types: ['*'], callback: () => {} });
  const ch = pusher.channel('private-resources.posts');
  ch.subscribed = true;
  live.publish({ channel: 'resources/posts', type: 'deleted', payload: { ids: [1] }, date: new Date() });
  assert.equal(ch.triggered.length, 1);
  assert.deepEqual(pusher.unsubscribes, []);
});

test('publish: subscription error releases and warns', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const pusher = new FakePusher();
  const live = liveProvider(pusher, { channelPrefix: 'private-' });
  live.publish({ channel: 'resources/posts', type: 'updated', payload: {}, date: new Date() });
  pusher.channel('private-resources.posts').emit('pusher:subscription_error', { status: 403 });
  assert.deepEqual(pusher.unsubscribes, ['private-resources.posts']);
  assert.equal(warn.mock.callCount(), 1);
});

test('publish: public channel warns once and sends nothing', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const pusher = new FakePusher();
  const live = liveProvider(pusher);
  live.publish({ channel: 'resources/posts', type: 'updated', payload: {}, date: new Date() });
  live.publish({ channel: 'resources/posts', type: 'updated', payload: {}, date: new Date() });
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(pusher.subscribes, []);
});

test('publish: function mode and false', async () => {
  const pusher = new FakePusher();
  const sent = [];
  liveProvider(pusher, { publish: (event, channel) => sent.push([channel, event]) }).publish({
    channel: 'resources/posts',
    type: 'created',
    payload: { ids: [7] },
    date: new Date('2026-11-12T00:00:00Z'),
    meta: { dataProviderName: 'default' },
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(sent, [['resources.posts', wire('created', [7], { meta: { dataProviderName: 'default' } })]]);
  liveProvider(pusher, { publish: false }).publish({ channel: 'resources/posts', type: 'created', payload: {}, date: new Date() });
  assert.deepEqual(pusher.subscribes, []);
});

test('rejects a missing client', () => {
  assert.throws(() => liveProvider(undefined), TypeError);
});

test('server: publishLiveEvent short and full forms, socketId', async () => {
  const calls = [];
  const pusher = { trigger: async (...args) => calls.push(args) };
  const r = await publishLiveEvent(pusher, { resource: 'posts', type: 'updated', ids: [1], date: '2026-11-12T00:00:00.000Z' }, { socketId: '1.2' });
  assert.equal(r.channel, 'resources.posts');
  assert.deepEqual(calls[0], ['resources.posts', LIVE_EVENT, wire('updated', [1]), { socket_id: '1.2' }]);
  await publishLiveEvent(pusher, { channel: 'resources/posts', type: 'deleted', payload: { ids: [2] } }, { channelPrefix: 'private-' });
  assert.equal(calls[1].length, 3);
  assert.equal(calls[1][0], 'private-resources.posts');
  assert.match(calls[1][2].date, /^\d{4}-\d\d-\d\dT/);
  await assert.rejects(publishLiveEvent(pusher, { type: 'updated' }), TypeError);
  await assert.rejects(publishLiveEvent(pusher, { resource: 'posts' }), TypeError);
});

test('server: publishLiveEvents batches by 10', async () => {
  const batches = [];
  const pusher = { triggerBatch: async (b) => batches.push(b) };
  const events = Array.from({ length: 23 }, (_, i) => ({ resource: 'posts', type: 'updated', ids: [i] }));
  const sent = await publishLiveEvents(pusher, events, { socketId: '9.9' });
  assert.equal(sent.length, 23);
  assert.deepEqual(batches.map((b) => b.length), [10, 10, 3]);
  assert.equal(batches[0][0].name, LIVE_EVENT);
  assert.equal(batches[0][0].socket_id, '9.9');
});
