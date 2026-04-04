import postgres from "postgres";

function parseArgs(argv) {
  const args = {
    jobId: "",
    error: "PDF compilation workflow failed.",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--job-id") {
      args.jobId = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (current === "--error") {
      args.error = argv[index + 1] || args.error;
      index += 1;
    }
  }

  if (!args.jobId.trim()) {
    throw new Error("Missing required argument: --job-id");
  }

  return {
    jobId: args.jobId.trim(),
    error: args.error.trim() || "PDF compilation workflow failed.",
  };
}

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL ||
    ""
  ).trim();
}

async function main() {
  const { jobId, error } = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
  });

  try {
    await sql`
      UPDATE cover_letters
      SET
        compile_status = 'failed',
        compile_error = ${error.slice(0, 1000)}
      WHERE job_id = ${jobId}
    `;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
