import { generatePullRequestReport } from "./generate-pr-report.ts";

if (import.meta.main) {
  Deno.serve(async (req) => {
    const url = new URL(req.url);
    const pullRequestUrlString = url.searchParams.get("url");
    if (!pullRequestUrlString) {
      return new Response(`Invalid URL: ${pullRequestUrlString}`, {
        status: 422,
      });
    }

    try {
      const report = await generatePullRequestReport(pullRequestUrlString);
      return new Response(JSON.stringify(report), {
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      return new Response(`Error while generating report: ${error}`, {
        status: 500,
      });
    }
  });
}
