---
title: 'Guards and plugin messages'
minutes: 30
---

Two things happen in nearly every erxes resolver: somebody decides whether you're allowed in, and something asks another plugin for data. You've built both in Relaydesk, in a stricter form. This lesson is about how erxes does them, and it comes with a habit that'll serve you for your whole career: **read the code behind a name**. Below, you'll meet a name that promises more than its code delivers.

## Who are you? A header

In Module 22 you decided who turns an HTTP request into trusted context. erxes splits that job across two services.

```viz-sequence
{
  title: 'Identity crosses the gateway as a header',
  actors: [
    { id: 'b', label: 'Browser', color: 'react' },
    { id: 'g', label: 'Gateway', sub: 'userMiddleware', color: 'forge' },
    { id: 'p', label: 'Plugin', color: 'gql' },
  ],
  steps: [
    { from: 'b', to: 'g', label: 'cookie or token', note: 'The gateway verifies the JWT. This is the only place a signature is checked.' },
    { from: 'g', to: 'g', label: 'setUserHeader', note: 'It writes the user as base64 JSON into a `user` header. That\'s encoding, not encryption, and there\'s no signature.' },
    { from: 'g', to: 'p', label: 'request + user header', note: 'If there\'s no valid token, the middleware still calls `next()`. The request continues, with no user.' },
    { from: 'p', to: 'p', label: 'extractUserFromHeader', note: 'It decodes the header and trusts it. `context.user` is now whatever that header said.' },
  ],
}
```

Two consequences follow, and they're worth saying out loud:

1. **A plugin must never be reachable directly.** Anybody who can reach its port can write their own `user` header and be anyone. Only the network protects that header.
2. **The gateway doesn't turn anonymous requests away.** It just doesn't attach a user. So the check that really keeps a stranger out is in the plugin, on the resolver.

Which makes that check rather important.

## Wrapping resolvers

erxes doesn't call a check at the top of each resolver. It wraps the resolver functions once, when the module loads:

```ts title="backend/erxes-api-shared/src/core-modules/permissions/utils.ts"
export const checkLogin = (user: IUserDocument) => {
  if (!user || !user._id) {
    throw new Error('Login required');
  }
};

export const permissionWrapper = (cls, methodName, checkers) => {
  const oldMethod = cls[methodName];

  cls[methodName] = async (root, args, context, info) => {
    const { user } = context;

    for (const checker of checkers) {
      checker(user);
    }

    return oldMethod(root, args, context, info);
  };
};

export const moduleRequireLogin = (mdl) => {
  for (const method in mdl) {
    if (Object.prototype.hasOwnProperty.call(mdl, method)) {
      requireLogin(mdl, method);
    }
  }
};
```

This mutates the object. After `moduleRequireLogin(checklistMutations)` runs, each key in that object holds a new function that checks first, then calls the original. It's a good pattern, because a new resolver in the object gets the guard without anyone remembering.

Good, with one trap. It's about **when** it runs:

```compare
--- ✘ The guard runs before the key exists
export const ticketMutations = {
  ticketAdd(_root, doc, { models }) { /* ... */ },
};

moduleRequireLogin(ticketMutations);

// Added later, further down the file. Nothing wrapped this one.
ticketMutations.ticketRemove = (_root, { _id }, { models }) =>
  models.Tickets.deleteOne({ _id });
--- ✔ The guard runs after the object is complete
export const ticketMutations = {
  ticketAdd(_root, doc, { models }) { /* ... */ },
  ticketRemove(_root, { _id }, { models }) { /* ... */ },
};

moduleRequireLogin(ticketMutations);
```

Same with spreading. If `apollo/resolvers/queries.ts` spreads an object into `Query` before the module's guard call has run, or a guard is applied to a copy, the function in the schema isn't the wrapped one. When you're reading guards, ask: which object did this wrap, and is that the object the schema uses?

### Reading the code behind a name

Now open the real file and look for `checkPermission`. The name, and every call site, tells you it checks a permission. Here's the body at this revision, with the commented-out part shortened:

```ts title="backend/erxes-api-shared/src/core-modules/permissions/utils.ts"
export const checkPermission = async (cls, methodName, actionName, defaultValue) => {
  const oldMethod = cls[methodName];

  cls[methodName] = async (root, args, context, info) => {
    const { user } = context;
    checkLogin(user);
    // ...the can(...) check and 'Permission required' are commented out
    return oldMethod(root, args, context, info);
  };
};
```

So this function, called in 48 files, **checks login and nothing else** at this revision. And the old logic had a subtle bug waiting too: it did `if (defaultValue) return defaultValue`, so a default of `0` or `false` wouldn't have been honored.

Nearby, in `sales_api`, you'll also find this:

```ts title="backend/plugins/sales_api/src/modules/sales/graphql/resolvers/queries/checklists.ts"
// moduleRequireLogin(checklistQueries);
```

Remember what the gateway does with an anonymous request.

I'm not showing you this to dunk on anybody. A big product goes through migrations, and this is a snapshot of one: a new permission system replacing an old one. Maybe that's been fixed by the time you read this, and maybe something else covers it. The point is what it does to you as a reader. **A guard's name is a claim. The body is the fact.** Never write "this is protected by `checkPermission`" in a PR or a security review until you've read that function, in the version you're running.

> [!IMPORTANT]
> In the drills you'll build the strict version: `checkPermission` really checks. When you get to the real codebase, don't assume it matches. That's the difference between the idea and the deployment.

## Asking another plugin

Plugins don't import each other's models. They send a message, and you'll see this everywhere (172 files):

```ts title="backend/plugins/sales_api/src/modules/sales/graphql/resolvers/customResolvers/deal.ts"
async vendorCustomers(deal: IDealDocument, _args: undefined, { subdomain }: IContext) {
  return await sendTRPCMessage({
    subdomain,
    pluginName: 'content',
    module: 'portal',
    action: 'portalUserCard',
    input: {
      contentType: 'deal',
      contentTypeId: deal.id,
    },
  });
},
```

It's tRPC, which you know from Module 18, but compare the feel. Your Relaydesk client was typed end to end, so a renamed procedure was a compile error. Here `module` and `action` are strings. The call site can't be checked by TypeScript, and a typo is a runtime problem.

Which raises the question: what does a runtime problem look like? Here's the end of that function:

```ts title="backend/erxes-api-shared/src/utils/trpc/utils.ts"
const client = createTRPCUntypedClient({ links: [httpBatchLink({ url: baseUrl })] });

try {
  const result = await client[method](`${module}.${action}`, { subdomain, ...input }, options);
  return result || defaultValue;
} catch (e) {
  return defaultValue;
}
```

Two small lines with big consequences. Here's a stripped-down copy you can reason about:

```ts
// @worked-example default-value
export async function sendMessage<T>(call: () => Promise<T>, defaultValue: T) {
  try {
    const result = await call();
    return result || defaultValue;
  } catch {
    return defaultValue;
  }
}

export type Reply<T> = { ok: true; value: T } | { ok: false; reason: string };

export async function ask<T>(call: () => Promise<T>): Promise<Reply<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}
```

`sendMessage` mirrors what erxes does. `ask` is what Relaydesk made you do in Module 18: failure is a different shape from success. Now let's see what you lose.

| The remote plugin... | `sendMessage(..., 5)` returns |
| --- | --- |
| Answers `12` | `12` |
| Answers `0`, a real count | `5` |
| Answers `false` | `5` |
| Throws a validation error, because you've got a bug | `5` |
| Is down | `5` |
| Doesn't exist, because of a typo in `action` | `5` |

**From the caller's side, those last five rows are the same event.** A real zero becomes the default, a bug in your input becomes the default, and an outage becomes the default. Nothing is logged at this level, and nothing throws. If the default is `[]`, the user sees an empty list and no error anywhere.

Then there's the `subdomain`. Look at where it goes: inside the input, `{ subdomain, ...input }`. The receiving plugin reads it back out in `createTRPCContext`:

```ts
const subdomain = req.body?.input?.subdomain || getSubdomain(req);
```

So the customer boundary between plugins is one field in a JSON body. Forget it in a hand-written call and the server falls back to working it out from the request, which for an internal call may not be who you think.

### How to live with this

You can't change a shared helper in your first week, but you can write code that doesn't get fooled:

1. **Choose defaults that fail visibly.** For a list, `[]` is often what the UI needs. For a decision, such as "is this customer allowed?", a default of `false` might be right, and `true` almost never is.
2. **Decide what partial failure means here.** If contacts are down, should the ticket list still load? Usually yes, with `contact: null`. You'll build exactly that.
3. **When an empty result looks wrong, suspect the message first.** "It returned nothing" and "it failed" look the same from here. Check the other plugin's logs.
4. **Don't trust falsy answers.** If you need a count that may be zero, wrap it in an object: `{ count: 0 }` is truthy.

> [!WARNING] Silent defaults hide bugs for months
> A typo in `action` doesn't crash. It returns `defaultValue` forever, and every test using a mock keeps passing. For any new message, make sure at least once that you've seen the real answer come back.

```quiz
Q: A plugin is exposed on a port that's reachable from the office network, behind no gateway. What's the problem?
- [ ] None, because the plugin still runs `checkLogin`
- [x] Anyone who can reach it can send their own base64 `user` header and pass `checkLogin` as any user
- [ ] Only that JWTs will expire early
> `checkLogin` only asks whether `context.user` has an `_id`. The header isn't signed, so only the gateway's position in the network makes it trustworthy.
```

```quiz
Q: A dashboard shows "0 open deals" for every customer since this morning. `sendTRPCMessage` is used with `defaultValue: 0`. What do you know so far?
- [ ] Nobody has any open deals
- [ ] The remote query ran and counted zero
- [x] Very little: a real zero, an exception, an outage and a typo all return `0`
> The call can't tell you. Go to the remote plugin's logs or call the procedure directly. An honest "I can't tell from here" is the correct first step.
```

```quiz
Q: A resolver's file calls `checkPermission(dealMutations, 'dealsRemove', 'dealsRemove')`. A reviewer asks if deletion needs a permission. What's the honest answer?
- [ ] Yes, the call is right there
- [x] Read `checkPermission` in the installed version first, because the name alone doesn't prove it
- [ ] No, permissions are always handled in the gateway
> At the revision we read, that function only checks login. It may have changed since, and that's the reason to look.
```

You'll build the strict versions of these guards next. Then the capstone uses `sendTRPCMessage` for real, so you'll get to see a plugin go down and your feature survive it.
