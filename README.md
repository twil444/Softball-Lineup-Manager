# Softball Lineup Manager

This is a lightweight cross-platform lineup app built as a static web app.

## What it does

- Manages two separate teams
- Works with flexible roster sizes
- Lets you set batting order
- Lets you assign 10 field positions for each inning
- Balances bench innings as evenly as possible
- Lets you define up to four preferred defensive options per player, including `OF` for any outfield spot
- Still lets you manually adjust any inning
- Includes offline game scoring with hits, walks, strikeouts, outs, inning tracking, and base runners
- Saves data in the browser so it stays on the device

## Positions included

- P
- C
- 1B
- 2B
- 3B
- SS
- LF
- LCF
- RCF
- RF

## How to use it

1. Open [index.html](C:\Users\signa\OneDrive\Softball\index.html) in a browser on Windows.
2. Rename each team and each player.
3. Add or remove players as needed for each roster.
4. Adjust batting order with the up and down buttons.
5. Use `Balance Defense` for a fairness-based rotation.
6. Edit inning assignments manually as needed.
7. Set player defensive preferences to guide the balancing suggestions.
8. Use the game panel to track scoring and runners offline during the game.

## Mobile use

- Android: host these files on any basic web host and use `Add to Home screen`.
- iPhone: open the hosted app in Safari and use `Add to Home Screen`.
- Windows: pin the site as an app in Edge or Chrome.

## Files

- [index.html](C:\Users\signa\OneDrive\Softball\index.html) - app shell
- [styles.css](C:\Users\signa\OneDrive\Softball\styles.css) - responsive styling
- [app.js](C:\Users\signa\OneDrive\Softball\app.js) - lineup logic and local storage
- [manifest.json](C:\Users\signa\OneDrive\Softball\manifest.json) - installable app metadata
- [service-worker.js](C:\Users\signa\OneDrive\Softball\service-worker.js) - offline caching

## Good next upgrades

- Drag-and-drop batting order
- One-tap position rotation rules
- Import from your existing Excel sheets
- Printable game card view
- Parent share or assistant coach access
