import { Octokit } from "npm:octokit@4.0.2";

async function main() {
  const [pullRequestUrlString] = Deno.args;
  if (!pullRequestUrlString) {
    console.error(
      "Usage: deno run start https://github.com/owner/repo/pulls/1234",
    );
    Deno.exit(1);
  }

  const octokit = new Octokit({
    auth: Deno.env.get("GITHUB_TOKEN"),
  });

  const pullRequestParams = getPullRequestParams(pullRequestUrlString);
  if (!pullRequestParams) {
    console.error(`Invalid GitHub pull request URL:`, pullRequestUrlString);
    Deno.exit(1);
  }
  const { owner, repo, pullNumber } = pullRequestParams;

  const { data: pullRequest } = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  const { data: comments } = await octokit.request(
    "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
    {
      owner,
      repo,
      issue_number: pullNumber,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  console.log(
    `Pull Request: '${pullRequest.title}' by @${pullRequest.user.login}`,
  );
  console.log(
    pullRequest.body
      ?.trim()
      .split("\n")
      .map((s) => `> ${s}`)
      .join("\n") ?? "> (no description)",
  );
  console.log("");

  for (const comment of comments) {
    if (!comment.user || !comment.body) continue;

    console.log(`Comment by @${comment.user?.login}:`);
    console.log(
      comment.body
        .trim()
        .split("\n")
        .map((s) => `> ${s}`)
        .join("\n"),
    );
    console.log("");
  }
}

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  await main();
  Deno.exit(0);
}

function newURLSafe(s: string) {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function getPullRequestParams(pullRequestUrlString: string) {
  const pullRequestUrl = newURLSafe(pullRequestUrlString);
  if (!pullRequestUrl || pullRequestUrl.hostname !== "github.com") {
    return null;
  }

  const urlParserRegExp = new RegExp(/\/([^/]+)\/([^/]+)\/pull\/(\d+).*/);
  const parseResult = urlParserRegExp.exec(pullRequestUrl.pathname);
  if (!parseResult) {
    return null;
  }

  const [, owner, repo, pullNumber] = parseResult;
  return { owner, repo, pullNumber: Number(pullNumber) };
}
