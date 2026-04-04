import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import postgres from "postgres";

function parseArgs(argv) {
  const args = {
    jobId: "",
    outDir: path.join(process.cwd(), "artifacts", "cover-letters"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--job-id") {
      args.jobId = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (current === "--out-dir") {
      args.outDir = argv[index + 1] || args.outDir;
      index += 1;
    }
  }

  if (!args.jobId.trim()) {
    throw new Error("Missing required argument: --job-id");
  }

  return {
    jobId: args.jobId.trim(),
    outDir: path.resolve(args.outDir),
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

function pdfFilenameFromTex(filename) {
  return filename.replace(/\.tex$/i, ".pdf");
}

async function fetchCoverLetter(sql, jobId) {
  const rows = await sql`
    SELECT job_id, filename, tex
    FROM cover_letters
    WHERE job_id = ${jobId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function storeCompiledPdf(sql, jobId, pdfFilename, pdfData) {
  const rows = await sql`
    UPDATE cover_letters
    SET
      pdf_filename = ${pdfFilename},
      pdf_data = ${pdfData},
      pdf_updated_at = NOW()
    WHERE job_id = ${jobId}
    RETURNING job_id
  `;

  if (!rows[0]) {
    throw new Error(`No stored cover letter found for job id: ${jobId}`);
  }
}

async function runTectonic(texPath, outDir) {
  await new Promise((resolve, reject) => {
    const child = spawn("tectonic", ["--outdir", outDir, texPath], {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`tectonic exited with code ${code}`));
    });
  });
}

async function main() {
  const { jobId, outDir } = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
  });

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "jobfinder-cover-letter-"));

  try {
    const letter = await fetchCoverLetter(sql, jobId);
    if (!letter) {
      throw new Error(`No stored cover letter found for job id: ${jobId}`);
    }

    await mkdir(outDir, { recursive: true });

    const texPath = path.join(tempDir, letter.filename);
    await writeFile(texPath, letter.tex, "utf-8");

    await runTectonic(texPath, outDir);

    const pdfName = pdfFilenameFromTex(letter.filename);
    const pdfPath = path.join(outDir, pdfName);
    const pdfData = await readFile(pdfPath);
    await storeCompiledPdf(sql, jobId, pdfName, pdfData);

    process.stdout.write(`${pdfPath}\n`);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
