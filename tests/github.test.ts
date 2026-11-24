import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/inspect-repo/route";
import {
  inspectGitHubRepository,
  parseGitHubRepository,
} from "../src/lib/github";

const base = "https://api.github.com/repos/example/project";
const manifest = JSON.stringify({
  dependencies: { next: "16" },
  scripts: { build: "next build" },
});
const metadata = { private: false, default_branch: "staging/main" };

function entry(path: string, number: number, size = 100) {
  return {
    path,
    mode: "100644",
    type: "blob",
    sha: number.toString(16).padStart(40, "0"),
    size,
  };
}

function mockRepository(
  files: readonly ReturnType<typeof entry>[],
  bodies: readonly string[] = [],
) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(metadata))
    .mockResolvedValueOnce(Response.json({ tree: files, truncated: false }));
  for (const body of bodies) fetcher.mockResolvedValueOnce(new Response(body));
  return fetcher;
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/inspect-repo", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("parseGitHubRepository", () => {
  it.each([
    "owner/next.js",
    " https://github.com/owner/next.js ",
    "https://github.com/owner/next.js.git/",
  ])("parses %s", (input) =>
    expect(parseGitHubRepository(input)).toEqual({
      owner: "owner",
      repo: "next.js",
    }),
  );

  it.each([
    "",
    "owner",
    "owner/..",
    "owner/.",
    "owner/%2e%2e",
    "http://github.com/o/r",
    "https://github.com.evil.example/o/r",
    "https://github.com@evil.example/o/r",
    "https://user@github.com/o/r",
    "https://github.com:443/o/r",
    "https://github.com/o/r/tree/main",
    "https://github.com/o/r?ref=main",
    "https://github.com/o/r#readme",
    "owner\\repo",
    "-owner/repo",
  ])("rejects %s", (input) => expect(parseGitHubRepository(input)).toBeNull());
});

describe("inspectGitHubRepository", () => {
  it.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ])(
    "uses %s to override the manifest package manager",
    async (lockfile, manager) => {
      const fetcher = mockRepository(
        [entry("package.json", 1), entry(lockfile, 2)],
        [
          JSON.stringify({
            packageManager: manager === "npm" ? "pnpm@10" : "npm@11",
          }),
        ],
      );
      await expect(
        inspectGitHubRepository("example/project", { fetcher }),
      ).resolves.toMatchObject({
        profile: { packageManager: manager },
      });
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );

  it("prefers a declared manager with a matching lockfile when several exist", async () => {
    const fetcher = mockRepository(
      [
        entry("package.json", 1),
        entry("pnpm-lock.yaml", 2),
        entry("package-lock.json", 3),
      ],
      [JSON.stringify({ packageManager: "npm@11" })],
    );
    await expect(
      inspectGitHubRepository("example/project", { fetcher }),
    ).resolves.toMatchObject({
      profile: { packageManager: "npm" },
    });
  });

  it("reads manifest and agent text by blob SHA from the default branch root", async () => {
    const agents = entry("AGENTS.md", 2);
    const fetcher = mockRepository(
      [
        entry("package.json", 1),
        agents,
        entry("CLAUDE.md", 3),
        entry(".cursorrules", 4),
        entry(".env.local", 5),
      ],
      [manifest, "# Team instructions", "# Claude", "Use TypeScript"],
    );
    const result = await inspectGitHubRepository("example/project", {
      fetcher,
      githubToken: "fake_test_token",
    });
    expect(result).toEqual({
      repository: { owner: "example", repo: "project" },
      packageJson: manifest,
      packageNotice: null,
      profile: {
        source: "package-json",
        packageManager: "npm",
        stack: ["nextjs"],
        scripts: { build: "next build" },
      },
      agentFiles: [
        { name: "AGENTS.md", markdown: "# Team instructions" },
        { name: "CLAUDE.md", markdown: "# Claude" },
        { name: ".cursorrules", markdown: "Use TypeScript" },
      ],
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      base,
      base + "/git/trees/staging%2Fmain",
      ...[1, 2, 3, 4].map(
        (number) => base + "/git/blobs/" + entry("", number).sha,
      ),
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer fake_test_token",
      );
      expect(init?.cache).toBe("no-store");
    }
    expect(JSON.stringify(result)).not.toContain("fake_test_token");
  });

  it("supports repositories without package.json and skips symlinks and oversized blobs", async () => {
    const fetcher = mockRepository(
      [
        entry("AGENTS.md", 1, 1024 * 1024 + 1),
        { ...entry("CLAUDE.md", 2), mode: "120000" },
        entry(".cursorrules", 3),
      ],
      ["Project instructions"],
    );
    await expect(
      inspectGitHubRepository("example/project", { fetcher }),
    ).resolves.toEqual({
      repository: { owner: "example", repo: "project" },
      packageJson: null,
      profile: null,
      packageNotice: "No root package.json was found.",
      agentFiles: [
        { name: "AGENTS.md", markdown: null },
        { name: ".cursorrules", markdown: "Project instructions" },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has("Authorization"),
    ).toBe(false);
  });

  it("keeps agent files available if the root manifest contains invalid JSON", async () => {
    const fetcher = mockRepository(
      [entry("package.json", 1), entry("AGENTS.md", 2)],
      ["{", "# Rules"],
    );
    await expect(
      inspectGitHubRepository("example/project", { fetcher }),
    ).resolves.toMatchObject({
      profile: null,
      packageNotice: "Invalid package.json JSON.",
      agentFiles: [{ name: "AGENTS.md", markdown: "# Rules" }],
    });
  });

  it("supports an empty repository", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    await expect(
      inspectGitHubRepository("example/project", { fetcher }),
    ).resolves.toMatchObject({
      profile: null,
      agentFiles: [],
    });
  });
});

describe("POST /api/inspect-repo", () => {
  it("returns a successful inspection with caching disabled", async () => {
    vi.stubGlobal(
      "fetch",
      mockRepository([entry("package.json", 1)], [manifest]),
    );
    const response = await post({ url: "https://github.com/example/project" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      profile: { stack: ["nextjs"] },
    });
  });

  it("rejects malformed requests and invalid repository URLs before fetching", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await POST(
          new Request("http://localhost", { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await post({ url: "example/project", githubToken: 123 })).status,
    ).toBe(400);
    expect(
      (
        await post({
          url: "example/project",
          githubToken: "abc\r\nother: value",
        })
      ).status,
    ).toBe(400);
    const response = await post({ url: "https://example.org/example/project" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_repository" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [new Response(null, { status: 404 }), 404, "not_found"],
    [Response.json({ ...metadata, private: true }), 404, "not_found"],
    [new Response(null, { status: 429 }), 429, "rate_limited"],
    [
      new Response(null, {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
      429,
      "rate_limited",
    ],
    [
      Response.json(
        { message: "You have exceeded a secondary rate limit." },
        { status: 403 },
      ),
      429,
      "rate_limited",
    ],
    [new Response(null, { status: 401 }), 401, "invalid_token"],
  ])(
    "maps the upstream response to a structured %i error",
    async (upstream, status, code) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(upstream);
      vi.stubGlobal("fetch", fetcher);
      const response = await post({
        url: "example/project",
        githubToken: "fake_test_token",
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: { code, message: expect.any(String) },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("redacts upstream exceptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("fake_test_token")),
    );
    const response = await post({
      url: "example/project",
      githubToken: "fake_test_token",
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: "github_unavailable",
        message: "GitHub could not complete the inspection. Try again shortly.",
      },
    });
  });
});
