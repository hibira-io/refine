# Changelog

## 0.1.0

- `liveProvider(pusher, options)`: a Refine `liveProvider` on pusher-js, for Hibira and any Pusher-compatible server. `liveMode: "auto"` lists, records and `useSubscription` work as with `@refinedev/ably`. Refine channels like `resources/posts` map to valid Pusher names (`resources.posts`, with an optional `channelPrefix` such as `private-`). Hooks on the same channel share one subscription, and a channel that other code opened first is never unsubscribed.
- Publishing from the browser: Pusher client events on private channels (default), your own function (for example a POST to your backend), or off.
- `publishLiveEvent()` and `publishLiveEvents()` (`@hibira-io/refine/server`): send live events from your backend with the `pusher` Node SDK, with `socketId` to skip the tab that made the change. Batches go 10 per request.
