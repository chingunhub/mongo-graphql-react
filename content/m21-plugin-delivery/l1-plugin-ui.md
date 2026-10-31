---
title: "A broken plugin should have a visible boundary"
minutes: 25
---

Taskforge's React app had a comfortable assumption: all of its code arrives together. Either the whole bundle loaded or nothing did.

A plugin host doesn't get that luxury. The sales team deploys their screen on Tuesday, and it's broken. Should the support inbox go down with it? Of course not. The sales tab should say it's unavailable, and everyone else should carry on working.

That only happens if you plan for it, because a failed plugin can fail in three different ways, at three different times.

## Three failures, three owners

```viz-flow
{
  title: 'Which layer catches what',
  colWidth: 215,
  rowHeight: 96,
  nodes: [
    { id: 'load', label: 'Load the module', sub: 'network, version, bad bundle', col: 0, row: 0, color: 'neutral' },
    { id: 'render', label: 'Render the component', sub: 'a bug during render', col: 1, row: 0, color: 'react' },
    { id: 'data', label: 'Fetch its data', sub: 'a query fails', col: 2, row: 0, color: 'gql' },
    { id: 'catch', label: 'try/catch around import()', sub: 'React has not seen it yet', col: 0, row: 1, color: 'forge' },
    { id: 'boundary', label: 'Error boundary', sub: 'catches render errors', col: 1, row: 1, color: 'forge' },
    { id: 'state', label: 'Query error state', sub: 'the component stays alive', col: 2, row: 1, color: 'forge' },
  ],
  edges: [
    { from: 'load', to: 'render' },
    { from: 'render', to: 'data' },
    { from: 'load', to: 'catch', dashed: true },
    { from: 'render', to: 'boundary', dashed: true },
    { from: 'data', to: 'state', dashed: true },
  ],
  steps: [
    { focus: ['load', 'load>catch', 'catch'], caption: 'The import fails before any component exists. An error boundary cannot help, as there is nothing to render.' },
    { focus: ['render', 'render>boundary', 'boundary'], caption: 'The module loaded and threw while rendering. Only a boundary above it can catch that.' },
    { focus: ['data', 'data>state', 'state'], caption: 'Rendering worked and the request failed. That belongs in the component, with a retry.' },
  ],
}
```

None of these replaces the others, and an app needs all three. Here's a boundary, which is one of the last places in modern React that needs a class:

```tsx
class PluginBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? <p role="alert">{this.props.title} is unavailable</p>
      : this.props.children;
  }
}
```

> [!WARNING] What a boundary won't catch
> Error boundaries only catch errors thrown while React renders. A rejected promise, a failing click handler or a `setTimeout` callback goes straight past. Handle those where they happen.

## Catching one failed import

Let's start with one plugin, in the smallest useful shape. Failure becomes a normal value, so the caller can render it:

```ts
// @worked-example load-one
export async function loadOne(name: string, load: (name: string) => Promise<unknown>) {
  try {
    return { name, status: 'ready', module: await load(name) };
  } catch {
    return { name, status: 'failed' };
  }
}
```

That `await` is doing an important job. Without it, the `try` block finishes before the promise settles, and the rejection escapes. `return load(name)` inside a `try` catches nothing.

Now, why does each plugin need its own `try`? Look at what happens with several:

```compare
--- ✘ One failure loses everything
const plugins = await Promise.all(names.map(load));
// ✘ the first rejection rejects the whole thing
// ✘ the five plugins that loaded fine are gone
--- ✔ Each plugin owns its outcome
const plugins = await Promise.all(names.map((name) => loadOne(name, load)));
// ✔ loadOne never rejects, so Promise.all can't either
// ✔ results stay in the order you asked for
```

`Promise.all` keeps input order, whatever order the promises finish in. That means the sidebar won't reshuffle depending on network timing.

```quiz
Q: A plugin's module fails to download. What handles this?
- [x] A catch around the dynamic import
- [ ] A React error boundary
- [ ] The query's error state
> No component exists yet, so React has nothing to catch. The boundary is for errors during rendering, and the query state is for failed data.
```

## The erxes host

erxes uses Module Federation. Each plugin is built and deployed separately, and the host loads its remote at runtime. Here's its real configuration, slightly trimmed:

```ts
const coreLibraries = new Set([
  'react', 'react-dom', 'react-router', 'react-router-dom',
  'erxes-ui', '@apollo/client', 'jotai', 'ui-modules', 'react-i18next',
]);

const config: ModuleFederationConfig = {
  name: 'core-ui',
  shared: (libraryName, defaultConfig) =>
    coreLibraries.has(libraryName) ? defaultConfig : false,
  remotes: process.env.ENABLED_PLUGINS
    ? process.env.ENABLED_PLUGINS.split(',').map((plugin) => `${plugin}_ui`)
    : [],
};
```

Two things worth reading from this. Which plugins exist is decided by an environment variable, at deploy time. And that `shared` list is the important part: every library on it is **stateful**. Two copies of React break hooks. Two copies of Apollo mean two caches and a missing provider. So the host and plugins share one instance, and that list becomes a contract between teams.

Relaydesk uses plain dynamic imports with an injected loader. That teaches the failure contract, but it isn't a deployed Module Federation host, and Module 24 goes into how the real one is put together.

## Identity reaches the browser

Remember this problem from the server? `Contact 7` exists in North and in South. Apollo's normalized cache is another place where identity can collapse: if the key is `Contact:7`, one tenant's record replaces the other's.

```quiz
Q: Contact 7 exists in two tenants. The UI shares one Apollo cache keyed only by id. What can happen?
- [x] One tenant's record can replace the other's cached record
- [ ] Nothing, as GraphQL fields automatically include the tenant
- [ ] The database unique index fixes the browser cache
> The database, the federation layer and the client cache each need their own identity contract. Getting one right doesn't configure the others.
```

Relaydesk creates a new client when the tenant changes, and it keeps tenant in the contact's cache key. Module 23 makes you build both.

## Operations UI has to be honest

Next you'll build an operations panel, and an operations screen is the one place that can't round reality off.

| State | What it says | What must be possible |
| --- | --- | --- |
| Loading | Nothing is known yet | Nothing to act on, so buttons stay disabled |
| Failed report | The counts are unknown | Refresh, since the panel has to recover |
| Report loaded | These are the counts | Deliver |
| Dispatching | Work in progress | Prevent double clicks |
| Partly failed | Some events are still pending | See it and try again |

Don't show "delivered" until the server says so. And after a dispatch, **refetch**. A successful HTTP call only proves that the dispatcher ran, and it could have reported `{ delivered: 0, failed: 3 }`.

There's one more trap. You switch from North to South while North's report is on its way. The answer arrives late and overwrites South's screen with North's numbers. You know this one from React: the effect's cleanup marks the old request as abandoned.

```tsx
useEffect(() => {
  let cancelled = false;
  api.report().then((value) => {
    if (!cancelled) setReport(value);
  });
  return () => {
    cancelled = true;
  };
}, [api]);
```

## Types generated from operations

A hand-written type describes what you hope. A generated one describes the operation you actually wrote:

```compare
--- ✘ The whole entity, whatever you selected
type Contact = { id: string; tenant: string; name: string };
const { data } = useQuery<{ contact: Contact }>(CONTACT_NAME);
data.contact.tenant; // ✘ compiles, but this query didn't select it
--- ✔ Generated from the operation
// graphql-codegen reads schema.graphql and your documents
const { data } = useQuery<ContactNameQuery>(CONTACT_NAME);
data.contact.tenant; // ✔ a compile error, since it wasn't selected
```

Running codegen also validates each operation against the schema, so a removed field fails the build. Regenerate after changing the contract, and read the generated diff, as it's a free summary of what clients will notice. And never hand-edit generated files.

Keep the limits in mind, too. Codegen can't prove that a request is authorized, or that an effect was delivered. It's one more contract at one more boundary.

## What's next

The drill loads several plugins and adds a compatibility check on top of `loadOne`. Then you'll build the operations panel, with all five of those states.
