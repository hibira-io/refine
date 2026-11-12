# Refine + Hibira live example

A headless Refine app (`@refinedev/core` + `@refinedev/simple-rest`) with an orders table that updates live in every open window. A small Node API keeps the orders in memory, signs private channels, and publishes a live event after every change with `publishLiveEvent`.

```sh
cp .env.example .env   # fill in your app's keys from the Hibira console
npm install
node --env-file=.env server.mjs &
npx vite
```

Open http://localhost:5173 in two windows and press **Next status**, **Add order** or **Delete** in one of them. The other window refreshes and lists the event under **Live events**.

The browser sends its socket id in `X-Socket-Id`, so the API leaves the window that made the change out (Refine already refreshed it).
