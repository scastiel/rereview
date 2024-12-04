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
  if (!pullRequestUrlString) {
    return (
      <>
        <GitHubButton />
        <div class="min-h-full flex flex-col items-center justify-center  p-4">
          <main class="max-w-3xl w-full space-y-8 text-center">
            <h1 class="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl bg-clip-text text-transparent bg-gradient-to-r from-sky-600 via-purple-500 to-pink-600 w-fit mx-auto">
              Review Mentor
            </h1>
            <p class="text-xl sm:text-2xl font-light leading-relaxed text-gray-300 text-balance">
              Transform your code reviews into a strategic advantage
            </p>
            <ul class="flex flex-col items-start space-y-4 mx-auto w-fit">
              {[
                "Improve team communication",
                "Accelerate knowledge sharing",
                "Build a stronger engineering culture",
              ].map((item, index) => (
                <li key={index} class="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="size-6 mr-2 text-sky-600"
                  >
                    <path d="M21.801 10A10 10 0 1 1 17 3.335" />
                    <path d="m9 11 3 3L22 4" />
                  </svg>
                  <span class="sm:text-lg text-gray-300">{item}</span>
                </li>
              ))}
            </ul>
            <form
              action="/"
              methog="get"
              class="mt-8 flex flex-row gap-2 justify-center items-center"
            >
              <input
                type="url"
                name="url"
                id="url"
                placeholder="Enter your pull request URL"
                class="w-full max-w-96 bg-gray-800 text-white border-gray-700 placeholder-gray-500 px-3 py-2 rounded"
                required
              />
              <GoButton />
            </form>
            <p class="text-sm text-gray-400 mt-4 text-balance">
              Turn code reviews from a routine task into your team's strategic
              advantage.
            </p>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <GitHubButton />
      <div>
        <header class="bg-gray-900">
          <div class="max-w-screen-md mx-auto px-4 pt-4">
            <h1 class="text-lg font-bold leading-none tracking-tight sm:text-xl md:text-3xl bg-clip-text text-transparent bg-gradient-to-r from-sky-600 via-purple-500 to-pink-600 w-fit">
              <a href="/">Review Mentor</a>
            </h1>
          </div>
        </header>
        <header class="-mt-0.5 z-10 sticky top-0 bg-gray-900">
          <div class="max-w-screen-md mx-auto p-4">
            <form method="get" action="/" class="flex gap-2">
              <label for="url" class="font-semibold text-sm sr-only">
                Pull Request URL:
              </label>
              <input
                type="url"
                name="url"
                id="url"
                placeholder="Enter your pull request URL"
                class="w-full bg-gray-800 text-white border-gray-700 placeholder-gray-500 px-3 py-2 rounded"
                value={pullRequestUrlString ?? ""}
                required
              />
              <GoButton />
            </form>
          </div>
          <div class="h-1 bg-gradient-to-r from-sky-600 to-pink-600" />
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

const GitHubButton = () => {
  return (
    <a
      href="https://github.com/scastiel/rereview"
      target="_blank"
      class="z-20 absolute top-0 right-0 w-0 border-[30px] border-transparent border-t-gray-800 border-r-gray-800"
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
  );
};

const GoButton = () => {
  return (
    <button
      type="submit"
      class="bg-pink-600 hover:bg-pink-700 text-white font-semibold transition-colors duration-300 py-2 px-2 rounded"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-5 inline mr-1"
      >
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
        <path d="M4 17v2" />
        <path d="M5 18H3" />
      </svg>
    </button>
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
    <div class="flex flex-col gap-6 [&_h2]:font-bold [&_h2]:mb-2 [&_section>h2:first-child]:-mt-1">
      <header>
        <h1 class="font-bold">{pullRequest.title}</h1>
        <p class="text-sm">By @{pullRequest.user.login}</p>
      </header>

      <section class="bg-gray-800 p-4 rounded text-sm mr-4 overflow-hidden">
        <h2>Description</h2>
        <div
          class="prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{
            __html: render(pullRequest.body ?? "No description"),
          }}
        />
      </section>

      <section class="relative bg-gradient-to-br from-sky-800 to-sky-900 p-4 rounded -mt-8 ml-4 text-sm text-slate-300">
        {report ? (
          <>
            <GradeBadge grade={report.descriptionGrade} />
            <div
              class="prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: render(report.descriptionReport),
              }}
            />
          </>
        ) : (
          <>
            <p>
              <Spinner /> Generating description review…
            </p>
          </>
        )}
      </section>

      {[...issueComments, ...pullRequestComments].map((comment) => {
        const commentReport = report?.commentReports.find(
          (c) => c.commentId === comment.id,
        );
        return (
          <Fragment key={String(comment.id)}>
            <section class="bg-gray-800 p-4 rounded text-sm mr-4 overflow-hidden">
              <h2>Comment by @{comment.user?.login}</h2>
              <div
                class="prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: render(comment.body ?? "No comment content"),
                }}
              />
            </section>

            <section class="relative bg-gradient-to-br from-sky-800 to-sky-900 p-4 rounded -mt-8 ml-4 text-sm text-slate-300">
              {commentReport ? (
                <>
                  <GradeBadge grade={commentReport.commentGrade} />
                  <div
                    class="prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: render(commentReport.commentReport),
                    }}
                  />
                </>
              ) : report ? (
                <p>No report was generated for this comment.</p>
              ) : (
                <p>
                  <Spinner /> Generating comment review…
                </p>
              )}
            </section>
          </Fragment>
        );
      })}
    </div>
  );
};

const Spinner = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="inline size-4 -mt-0.5 mr-1 animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
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
          <body class="h-dvh bg-gray-900 bg-gradient-to-b from-gray-900 to-black text-gray-100 bg-fixed bg-contain">
            {children}
          </body>
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
