import { useState } from 'react';
import { Refine, useList, useUpdate, useCreate, useDelete, type LiveEvent } from '@refinedev/core';
import dataProvider from '@refinedev/simple-rest';
import axios from 'axios';
import Pusher from 'pusher-js';
import { liveProvider } from '@hibira-io/refine';

const host = import.meta.env.VITE_HIBIRA_HOST ?? 'ws.hibira.io';
const port = import.meta.env.VITE_HIBIRA_PORT ? Number(import.meta.env.VITE_HIBIRA_PORT) : undefined;

const pusher = new Pusher(import.meta.env.VITE_HIBIRA_KEY, {
  cluster: 'hkg',
  wsHost: host,
  ...(port ? { wsPort: port, wssPort: port, forceTLS: false, enabledTransports: ['ws'] as const } : { forceTLS: true }),
  channelAuthorization: { endpoint: '/api/hibira/auth', transport: 'ajax' },
});

// Tell the API which connection made the change, so it is not sent back to us.
const http = axios.create();
http.interceptors.request.use((config) => {
  const socketId = pusher.connection.socket_id;
  if (socketId) config.headers.set('X-Socket-Id', socketId);
  return config;
});

const STATUSES = ['pending', 'paid', 'shipped', 'delivered'] as const;
type Order = { id: number; customer: string; item: string; status: (typeof STATUSES)[number]; total: number };

export function App() {
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  return (
    <Refine
      dataProvider={dataProvider('/api', http)}
      // The API publishes every change; browsers only listen.
      liveProvider={liveProvider(pusher, { channelPrefix: 'private-', publish: false })}
      options={{ liveMode: 'auto', disableTelemetry: true }}
      onLiveEvent={(event) => setFeed((f) => [event, ...f].slice(0, 6))}
      resources={[{ name: 'orders' }]}
    >
      <main style={styles.main}>
        <h1 style={{ margin: 0 }}>Orders</h1>
        <p style={{ color: '#555', marginTop: 4 }}>Open this page in two windows. Changes show up in both, live.</p>
        <Orders />
        <Feed events={feed} />
      </main>
    </Refine>
  );
}

function Orders() {
  const { result, query } = useList<Order>({ resource: 'orders', pagination: { mode: 'off' } });
  const { mutate: update } = useUpdate<Order>();
  const { mutate: create } = useCreate<Order>();
  const { mutate: remove } = useDelete<Order>();
  if (query.isLoading) return <p>Loading…</p>;

  const advance = (o: Order) =>
    update({ resource: 'orders', id: o.id, values: { status: STATUSES[(STATUSES.indexOf(o.status) + 1) % STATUSES.length] } });

  return (
    <>
      <table style={styles.table}>
        <thead>
          <tr>
            {['#', 'Customer', 'Item', 'Total', 'Status', ''].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.data.map((o) => (
            <tr key={o.id}>
              <td style={styles.td}>{o.id}</td>
              <td style={styles.td}>{o.customer}</td>
              <td style={styles.td}>{o.item}</td>
              <td style={styles.td}>${o.total}</td>
              <td style={styles.td}>
                <span style={{ ...styles.badge, ...badgeColors[o.status] }}>{o.status}</span>
              </td>
              <td style={{ ...styles.td, textAlign: 'right' }}>
                <button style={styles.button} onClick={() => advance(o)} data-testid={`advance-${o.id}`}>Next status</button>{' '}
                <button style={styles.ghost} onClick={() => remove({ resource: 'orders', id: o.id })} data-testid={`delete-${o.id}`}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        style={{ ...styles.button, marginTop: 12 }}
        data-testid="create"
        onClick={() => create({ resource: 'orders', values: { customer: 'New customer', item: 'Gloves', status: 'pending', total: 35 } })}
      >
        Add order
      </button>
    </>
  );
}

function Feed({ events }: { events: LiveEvent[] }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16 }}>Live events</h2>
      {events.length === 0 && <p style={{ color: '#777' }}>Waiting for changes from another window…</p>}
      <ul style={{ paddingLeft: 18, fontFamily: 'ui-monospace, monospace', fontSize: 13 }} data-testid="feed">
        {events.map((e, i) => (
          <li key={i}>
            {e.date.toLocaleTimeString()} {e.type} {e.channel} ids={JSON.stringify(e.payload.ids)}
          </li>
        ))}
      </ul>
    </section>
  );
}

const badgeColors: Record<Order['status'], { background: string; color: string }> = {
  pending: { background: '#fff4d6', color: '#8a5a00' },
  paid: { background: '#dff3ff', color: '#0b5c8a' },
  shipped: { background: '#e8e3ff', color: '#4b2bb3' },
  delivered: { background: '#dcf5e3', color: '#1d6b37' },
};

const styles = {
  main: { fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '32px auto', padding: '0 16px' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: 16 },
  th: { textAlign: 'left' as const, borderBottom: '1px solid #ddd', padding: '8px 6px', fontSize: 13, color: '#555' },
  td: { borderBottom: '1px solid #eee', padding: '8px 6px', fontSize: 14 },
  badge: { padding: '2px 8px', borderRadius: 999, fontSize: 12 },
  button: { background: '#111', color: '#fff', border: 0, borderRadius: 6, padding: '6px 10px', cursor: 'pointer' },
  ghost: { background: 'transparent', color: '#b42318', border: '1px solid #f1c0bb', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' },
};
