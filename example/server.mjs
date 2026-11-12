// A tiny REST API for the example: in-memory orders that the Refine app reads
// with @refinedev/simple-rest. After every change it publishes a Refine live
// event, so every open admin tab refreshes. It also signs private channels.
import http from 'node:http';
import Pusher from 'pusher';
import { publishLiveEvent } from '@hibira-io/refine/server';

const env = process.env;
const tls = (env.HIBIRA_TLS ?? '1') === '1';
const pusher = new Pusher({
  appId: env.HIBIRA_APP_ID,
  key: env.HIBIRA_KEY,
  secret: env.HIBIRA_SECRET,
  host: env.HIBIRA_HOST ?? 'ws.hibira.io',
  ...(env.HIBIRA_PORT ? { port: env.HIBIRA_PORT } : {}),
  useTLS: tls,
});
const live = { channelPrefix: 'private-' };

let nextId = 6;
const orders = [
  { id: 1, customer: 'Aiko Tanaka', item: 'Snowboard', status: 'pending', total: 420 },
  { id: 2, customer: 'Min-jun Park', item: 'Ski goggles', status: 'paid', total: 89 },
  { id: 3, customer: 'Lin Wei', item: 'Down jacket', status: 'shipped', total: 260 },
  { id: 4, customer: 'Somchai P.', item: 'Wax kit', status: 'pending', total: 25 },
  { id: 5, customer: 'Nguyen An', item: 'Helmet', status: 'paid', total: 140 },
];

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};
const readBody = async (req) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw;
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const [, api, resource, id] = url.pathname.split('/');
    const socketId = req.headers['x-socket-id'] || undefined;
    if (api !== 'api') return json(res, 404, { error: 'not found' });

    if (resource === 'hibira' && id === 'auth' && req.method === 'POST') {
      // Check your own session here before signing.
      const form = new URLSearchParams(await readBody(req));
      return json(res, 200, pusher.authorizeChannel(form.get('socket_id'), form.get('channel_name')));
    }
    if (resource !== 'orders') return json(res, 404, { error: 'not found' });

    if (req.method === 'GET' && !id) {
      return json(res, 200, orders, { 'x-total-count': String(orders.length), 'access-control-expose-headers': 'x-total-count' });
    }
    const order = orders.find((o) => String(o.id) === id);
    if (req.method === 'GET') return order ? json(res, 200, order) : json(res, 404, {});
    if (req.method === 'POST' && !id) {
      const created = { ...JSON.parse(await readBody(req)), id: nextId++ };
      orders.push(created);
      await publishLiveEvent(pusher, { resource: 'orders', type: 'created', ids: [created.id] }, { ...live, socketId });
      return json(res, 201, created);
    }
    if (!order) return json(res, 404, {});
    if (req.method === 'PATCH' || req.method === 'PUT') {
      Object.assign(order, JSON.parse(await readBody(req)), { id: order.id });
      await publishLiveEvent(pusher, { resource: 'orders', type: 'updated', ids: [order.id] }, { ...live, socketId });
      return json(res, 200, order);
    }
    if (req.method === 'DELETE') {
      orders.splice(orders.indexOf(order), 1);
      await publishLiveEvent(pusher, { resource: 'orders', type: 'deleted', ids: [order.id] }, { ...live, socketId });
      return json(res, 200, order);
    }
    json(res, 405, {});
  })
  .listen(3001, '127.0.0.1', () => console.log('API on http://127.0.0.1:3001'));
