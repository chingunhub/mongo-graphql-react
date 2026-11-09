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

## The AI mentor (optional)

The **Mentor** button opens a chat about whatever lesson or exercise you have open. It nudges before it tells: it asks what you've tried, points you at the right file or test, and only shows more when you're stuck. It never edits your files, and running the tests from the chat doesn't count as an attempt. It won't read the finished solution until you've passed the exercise or tried it three times, the same rule as the **Solution** tab.

It's off until you add your own API key from [OpenAI](https://platform.openai.com/api-keys) or [Anthropic](https://console.anthropic.com/settings/keys) in the mentor's settings. Here's what happens to the key and your work:

- **The key** stays in the app's memory and is forgotten when the server stops. If you tick **Remember on this computer**, it's saved encrypted with your Windows account (DPAPI) or in the Mac Keychain. It's never written to your progress, the progress export, the logs or the chat history, and **Forget** removes it.
- **What's sent**, only to the provider you picked, only when you send a message: the open lesson or exercise, the files the mentor asks to read, test results and a short note on your progress.
- **Conversations** are kept in `data/mentor` on your computer. They're left out of the progress export, and you can delete them from the settings.
- **Cost** goes to your own account. With GPT-6.1 Terra, the first message about an item cost 0.3–0.7¢ in our tests and a follow-up under 0.2¢. The panel shows what the session has cost so far.

### Talking to it (OpenAI key only)

With an OpenAI key, **🎙 Talk** in the mentor panel starts a voice call, like having an instructor beside you. It follows what you do while you work: what you save, your test results, the hints you open, the part of a lesson you're reading. Now and then it speaks up on its own, with a short word about an edit or a check-in when the same test keeps failing. The **Nudges** switch turns that off, so it only answers. When code would help, it puts a snippet in the chat panel instead of reading it out. What was said is kept with the chat, so you can carry on by typing.

- **Voice is English only**, even with the Mongolian interface. No voice model handles Mongolian well enough yet.
- **Use headphones.** Through laptop speakers the mentor hears itself.
- **What's sent**: your microphone audio goes straight from the browser to OpenAI during the call. The same item details as the chat go through the app, which still keeps your key to itself.
- **Cost**: voice is $0.05 a minute, plus a little for the model that does the thinking. Calls in our tests came to about 5–10¢ a minute. The call bar shows the running cost, and at $2 the call stops listening and asks whether to keep going.

## Good to know

The sandbox runs your code as a normal program with your own permissions. That's fine for your own code on your own computer, and it's why the course isn't hosted. Don't paste in code you don't trust.

## Credits

Module 24, and the parts of modules 15, 18, 19 and 21 that compare Relaydesk with real code, study the open-source [erxes](https://github.com/erxes/erxes) project. Thanks to its maintainers for building in the open.

## License

Copyright 2026 Chingun. Licensed under the [GNU Affero General Public License v3.0](LICENSE). You're free to use, change and share the course under those terms.
