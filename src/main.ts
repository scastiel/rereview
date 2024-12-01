import { generatePullRequestReport } from "./generate-pr-report.ts";

async function main() {
  const [pullRequestUrlString] = Deno.args;
  if (!pullRequestUrlString) {
    console.error(
      "Usage: deno run start https://github.com/owner/repo/pulls/1234",
    );
    Deno.exit(1);
  }

  const report = await generatePullRequestReport(pullRequestUrlString);

  console.log(report);
}

if (import.meta.main) {
  await main();
  Deno.exit(0);
}
