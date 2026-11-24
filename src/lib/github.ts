import {
  inspectPackageJson,
  type PackageManager,
  type ProjectProfile,
} from "./profile";

export interface GitHubRepository {
  readonly owner: string;
  readonly repo: string;
}

const agentFileNames = ["AGENTS.md", "CLAUDE.md", ".cursorrules"] as const;
type AgentFileName = (typeof agentFileNames)[number];

export interface RepositoryAgentFile {
  readonly name: AgentFileName;
  readonly markdown: string | null;
}

export interface RepositoryInspection {
  readonly repository: GitHubRepository;
  readonly packageJson: string | null;
  readonly profile: ProjectProfile | null;
  readonly packageNotice: string | null;
  readonly agentFiles: readonly RepositoryAgentFile[];
}

type GitHubErrorCode =
  | "invalid_repository"
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "invalid_token"
  | "github_unavailable";

export class GitHubInspectionError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseGitHubRepository(input: string): GitHubRepository | null {
  const match =
    /^(?:https:\/\/github\.com\/)?([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\/([a-z0-9_.-]{1,104})\/?$/i.exec(
      input.trim(),
    );
  if (!match) return null;
  const [, owner, name] = match;
  const repo = name.replace(/\.git$/i, "");
  if (!repo || repo === "." || repo === ".." || repo.length > 100) return null;
  return { owner, repo };
}

// Prefer a declared manager when its lockfile exists. Otherwise use this order.
const lockfiles: ReadonlyArray<readonly [string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];
const maxFileBytes = 1024 * 1024;

interface GitTreeFile {
  readonly path: string;
  readonly mode: string;
  readonly sha: string;
  readonly size: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGitTreeFile(value: unknown): value is GitTreeFile {
  return (
    isRecord(value) &&
    value.type === "blob" &&
    (value.mode === "100644" || value.mode === "100755") &&
    typeof value.path === "string" &&
    typeof value.sha === "string" &&
    /^[a-f0-9]{40}$/i.test(value.sha) &&
    typeof value.size === "number" &&
    value.size >= 0
  );
}

function notFound() {
  return new GitHubInspectionError(
    "not_found",
    404,
    "The public repository could not be found.",
  );
}

function unavailable() {
  return new GitHubInspectionError(
    "github_unavailable",
    502,
    "GitHub could not complete the inspection. Try again shortly.",
  );
}

export async function inspectGitHubRepository(
  input: string,
  options: {
    readonly githubToken?: string;
    readonly fetcher?: typeof fetch;
  } = {},
): Promise<RepositoryInspection> {
  const repository = parseGitHubRepository(input);
  if (!repository) {
    throw new GitHubInspectionError(
      "invalid_repository",
      400,
      "Enter a GitHub repository URL or owner/repo.",
    );
  }
  const { fetcher = fetch } = options;
  const token = options.githubToken?.trim();
  if (token && (token.length > 1024 || !/^[A-Za-z0-9._~+/=-]+$/.test(token))) {
    throw new GitHubInspectionError(
      "invalid_request",
      400,
      "Enter a valid GitHub token.",
    );
  }
  const base = `https://api.github.com/repos/${repository.owner}/${repository.repo}`;
  const signal = AbortSignal.timeout(15_000);

  async function request(
    path: string,
    accept = "application/vnd.github+json",
    allowEmpty = false,
  ) {
    const response = await fetcher(base + path, {
      headers: {
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (response.ok || (allowEmpty && response.status === 409)) return response;
    const rateLimited =
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.has("retry-after") ||
          /rate limit/i.test(await response.text())));
    if (rateLimited) {
      throw new GitHubInspectionError(
        "rate_limited",
        429,
        "GitHub's rate limit was reached. Wait before retrying or supply a GitHub token.",
      );
    }
    if (response.status === 404) throw notFound();
    if (response.status === 401) {
      throw new GitHubInspectionError(
        "invalid_token",
        401,
        "GitHub rejected the supplied token.",
      );
    }
    throw unavailable();
  }

  try {
    const metadata: unknown = await (await request("")).json();
    if (!isRecord(metadata) || typeof metadata.private !== "boolean")
      throw unavailable();
    if (metadata.private || metadata.visibility === "internal")
      throw notFound();
    if (
      typeof metadata.default_branch !== "string" ||
      !metadata.default_branch ||
      metadata.default_branch === "." ||
      metadata.default_branch === ".."
    )
      throw unavailable();

    const root = await request(
      `/git/trees/${encodeURIComponent(metadata.default_branch)}`,
      undefined,
      true,
    );
    const snapshot: unknown =
      root.status === 409 ? { tree: [] } : await root.json();
    if (
      !isRecord(snapshot) ||
      !Array.isArray(snapshot.tree) ||
      snapshot.truncated === true
    )
      throw unavailable();

    const files = new Map(
      snapshot.tree.filter(isGitTreeFile).map((file) => [file.path, file]),
    );
    async function readBlob(file: GitTreeFile): Promise<string> {
      return (
        await request(
          `/git/blobs/${file.sha}`,
          "application/vnd.github.raw+json",
        )
      ).text();
    }

    const manifest = files.get("package.json");
    let packageJson: string | null = null;
    let profile: ProjectProfile | null = null;
    let packageNotice: string | null = "No root package.json was found.";
    if (manifest && manifest.size <= maxFileBytes) {
      packageJson = await readBlob(manifest);
      const presentManagers = lockfiles
        .filter(([name]) => files.has(name))
        .map(([, manager]) => manager);
      const result = inspectPackageJson(packageJson, presentManagers);
      if (result.ok) {
        profile = result.profile;
        packageNotice = null;
      } else {
        packageNotice = result.error.message;
      }
    } else if (manifest) {
      packageNotice =
        "The root package.json exceeds the 1 MiB inspection limit.";
    }

    const agentFiles: RepositoryAgentFile[] = [];
    for (const name of agentFileNames) {
      const file = files.get(name);
      if (file)
        agentFiles.push({
          name,
          markdown: file.size <= maxFileBytes ? await readBlob(file) : null,
        });
    }
    return { repository, packageJson, profile, packageNotice, agentFiles };
  } catch (error) {
    if (error instanceof GitHubInspectionError) throw error;
    throw unavailable();
  }
}
