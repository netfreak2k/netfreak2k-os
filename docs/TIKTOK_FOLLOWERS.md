# TikTok followers widget – integration preparation

Account: https://www.tiktok.com/@netfreak2k

## Current state

The dashboard contains a responsive TikTok Community tile with profile link and **no fictitious live value**. It displays `–` and `Statistik noch nicht verbunden` until data collection is configured. It sends no TikTok credentials from browser JavaScript.

## Official connection plan

1. Register the application in TikTok for Developers: https://developers.tiktok.com/
2. Configure Login Kit for Web and an HTTPS OAuth redirect URI under the deployed N2K installation's own hostname.
3. Request approval for `user.info.basic` and `user.info.stats`. The latter permits `follower_count`.
4. Add a backend-only OAuth authorization/code-exchange/refresh-token flow. Bind the callback to an authenticated N2K admin account; validate OAuth state and redirect URI; protect against CSRF.
5. Store credentials/token data encrypted or in a restrictive server-side secret store, never in `dashboard/index.html`, JS, git or container logs.
6. Fetch `GET https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count` using a valid user bearer token. Enforce timeout, reasonable polling interval, backoff and rate limits. Check API errors explicitly.
7. Persist timestamped daily follower snapshots server-side to enable a real 7-day trend. Until at least two valid data points exist, show '–' rather than estimated growth.
8. Expose an **authenticated**, read-only `/api/social/tiktok` route returning only safe widget data: `{connected, follower_count, updated_at, delta_7d, status}`. Never expose tokens.
9. Show `not_connected`, `expired`, `rate_limited`, `error`, `stale` and `ready` distinctly in UI. Add a disconnect/revoke control.
10. Test clean install, token expiry, no network access, revoked permissions, iPhone 15 Pro responsive layout, and browser reload. Do not promise follower counts before TikTok app approval and user consent.

The research API is a different, restricted program; this installation uses TikTok Login Kit with user-authorized scopes. No scraper or fragile unauthenticated page parser is used.

Useful TikTok docs:
- https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info
- https://developers.tiktok.com/doc/tiktok-api-scopes

## Release gate

The tile is a UI-only scaffold and **does not display live followers yet**. Backend OAuth/token workflows require separate implementation, code review and developer app approval before they can be enabled for users.
