# Progressive bounty plan

## Rules
- Knockout: the eliminator gets 50% of the victim's bounty as cash owed, and the other 50% is added to their own bounty.
- Rebuy (`+` on buys, `admin/app.js`): the player's bounty resets to the starting value. `cashOwed` carries over, and the earlier knocker is unchanged.
- Toggling a player back to active is an undo of their latest knockout, not a rebuy.

## Data
- Knockout events store `{id, victim, eliminator, amount, time, voided?}`. Old log entries without these fields are ignored by the bounty replay.
- `computeBounties()` replays the event log and returns each player's current bounty, `cashOwed` and knockout count. Both `tv/app.js` and `admin/app.js` carry a copy, kept in sync.
- Payments are ledger entries `{player, amount, time, voided?}`.
- Undo marks an event `voided`. Nothing is deleted, and everything recomputes.

## Admin (`admin/app.js`, `i18n.js`)
1. Knocking a player out opens an eliminator picker.
2. A dismissible toast follows: "Jan knocked out, owed 600 Kč [Pay] [x]". Esc, x or a timeout dismisses it, and dismissing changes nothing.
3. Each knockout in the feed gets "undo" and "change eliminator" buttons.
4. Toggling back to active voids that player's latest knockout.
5. A "Bounty výplata" card lists players with a balance: busted players first, then active players, largest first within each group. It shows a "Still owed" total.
6. "Paid" marks the player's full balance as paid. Clicking again voids that payment entry. New cash earned later shows as a fresh owed amount. No partial payments in the first version.
7. Voiding a knockout after the knocker was paid flags "overpaid by X Kč" and doesn't adjust silently.
8. A reminder shows when the winner is declared with unpaid balances.
9. Config gets a "progressive" checkbox. `cs` and `uk` strings are added for everything above.

## TV (`tv/app.js`, `index.html`, `style.css`)
- A bounty leaderboard in `.display`, below the chip stats. It shows active players only, sorted by current bounty, capped at the top 5-8, with name, bounty and knockout count.
- Hidden when the bounty is 0 or progressive is off.
- The knockout feed gets "A vyřadil B, +X Kč".
- The seating chart and right sidebar stay as they are.

## Unchanged
- The prize pool formula (6 places), and the header's `bountyAmount` display.

## Suggested order
1. Event IDs, `computeBounties()` and the data model.
2. Admin picker and undo.
3. TV leaderboard and feed text.
4. Settlement card and toast.
5. Config checkbox and `uk` strings.
