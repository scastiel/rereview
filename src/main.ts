import { Octokit } from "octokit";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const octokit = new Octokit({
  auth: Deno.env.get("GITHUB_TOKEN"),
});

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
    console.error(`Invalid GitHub pull request URL:`, pullRequestUrlString);
    Deno.exit(1);
  }
  const { owner, repo, pullNumber } = pullRequestParams;

  const pullRequestInfoAndCommentsAsString =
    await getPullRequestInfoAndCommentsAsString({ owner, repo, pullNumber });

  console.log(pullRequestInfoAndCommentsAsString);

  const agentModel = new ChatOpenAI({
    openAIApiKey: Deno.env.get("OPENAI_API_KEY"),
    temperature: 0,
  });
  const agentCheckpointer = new MemorySaver();
  const agent = createReactAgent({
    llm: agentModel as any,
    tools: [],
    checkpointSaver: agentCheckpointer,
  });

  const agentFinalState = await agent.invoke(
    {
      messages: [
        new SystemMessage(`
          You are a Staff Developer responsible for code review evaluations.
          You will receive the pull request (PR) description and a list of
          comments on the pull PR, and you're expected to write a report
          of the code review itself.
          The report reader needs to know from your report:
            - if the PR description is complete enough to understand what the
              PR is for, and its context.
            - if the comments are constructive, give the proper feedback
              with appropriate tone.
          Conclude the report with advice for the reviewers and the PR creator
          so they can improve their future code reviews.
        `),
        new HumanMessage(pullRequestInfoAndCommentsAsString),
      ],
    },
    { configurable: { thread_id: 42 } },
  );

  console.log(agentFinalState);
}

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

async function getPullRequestInfoAndCommentsAsString({
  owner,
  repo,
  pullNumber,
}: {
  owner: string;
  repo: string;
  pullNumber: number;
}) {
  const { pullRequest, comments } = await getPullRequestInfoAndComments({
    owner,
    repo,
    pullNumber,
  });

  let result = "";

  result += `Pull Request: '${pullRequest.title}' by @${pullRequest.user.login}\n`;
  (result +=
    pullRequest.body
      ?.trim()
      .split("\n")
      .map((s) => `> ${s}`)
      .join("\n") ?? "> (no description)") + "\n";
  result += "\n";

  for (const comment of comments) {
    if (!comment.user || !comment.body) continue;

    result += `Comment by @${comment.user?.login} (ID: ${comment.id}):\n`;
    result +=
      comment.body
        .trim()
        .split("\n")
        .map((s) => `> ${s}`)
        .join("\n") + "\n";
    result += "\n";
  }

  return result;
}

async function getPullRequestInfoAndComments({
  owner,
  repo,
  pullNumber,
}: {
  owner: string;
  repo: string;
  pullNumber: number;
}) {
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

  return { pullRequest, comments };
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
