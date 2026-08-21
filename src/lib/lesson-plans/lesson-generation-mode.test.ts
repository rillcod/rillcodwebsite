import { describe, expect, it } from "vitest";

import {
  contentTypeForLessonMode,
  inferLessonGenerationMode,
} from "./lesson-generation-mode";

describe("lesson generation mode", () => {
  it("uses the rich project engine when the official week carries a project", () => {
    expect(
      inferLessonGenerationMode({
        topic: "Sensors",
        project: { title: "Build a smart irrigation prototype" },
      })
    ).toBe("project");
  });

  it("uses interactive generation for labs, games and visual coding", () => {
    expect(
      inferLessonGenerationMode({
        topic: "Loops",
        activities: "Use Scratch blocks in a hands-on class game",
      })
    ).toBe("interactive");
  });

  it("keeps theory-led weeks academic", () => {
    const mode = inferLessonGenerationMode({
      topic: "What is a computer network?",
      objectives: "Explain nodes and connections",
    });
    expect(mode).toBe("academic");
    expect(contentTypeForLessonMode(mode)).toBe("lesson");
  });
});

