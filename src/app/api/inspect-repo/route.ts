import {
  GitHubInspectionError,
  inspectGitHubRepository,
} from "../../../lib/github";

const headers = { "Cache-Control": "no-store" };

function invalidRequest() {
  return Response.json(
    {
      error: {
        code: "invalid_request",
        message:
          "Send a repository URL or owner/repo as url and an optional string githubToken.",
      },
    },
    { status: 400, headers },
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("url" in body) ||
    typeof body.url !== "string"
  ) {
    return invalidRequest();
  }
  const githubToken = "githubToken" in body ? body.githubToken : undefined;
  if (githubToken !== undefined && typeof githubToken !== "string")
    return invalidRequest();

  try {
    return Response.json(
      await inspectGitHubRepository(body.url, { githubToken }),
      { headers },
    );
  } catch (error) {
    if (error instanceof GitHubInspectionError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status, headers },
      );
    }
    return Response.json(
      {
        error: {
          code: "github_unavailable",
          message: "GitHub could not complete the inspection.",
        },
      },
      { status: 502, headers },
    );
  }
}
