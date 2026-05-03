# Steam Completion Companion

A Millennium plugin that adds completion-focused game info directly to Steam store and library pages.

## Current status

Early development prototype.

Working:
- Store page injection for `store.steampowered.com/app/<appid>`
- Library game page injection
- Frontend to Lua backend bridge
- WebKit to Lua backend bridge
- JSON request/response routing

Planned:
- Estimated average completion time
- Restricted achievement warnings
- Paid DLC notes
- Broken but obtainable achievements
- Conditionally obtainable achievements
- Unobtainable achievements
- Local caching

## Development

Install dependencies:

```powershell
pnpm install