---
title: 'Bug hunt: the wrong portal'
kind: bughunt
focus: ['api.ts']
readonly: ['store.ts', 'tokens.ts']
---

Acme runs two portals on one system: **Help**, for its customers, and **Partners**, for the companies that resell its products. Both have worked for months. This week three reports came in. Nobody will tell you which file is wrong, and the tests only describe what people see.

> **#5120, Help portal.** "Otto from one of our partner companies says the Help site shows him as signed in. He's never registered there. He'd been using the Partners site in the same browser."
>
> **#5121, Help portal.** "A partner opened a link to ticket `t2` from a forwarded email and could read all of it. `t2` is Nina's refund request. She's a Help customer and has nothing to do with them."
>
> **#5122, security review.** "See the last log line. A ticket list was served to a user ID that isn't in the accounts collection, on a request that carried no auth token."

The log from that afternoon:

```text
14:02:11  req=a41  app=help      auth=yes  portal=cp-help      user=u-mara   cpGetTickets       200  2 tickets
14:02:40  req=a42  app=help      auth=yes  portal=cp-help      user=u-otto   cpCurrentUser      200  otto@example.com
14:02:41  req=a43  app=help      auth=yes  portal=cp-help      user=u-otto   cpGetTickets       200  0 tickets
14:03:05  req=a44  app=partners  auth=yes  portal=cp-partners  user=u-otto   cpGetTicket id=t2  200
14:05:19  req=a45  app=help      auth=no   portal=cp-help      user=u-admin  cpGetTickets       200  0 tickets
```

And what's stored:

| Account | Portal | Tickets |
| --- | --- | --- |
| `u-mara` | Help | `t1`, `t4` |
| `u-nina` | Help | `t2` |
| `u-otto` | Partners | `t3` |

Read the log against that table before you open a file. In `a42`, which two columns contradict each other? In `a44`, every column is honest, so what's wrong with the answer? And in `a45`, where could a user have come from if the request had no auth token?

## Your task

1. For each report, write down which of the four layers you suspect: the site, the gateway, the guard or the resolver. The last table of the previous lesson is your map.
2. Fix the causes. There may be more than one, and they needn't be in the same place.
3. Keep what works. A login page still gets its portal with nobody signed in. A session still works as a header or as a cookie. An expired session is still just signed out.

`api.ts` is where a request starts, and `handle` keeps its signature. `store.ts` and `tokens.ts` are supplied. Everything else is yours to change.

> [!TIP]
> Two of these reports can't be reproduced by using the sites normally. Somebody had to send a request the sites would never send. When you read each layer, ask what it does with input its own frontend would never produce.

## Hints

### Follow one request down
Take `a42` and read everything it touches from `handle` onwards, in order. At each lookup, ask what the filter contains, and what it would need to contain to tell Help's accounts from Partners'.

### A guard that passed
In `a44` Otto really is a signed-in Partners customer, so both guard questions were answered correctly. Which question comes after them, and who's responsible for asking it?

### Who writes those headers?
The plugin believes two headers completely. Find every place they're written, then find every way the function that writes them can return. Is there a path where a header arrives from outside and leaves untouched?

### Compare with what you built
You wrote a stricter version of each of these pieces earlier in this module. Put your drills beside this code and look for what's missing.
