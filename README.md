# Forge Academy

A hands-on backend course that runs on your own computer. You read a short lesson, write real code in the browser, and real tests grade it right there. There's no account and nothing to deploy.

You'll learn MongoDB with Mongoose, GraphQL with Apollo Server and Apollo Client, and how they connect to React. Then you'll go on to the things that make a big codebase feel big: tenant boundaries, Federation, tRPC and Zod, background queues, and monorepos.

## Who it's for

You know JavaScript, and you've probably built something with Express and a SQL database. MongoDB and GraphQL are new, or they arrived fast and didn't quite stick. It works well alongside a bootcamp, or on its own.

You need basic React for the later Taskforge modules. TypeScript isn't taught here, because better TypeScript courses already exist. The tasks use light type annotations that you can read as you go.

## What you'll build

| Modules | Project | What it is |
| --- | --- | --- |
| 0–13 | **Taskforge** | A project tracker built up task by task with Mongoose, GraphQL, Apollo and React |
| 14–23 | **Relaydesk** | A support desk shared by several organizations, split into real services |
| 24 | **Field guide** | Reading a real open-source codebase, a capstone plugin in its shape, and a seeded incident |

You don't have to finish everything. The course has three stages, and stopping after any of them counts:

| Stage | Modules | What it's for |
| --- | --- | --- |
| **1. Backend** | 0–9 | The goal. A complete GraphQL backend |
| **2. Full stack** | 10–13 | A stretch. You write real React and finish the app |
| **3. Real systems** | 14–24 | Take the modules you need, when you need them |

## Get started

One pasted line installs everything, including its own Node and MongoDB, and puts an icon on your desktop. It downloads about 860 MB on Windows and 140 MB on a Mac.

On Windows, paste this into PowerShell:

```powershell
irm https://github.com/chingunhub/mongo-graphql-react/releases/latest/download/install.ps1 | iex
```

On a Mac, paste this into Terminal:

```bash
curl -fsSL https://github.com/chingunhub/mongo-graphql-react/releases/latest/download/install.sh | bash
```

To run it from this repo instead, you need [Node 24 or newer](https://nodejs.org) and [MongoDB](https://www.mongodb.com/try/download/community) running on `127.0.0.1:27017`.

```bash
npm ci
npm run app
```

The first launch builds the interface, which takes about 20 seconds. After that the course opens in a couple of seconds, in its own window. The server keeps running in the background so reopening is instant. Use **API → Quit server** in the top bar to stop it.

If something doesn't work, this checks your setup and prints a fix for each problem:

```bash
npm run doctor
```

On Windows you can also add a desktop icon:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-shortcut.ps1
```

Your progress is saved in the `data` folder, on your computer only.

## Good to know

The sandbox runs your code as a normal program with your own permissions. That's fine for your own code on your own computer, and it's why the course isn't hosted. Don't paste in code you don't trust.

## Credits

Module 24, and the parts of modules 15, 18, 19 and 21 that compare Relaydesk with real code, study the open-source [erxes](https://github.com/erxes/erxes) project. Thanks to its maintainers for building in the open.

## License

Copyright 2026 Chingun. Licensed under the [GNU Affero General Public License v3.0](LICENSE). You're free to use, change and share the course under those terms.
