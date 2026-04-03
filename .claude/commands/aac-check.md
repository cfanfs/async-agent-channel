Fetch new messages and show the inbox. Run these two commands in sequence:

```
pnpm exec tsx src/cli/index.ts fetch
pnpm exec tsx src/cli/index.ts inbox
```

If there are new messages, briefly summarize the senders and subjects. If the inbox is empty, just say so.
