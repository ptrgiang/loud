# Platform notes

Where each platform keeps the numbers Loud reads, as observed in November 2026 through a logged-in browser.
Platforms change these without notice; when a collector breaks, this is the map to check first. Query ids
(`doc_id`, X `queryId`) rotate, which is why collectors learn them from the page instead of hard-coding them.

## Threads

| Flow              | Source                                                                                                                             | Fields                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your posts        | Embedded JSON `BarcelonaProfileThreadsTabDirectQueryRelayPreloader` on your profile                                                | `thread_items`, `code`, `taken_at`, `like_count`, `direct_reply_count`, `repost_count`, `reshare_count`, `page_info.end_cursor`                                         |
| Per-post insights | Embedded `BarcelonaPostViewCountQueryRelayPreloader` and `BarcelonaRightPanelSelfPostInsightsQueryRelayPreloader` on the post page | `text_post_app_info.impression_count` (views), `post_insights.reach_count`, `num_media_follows`, `profile_visit_count`, `viewsOverTime`                                 |
| Scheduled         | Composer → Drafts: `POST /api/graphql` → `data.xth_threads_viewer.drafts.nodes[]`                                                  | Keep `schedule_publish_status == "SCHEDULED"`; `schedule_publish_time` (Unix seconds), `draft_thread_items.nodes[].text`. Count: `data.xth_viewer.scheduled_post_count` |
| Search            | Search page, Top or Recent: `POST /graphql/query`                                                                                  | `data.searchResults.edges`, `thread_items`, time, likes, replies, reposts, shares, `page_info.end_cursor`. No view counts on other people's posts                       |

## Instagram

| Flow              | Source                                                                                                                                          | Fields                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reel numbers      | `GET /api/v1/media/{mediaId}/info/` in the logged-in page, header `X-IG-App-ID`. Shortcodes are converted to numeric ids first                  | `items[0]`: `code`, `taken_at`, `play_count`, `ig_play_count`, `like_count`, `comment_count`, `reshare_count`, `video_duration`                                                                        |
| Per-reel insights | `/insights/media/{mediaId}/` sends `POST /api/graphql`; match `data.media.instagram_media_id`                                                   | `umapi_*` fields: views, reach, viewers, interactions, saves, shares, follows. `results: []` means "no result yet", not zero                                                                           |
| Scheduled         | `/scheduled_content/` sends `POST /api/graphql` → `data.viewer.all_scheduled_ig_content`                                                        | `scheduled_publish_time`, `caption_text`                                                                                                                                                               |
| Search            | `/explore/search/keyword/?q=...` sends `PolarisKeywordSearchExplorePageRelayQuery` → `data.xdt_fbsearch__top_serp_graphql.edges[].node.items[]` | `pk`, `code`, `media_type`, `user`, `caption`, `taken_at`, `like_count`, `comment_count`, `view_count` when present. Search returns old posts too: filter `taken_at` before asking for details by `pk` |

The profile page also loads other accounts' media in the same shape (suggested reels), so a profile item is kept only
when the handle is its `user`, `owner` or one of its `coauthor_producers`; the info answer is checked the same way.

## Facebook (Pages)

| Flow                  | Source                                                                                                             | Fields                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Posts and performance | Meta Business Suite → Content → Published: `POST /api/graphql/` → `tofu_unified_table` (also embedded in the HTML) | Views, reactions, comments, shares, 3-second and 1-minute views, ThruPlays, watch time, exact `created_at`             |
| Scheduled             | Business Suite → Content → Scheduled: `data.entity_list.content.edges`                                             | An empty list with `has_next_page: false` is "nothing scheduled"                                                       |
| Video search          | Search → Videos/Reels: `POST /api/graphql/` → `serpResponse`                                                       | `results`, `video_id`, `video_owner_profile`, `open_video_uri`, `video_duration_text`. Engagement needs the video page |

The public Reels tab embeds `profile_reel_node` with `play_count_reduced`, a rounded display value: prefer Business Suite.

## X

| Flow       | Request the page sends                                                                       | Fields                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your posts | `GET /i/api/graphql/{queryId}/UserOriginalsTimeline` (and `UserRepliesTimeline` for replies) | id, time, text, `views`, `favorite_count`, `reply_count`, `retweet_count`, `quote_count`, `bookmark_count`                                              |
| Scheduled  | `GET /i/api/graphql/{queryId}/FetchScheduledTweets`                                          | `data.viewer.scheduled_tweet_list`                                                                                                                      |
| Followers  | `UserByScreenName`                                                                           | `followers_count`                                                                                                                                       |
| Search     | `GET /i/api/graphql/{queryId}/SearchTimeline`, `product: Latest` or `Top`                    | Posts and counters under `tweet_results`. Replaying the request outside the page returns `403` (each request is signed), so X search is read from a tab |

## General flow

1. Read the list of your posts; keep id, link, time and the numbers the list has.
2. Read insights by id for the posts that need more, at most 40 per run: the rest are stored with the list's numbers
   and read on later runs. Keep the collection time with every number. When the list reached past the start date, a
   stored post it did not show is dropped.
3. Read the queue. Keep "empty" and "could not read" as different states.
4. Search each keyword, keep the keyword and the Top/Latest filter with each result, filter by date before asking for
   details.
