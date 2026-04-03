Read a specific message from the inbox.

First argument: message ID. If not provided, run `pnpm exec tsx src/cli/index.ts inbox` to list available messages and ask which one to read.

To read the message:
```
pnpm exec tsx src/cli/index.ts inbox read $ARGUMENTS
```

Display the full message content. If the message warrants a reply, suggest it but don't send without confirmation.
