# Pinned issues

## What changed
Project members can pin up to three issues per project. Pinned cards sit at the top of their column,
and the API has `setIssuePinned` and `Project.pinnedIssues`.

## Why
Teams were losing track of the few issues that matter most this week. The limit keeps pins meaningful.

## How I verified it
The tests cover the limit, its exceptions and the auth order. In the running app I pinned four issues,
watched the fourth get refused, and reloaded to check the pins were stored.

## What it does not do yet
The limit is a count followed by a save, so two people pinning at the same moment can reach four pins.
That's harmless here, so I left it. Pins aren't ordered among themselves, a pinned card can sit on a
later page of the board until someone loads it, and nothing records who pinned what.
