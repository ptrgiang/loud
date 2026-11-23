# Data format

A collector is anything that writes these files into the data folder (`data/` inside the app's profile folder, or
`LOUD_DATA`). The build step reads them and writes `hub.json`; the dashboard reads only `hub.json`, `proposals.json` and
`history/`. Unknown fields are kept and ignored. Missing numbers should be left out or `null`, never
`0`: zero means "measured, none".

Times are strings `"YYYY-MM-DD HH:MM"` in the configured time zone.

## `<channel>.json`

`threads.json`, `ig.json`, `fb.json`, `x.json`:

```json
{
  "collected": "2026-11-20 09:00",
  "followers": 520,
  "posts": [
    {
      "id": "abc123",
      "url": "https://www.threads.com/@you/post/abc123",
      "posted": "2026-11-18 15:30",
      "text": "Shipped conditional logic today...",
      "kind": "post",
      "views": 1840,
      "likes": 61,
      "replies": 12,
      "reposts": 3,
      "quotes": 1,
      "shares": 4,
      "saves": 9,
      "follows": 2,
      "reach": 1500,
      "viewers": 1490,
      "visits": 20,
      "dur": 14.5,
      "format": "screen recording"
    }
  ],
  "scheduled": [{ "when": "2026-11-21 18:00", "text": "Caption of the queued post" }],
  "scheduled_known": true
}
```

| Field                                                           |                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `id`, `url`, `posted`, `text`                                   | Required for a post. `url` is linked only for the platforms' own domains                      |
| `kind`                                                          | `post`, `reel` or `reply`. Replies are kept apart from your own posts in every metric         |
| `views`                                                         | Views or plays as the platform counts them                                                    |
| `likes` `replies` `reposts` `quotes` `shares` `saves` `follows` | Per-post counts, where the platform has them                                                  |
| `reach`, `viewers`, `visits`                                    | Accounts reached, unique viewers, profile visits from the post                                |
| `dur`                                                           | Video length in seconds                                                                       |
| `format`                                                        | Free text, for your own grouping                                                              |
| `scheduled`                                                     | Queued posts. An empty list means "nothing scheduled"                                         |
| `scheduled_known`                                               | `false` when the collector could not read the queue (the app then does not claim it is empty) |
| `premium`                                                       | Paid tier when the platform exposes it (X Premium widens the post limit to 25,000)            |

## `listen.json`

```json
{
  "collected": "2026-11-20 09:05",
  "items": [
    {
      "channel": "x",
      "query": "typeform alternative",
      "url": "https://x.com/someone/status/1",
      "author": "someone",
      "posted": "2026-11-19 22:10",
      "text": "Looking for a typeform alternative that...",
      "lang": "en",
      "views": 3200,
      "likes": 40,
      "replies": 12,
      "reposts": 2,
      "shares": null
    }
  ]
}
```

`channel` is one of `threads`, `ig`, `fb`, `x`. The same post found by several keywords is merged by `url`, or by
channel + author + text when there is no `url`. `found` is the day the collector first saw an item; undated results
(`posted` missing) expire by `found`, fourteen days back.

## What `build` adds

`hub.json` holds `built`, `since`, `timezone`, `channels` (summaries), `posts` (every post with `channel`, `age_h` and
`eng`), `scheduled`, `flags` and `listen`. `history/<day>.json` holds one summary per channel per day.
`history/posts/<channel>-<id>.json` holds each post's counts keyed by day (`views`, `likes`, `replies`, `reposts`,
`quotes`, `shares`, `saves`, `eng`) — its trend.

## `proposals.json`

Written by the agent's `save_proposals` tool (or by you):

```json
{
  "written": "2026-11-20 10:00",
  "data_built": "2026-11-20 09:05",
  "summary": "Two or three sentences.",
  "audit": ["Threads: ..."],
  "items": [
    {
      "channel": "threads",
      "title": "...",
      "when": "Fri, 17:30",
      "format": "...",
      "hook": "Opening line",
      "outline": "1. ...\n2. ...",
      "why": "...",
      "evidence": [{ "label": "Best post", "url": "https://..." }]
    }
  ],
  "stop": ["Things to stop doing"]
}
```

## `drafts.json`

Posts being written, by the user or the agent. Loud never posts them.

```json
{
  "drafts": [
    {
      "id": "dlx3k9a2f",
      "channel": "x",
      "text": "Shipped conditional logic today...",
      "note": "For Friday afternoon",
      "by": "agent",
      "created": "2026-11-20 10:12",
      "updated": "2026-11-20 10:30"
    }
  ]
}
```

## `state.json`

What the collector last did per platform, so a run knows whether a full read since the start date is still due.

```json
{ "x": { "lastScan": "2026-11-20 09:00", "fullDone": "2026-11-12 08:40" } }
```

## In the profile, not the data folder

- `settings.json`: the app's settings.
- `limits.json`: the rate limiter per platform: `{ "x": { "day": "2026-11-20", "used": 42, "pausedUntil": null, "reason": null } }`. `pausedUntil` is a Unix time in milliseconds.
- `agent-chat.json`: the current agent conversation, until the user starts a new one.
- `agent-context.json`: what the agent's tool server may see (enabled channels, keywords, playbook); rewritten for each message.
