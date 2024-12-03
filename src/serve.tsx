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
import { render } from "@deno/gfm";

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
      <a
        href="https://github.com/scastiel/rereview"
        target="_blank"
        class="z-20 absolute top-0 right-0 w-0 border-[30px] border-transparent border-t-sky-700 border-r-sky-700"
      >
        <div class="block rotate-45 -mt-6 px-1">
          <svg
            class="size-4"
            viewbox="0 0 98 96"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
              fill="#fff"
            />
          </svg>
        </div>
      </a>
      <div>
        <header class="bg-white">
          <div class="max-w-screen-md mx-auto px-4 pt-4">
            <div class="flex justify-between items-start">
              <h1 class="font-bold text-xl bg-gradient-to-b from-sky-900 to-sky-500 bg-clip-text text-transparent">
                <a href="/">Rereview</a>
              </h1>
            </div>
            <p class="text-xs sm:text-sm italic text-gray-500">
              Evaluate how good the communication is in your pull request.
            </p>
          </div>
        </header>
        <header class="bg-white z-10 border-b sticky top-0">
          <div class="max-w-screen-md mx-auto p-4">
            <form method="get" action="/" class="flex gap-1 items-end">
              <div class="flex flex-col gap-1 flex-1">
                <label for="url" class="font-semibold text-sm sr-only">
                  Pull Request URL:
                </label>
                <input
                  name="url"
                  id="url"
                  type="url"
                  placeholder="Pull Request URL, e.g. https://github.com/..."
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
          </div>
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
      </div>
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
        <div
          class="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{
            __html: render(pullRequest.body ?? "No description"),
          }}
        />
      </section>

      <section class="relative border border-sky-100 bg-sky-50 p-4 rounded -mt-6 ml-4 text-sm">
        {report ? (
          <>
            <GradeBadge grade={report.descriptionGrade} />
            <div
              class="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: render(report.descriptionReport),
              }}
            />
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
              <div
                class="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: render(comment.body ?? "No comment content"),
                }}
              />
            </section>

            <section class="relative border border-sky-100 bg-sky-50 p-4 rounded -mt-6 ml-4 text-sm">
              {commentReport ? (
                <>
                  <GradeBadge grade={commentReport.commentGrade} />
                  <div
                    class="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: render(commentReport.commentReport),
                    }}
                  />
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
            <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
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
