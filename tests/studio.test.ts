// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Studio from "../src/components/studio";
import { buildGreenfieldProfile } from "../src/lib/profile";
import { generateAgentsMd } from "../src/lib/generators";

afterEach(cleanup);

it("updates commands, engineering rules, and boundaries from the greenfield controls", () => {
  render(createElement(Studio));
  const preview = screen.getByLabelText("Markdown preview");
  fireEvent.click(screen.getByRole("button", { name: "pnpm" }));
  expect(preview.textContent).toContain("pnpm run typecheck");
  fireEvent.click(screen.getByLabelText("Strict TypeScript"));
  fireEvent.click(screen.getByLabelText("Test-first workflow"));
  expect(preview.textContent).not.toContain("strict: true");
  expect(preview.textContent).not.toContain("start with one failing test");
  fireEvent.change(screen.getByLabelText("Protected paths"), {
    target: { value: "vendor/" },
  });
  fireEvent.change(screen.getByLabelText("Custom rules"), {
    target: { value: "Use stable identifiers." },
  });
  expect(preview.textContent).toContain("vendor/");
  expect(preview.textContent).toContain("Use stable identifiers.");
});

it("handles malformed manifests, both presets, and pasted agent diagnostics", () => {
  render(createElement(Studio));
  fireEvent.click(screen.getByRole("button", { name: "Existing repo" }));
  fireEvent.change(screen.getByLabelText("package.json"), {
    target: { value: "{" },
  });
  expect(screen.getByRole("status").textContent).toContain("Invalid");
  for (const name of ["Next.js Full-Stack App", "TypeScript CLI Tool"]) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Markdown preview").textContent).toContain(
      "Detected stack",
    );
  }
  fireEvent.click(screen.getByRole("button", { name: "Audit file" }));
  fireEvent.change(screen.getByLabelText("Existing AGENTS.md"), {
    target: { value: "Follow best practices" },
  });
  expect(
    screen.getByText(/gives the agent little concrete guidance/),
  ).toBeTruthy();
});

it("uses the blueprint edits and the audited YAML name in destination paths", () => {
  render(createElement(Studio));
  fireEvent.click(
    screen.getByRole("button", { name: "SKILL.md Blueprint Studio" }),
  );
  fireEvent.change(screen.getByLabelText("Blueprint"), {
    target: { value: "pr-reviewer" },
  });
  fireEvent.change(screen.getByLabelText("Workflow steps · one per line"), {
    target: { value: "Read the patch\nCheck the tests" },
  });
  expect(screen.getByLabelText("Markdown preview").textContent).toContain(
    "2. Check the tests",
  );
  fireEvent.change(screen.getByLabelText("Skill name"), {
    target: { value: "Bad Slug" },
  });
  expect(screen.getByRole("status").textContent).toContain("Skill name");
  fireEvent.click(screen.getByLabelText("Audit existing SKILL.md"));
  fireEvent.change(screen.getByLabelText("Existing SKILL.md"), {
    target: {
      value:
        "---\nname: pasted-name\ndescription: Check tests when reviewing changes.\n---",
    },
  });
  fireEvent.change(screen.getByLabelText("Agent target"), {
    target: { value: "cursor" },
  });
  expect(screen.getByText(".cursor/skills/pasted-name/SKILL.md")).toBeTruthy();
});

it("enforces the generator's size and tree limits for custom instructions", () => {
  const profile = buildGreenfieldProfile({ stack: [] });
  expect(() =>
    generateAgentsMd(profile, { customRules: ["└── files"] }),
  ).toThrow(/directory trees/);
  expect(() =>
    generateAgentsMd(profile, {
      customRules: Array.from({ length: 150 }, (_, i) => String(i)),
    }),
  ).toThrow(/150 lines/);
});
