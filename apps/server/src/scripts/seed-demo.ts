import { createDbClientForUrl } from "../infrastructure/database";
import { seedHostedDemo } from "../services/demo/seed";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Production maintenance can include a cold remote TLS handshake.
const databaseClient = createDbClientForUrl(databaseUrl, { connectionTimeoutMillis: 15_000 });

main().catch((error) => {
  console.error("Zilobase hosted demo seed failed", error);
  process.exit(1);
});

async function main() {
  await databaseClient.client.connect();
  try {
    await seedHostedDemo(databaseClient.db);
    console.info("Zilobase hosted demo seed is valid");
  } finally {
    await databaseClient.client.end();
  }
}
