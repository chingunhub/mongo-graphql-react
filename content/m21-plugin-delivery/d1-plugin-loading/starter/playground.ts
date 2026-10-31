import { loadPlugins } from './plugins';
console.log(
  await loadPlugins(['inbox', 'broken'], async (name) => {
    if (name === 'broken') throw Error('network');
    return { version: 1, title: 'Inbox' };
  }),
);
