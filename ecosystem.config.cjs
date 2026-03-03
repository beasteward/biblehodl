module.exports = {
  apps: [
    {
      name: "nostr-teams-app",
      cwd: "/data/.openclaw/workspace/nostr-teams",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "file:./prisma/production.db",
        NEXT_PUBLIC_RELAY_URL: "wss://relay.biblehodl.com",
        RELAY_ADMIN_URL: "http://localhost:3002",
        RELAY_ADMIN_TOKEN: process.env.RELAY_ADMIN_TOKEN,
        NEXT_PUBLIC_BLOSSOM_URL: "https://files.biblehodl.com",
      },
    },
    {
      name: "nostr-relay",
      cwd: "/data/.openclaw/workspace/nostr-relay",
      script: "relay.js",
      env: {
        RELAY_ADMIN_TOKEN: process.env.RELAY_ADMIN_TOKEN,
        RELAY_PORT: "3002",
      },
    },
    {
      name: "blossom-server",
      cwd: "/data/.openclaw/workspace/blossom-server",
      script: "node_modules/.bin/blossom-server-ts",
      env: {
        PORT: "3100",
      },
    },
  ],
};
