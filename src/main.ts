import {
  generatePullRequestReport,
  getPullRequestInfoAndComments,
  getPullRequestParams,
} from "./generate-pr-report.ts";

async function main() {
  const [pullRequestUrlString] = Deno.args;
  if (!pullRequestUrlString) {
    console.error(
      "Usage: deno run start https://github.com/owner/repo/pulls/1234",
    );
    Deno.exit(1);
  }

  const pullRequestParams = getPullRequestParams(pullRequestUrlString);
  if (!pullRequestParams) {
    console.error(`Invalid GitHub pull request URL: ${pullRequestUrlString}`);
    return;
  }
  const { owner, repo, pullNumber } = pullRequestParams;

  const { pullRequest, issueComments, pullRequestComments } =
    await getPullRequestInfoAndComments({ owner, repo, pullNumber });

  const report = await generatePullRequestReport({
    pullRequest,
    issueComments,
    pullRequestComments,
  });

  console.log(report);
}

if (import.meta.main) {
  await main();
  Deno.exit(0);
}
