// deno-lint-ignore-file no-explicit-any

import { Octokit } from "octokit";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { createRetrieverTool } from "langchain/tools/retriever";
import { z } from "zod";
import { messagesStateReducer } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { AIMessage } from "@langchain/core";
import { RunnableConfig } from "@langchain/core/runnables";
import { NeonPostgres } from "@langchain/community/vectorstores/neon";

const octokit = new Octokit({
  auth: Deno.env.get("GITHUB_TOKEN"),
});

export type Report = Awaited<ReturnType<typeof generatePullRequestReport>>;

export async function generatePullRequestReport({
  pullRequest,
  issueComments,
  pullRequestComments,
}: Awaited<ReturnType<typeof getPullRequestInfoAndComments>>) {
  const pullRequestInfoAndCommentsAsString =
    getPullRequestInfoAndCommentsAsString({
      pullRequest,
      issueComments,
      pullRequestComments,
    });

  const GraphState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: messagesStateReducer,
    }),
  });

  const bookRetrieverTool = await getBookRetrieverTool();

  const schema = z.object({
    descriptionReport: z.string().describe(`
      A report about the PR description.
      Should include answers to questions such as but not limited to:
        - Is it complete?
        - Does it contain the necessary context?
        - Does the tone invite to review the PR?
    `),
    descriptionReportBookReferences: z.array(z.string()).describe(`
      Chapters referenced in the description report.
    `),
    descriptionGrade: z.enum(["A", "B", "C", "D"]).describe(`
      A grade to evaluate the PR description: A if this description is great,
      B if it is okay but can be improved, C if it needs improvement to be valuable,
      D if its content or tone is problematic.
    `),
    descriptionGradeReasoning: z.string().describe(`
      Detail your reasoning for assigning this grade.
    `),
    commentReports: z
      .array(
        z.object({
          commentId: z.number().describe("The ID of the comment"),
          isAutomated: z
            .boolean()
            .describe("Wether the comment is automated (posted by a bot)"),
          commentReport: z.string().describe(`
            A report about the comment.
            Should include answers to questions such as but not limited to:
              - Does it offer constructive feedback?
              - Does it foster valuable conversation?
              - Is the tone nice?
          `),
          commentReportBookReferences: z.array(z.string()).describe(`
            Chapters referenced in the comment report.
          `),
          commentGrade: z.enum(["A", "B", "C", "D"]).describe(`
            A grade to evaluate the comment: A if it is great, B if it is okay
            but can be improved, C if it needs improvement to be valuable,
            D if its content or tone is problematic.
          `),
          commentGradeReasoning: z.string().describe(`
            Detail your reasoning for assigning this grade.
          `),
        }),
      )
      .describe("Reports about each PR comment"),
  });

  const finalResponseTool = tool(() => {}, {
    name: "Response",
    description: "Always respond to the user using this tool.",
    schema,
  });

  const tools = [bookRetrieverTool, finalResponseTool];
  const toolNode = new ToolNode<typeof GraphState.State>(tools);

  const agentModel = new ChatOpenAI({
    model: "gpt-4o",
    openAIApiKey: Deno.env.get("OPENAI_API_KEY"),
    temperature: 0,
  }).bindTools(tools);

  const route = (state: typeof GraphState.State) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return "__end__";
    }
    if (lastMessage.tool_calls[0].name === "Response") {
      return "__end__";
    }
    return "tools";
  };

  const callModel = async (
    state: typeof GraphState.State,
    config?: RunnableConfig,
  ) => {
    const { messages } = state;
    const response = await agentModel.invoke(messages, config as any);
    return { messages: [response] };
  };

  const workflow = new StateGraph(GraphState)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", route, { __end__: "__end__", tools: "tools" })
    .addEdge("tools", "agent");
  const app = workflow.compile();

  const agentFinalState = await app.invoke({
    messages: [
      new SystemMessage(`
        You are a Staff Developer responsible for code review evaluations.
        You will receive the pull request (PR) description and a list of
        comments on the pull PR, and you're expected to write a report
        of the code review itself.

        You *must* use the book Pull Requests and Code Review to know the
        best practices. It is very generic, no need to try to get information
        about this specific pull request.
      `),
      new HumanMessage(pullRequestInfoAndCommentsAsString),
    ],
  });

  return schema.parse(agentFinalState.messages.at(-1).tool_calls[0]?.args);
}

async function getBookRetrieverTool() {
  const vectorStore = await NeonPostgres.initialize(new OpenAIEmbeddings(), {
    connectionString: Deno.env.get("DATABASE_URL") as string,
  });

  const retriever = vectorStore.asRetriever();
  const retrieverTool = createRetrieverTool(retriever as any, {
    name: "retrieve_pull_requests_code_review",
    description: `
      A book containing good practice for pull requests and code review.
      Here is its outline:
        - Create your PR before the code is ready for review
        - Make people want to review your PR
        - Be your PR’s first reviewer
        - Assign the right reviewers to your PR
        - Be responsive to comments
        - If you want people to review your PRs, you have to review theirs
        - You can review code even if you are a junior developer
        - Check the right things during code review
        - Use the right tone in your comments
        - Be clear about whether a change is required for you to approve the PR or not
        - Review your review before submitting it
        - Approve the PR when the submitter made all the changes you asked
        - Some conflicts can’t be solved in comments
    `,
  });

  return retrieverTool;
}

function newURLSafe(s: string) {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function getPullRequestInfoAndCommentsAsString({
  pullRequest,
  issueComments,
  pullRequestComments,
}: Awaited<ReturnType<typeof getPullRequestInfoAndComments>>) {
  let result = "";

  result += `Pull Request: '${pullRequest.title}' by @${pullRequest.user.login}\n`;
  (result +=
    pullRequest.body
      ?.trim()
      .split("\n")
      .map((s) => `> ${s}`)
      .join("\n") ?? "> (no description)") + "\n";
  result += "\n";

  for (const comment of issueComments) {
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

  for (const comment of pullRequestComments) {
    if (!comment.user || !comment.body) continue;

    result += `Comment by @${comment.user?.login} (ID: ${comment.id}${comment.in_reply_to_id ? `, in reply to ${comment.in_reply_to_id}` : ""}):\n`;
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

export async function getPullRequestInfoAndComments({
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

  const { data: issueComments } = await octokit.request(
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

  const { data: pullRequestComments } = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
    {
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  return { pullRequest, issueComments, pullRequestComments };
}

export function getPullRequestParams(pullRequestUrlString: string) {
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
