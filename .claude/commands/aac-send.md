Send a message to a contact.

Arguments format: `<contact> <message>`

If arguments are missing, ask for the recipient and message content.

To send:
```
pnpm exec tsx src/cli/index.ts send --to <contact> "<message>"
```

If the user provides a `--subject`, include it. If not, omit it (a default subject will be generated).

After sending, confirm success.
