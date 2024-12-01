import {
  generatePullRequestReport,
  getPullRequestInfoAndComments,
  getPullRequestParams,
  Report,
} from "./generate-pr-report.ts";
import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";
import { Fragment, Suspense } from "hono/jsx";
import { match } from "ts-pattern";
import { decorateFunctionWithCache, hash } from "./helpers/cache.ts";

const cachedGeneratePullRequestReport = decorateFunctionWithCache(
  generatePullRequestReport,
  async (params) => [
    "generatePullRequestReport",
    await hash(JSON.stringify(params)),
  ],
  24 * 60 * 60 * 1000, // 1 day
);
const cachedGetPullRequestInfoAndComments = decorateFunctionWithCache(
  getPullRequestInfoAndComments,
  ({ owner, repo, pullNumber }) => [
    "getPullRequestInfoAndComments",
    owner,
    repo,
    pullNumber,
  ],
  60 * 1000, // 1 minute
);

const app = new Hono();

const App = ({
  pullRequestUrlString,
}: {
  pullRequestUrlString: string | null;
}) => {
  return (
    <>
      <header class="bg-white z-10 border-b sticky top-0 max-w-screen-md mx-auto p-4">
        <form method="get" action="/" class="flex gap-1 items-end">
          <div class="flex flex-col gap-1 flex-1">
            <label for="url" class="font-semibold text-sm">
              Pull Request URL:
            </label>
            <input
              name="url"
              id="url"
              type="url"
              placeholder="https://github.com/..."
              value={pullRequestUrlString ?? ""}
              class="border p-1 rounded flex-1"
            />
          </div>
          <button
            type="submit"
            class="bg-sky-600 font-semibold text-white py-1 px-2 border border-sky-600 rounded"
          >
            Submit
          </button>
        </form>
      </header>

      {pullRequestUrlString && (
        <main class="max-w-screen-md mx-auto p-4">
          <Suspense
            fallback={
              <p class="text-center p-16 text-gray-500">
                Loading Pull Request…
              </p>
            }
          >
            <PullRequestLoader pullRequestUrlString={pullRequestUrlString} />
          </Suspense>
        </main>
      )}
    </>
  );
};

const PullRequestLoader = async ({
  pullRequestUrlString,
}: {
  pullRequestUrlString: string;
}) => {
  try {
    const pullRequestParams = getPullRequestParams(pullRequestUrlString);
    if (!pullRequestParams) {
      throw new Error(
        `Invalid GitHub pull request URL: ${pullRequestUrlString}`,
      );
    }
    const { owner, repo, pullNumber } = pullRequestParams;

    const { pullRequest, issueComments, pullRequestComments } =
      await cachedGetPullRequestInfoAndComments({ owner, repo, pullNumber });

    return (
      <Suspense
        fallback={
          <PullRequestReport
            pullRequest={pullRequest}
            issueComments={issueComments}
            pullRequestComments={pullRequestComments}
          />
        }
      >
        <PullRequestReportLoader
          pullRequest={pullRequest}
          issueComments={issueComments}
          pullRequestComments={pullRequestComments}
        />
      </Suspense>
    );
  } catch (error) {
    return <p>An error happened: {error}</p>;
  }
};

const PullRequestReportLoader = async ({
  pullRequest,
  issueComments,
  pullRequestComments,
}: Awaited<ReturnType<typeof getPullRequestInfoAndComments>>) => {
  try {
    const report = await cachedGeneratePullRequestReport({
      pullRequest,
      issueComments,
      pullRequestComments,
    });
    return (
      <PullRequestReport
        pullRequest={pullRequest}
        issueComments={issueComments}
        pullRequestComments={pullRequestComments}
        report={report}
      />
    );
  } catch (error) {
    return <p>An error happened: {error}</p>;
  }
};

const GradeBadge = ({ grade }: { grade: "A" | "B" | "C" | "D" }) => {
  const bgColor = match(grade)
    .with("A", () => "bg-green-700")
    .with("B", () => "bg-green-700")
    .with("C", () => "bg-amber-600")
    .with("D", () => "bg-red-700")
    .exhaustive();

  return (
    <div
      class={`rounded-full absolute right-5 top-0 -translate-y-1/2 ${bgColor} text-white w-8 h-8 font-bold flex items-center justify-center`}
    >
      {grade}
    </div>
  );
};

const PullRequestReport = ({
  pullRequest,
  issueComments,
  pullRequestComments,
  report,
}: Awaited<ReturnType<typeof getPullRequestInfoAndComments>> & {
  report?: Report;
}) => {
  return (
    <div class="flex flex-col gap-4 [&_h2]:font-bold [&_h2]:mb-2 [&_section>h2:first-child]:-mt-1">
      <header>
        <h1 class="font-bold">{pullRequest.title}</h1>
        <p class="text-sm">By @{pullRequest.user.login}</p>
      </header>

      <section class="bg-white border p-4 rounded text-sm mr-4 overflow-hidden">
        <h2>Description</h2>
        <p class="line-clamp-3">{pullRequest.body}</p>
      </section>

      <section class="relative border border-sky-100 bg-sky-50 p-4 rounded -mt-6 ml-4 text-sm">
        {report ? (
          <>
            <GradeBadge grade={report.descriptionGrade} />
            <p>{report?.descriptionReport}</p>
          </>
        ) : (
          <>
            <p>Generating report…</p>
          </>
        )}
      </section>

      {[...issueComments, ...pullRequestComments].map((comment) => {
        const commentReport = report?.commentReports.find(
          (c) => c.commentId === comment.id,
        );
        return (
          <Fragment key={String(comment.id)}>
            <section class="bg-white border p-4 rounded text-sm mr-4 overflow-hidden">
              <h2>Comment by @{comment.user?.login}</h2>
              <p class="line-clamp-3">{comment.body}</p>
            </section>

            <section class="relative border border-sky-100 bg-sky-50 p-4 rounded -mt-6 ml-4 text-sm">
              {commentReport ? (
                <>
                  <GradeBadge grade={commentReport.commentGrade} />
                  <p>{commentReport.commentReport}</p>
                </>
              ) : report ? (
                <p>No report was generated for this comment.</p>
              ) : (
                <p>Generating report…</p>
              )}
            </section>
          </Fragment>
        );
      })}
    </div>
  );
};

app.use(
  "/",
  jsxRenderer(
    ({ children }) => {
      return (
        <html>
          <head>
            <title>Rereview</title>
            <meta charset="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="bg-gray-50">{children}</body>
        </html>
      );
    },
    { stream: true },
  ),
);

app.get("/", (c) => {
  const url = new URL(c.req.url);
  const pullRequestUrlString = url.searchParams.get("url");
  return c.render(<App pullRequestUrlString={pullRequestUrlString} />);
});

Deno.serve(app.fetch);
