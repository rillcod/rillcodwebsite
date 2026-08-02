import { describe, expect, it } from "vitest";
import {
  escapeSlideXml,
  normaliseGeneratedSlides,
  renderGeneratedSlideSvg,
  wrapSlideText,
} from "./generated-deck";

describe("normaliseGeneratedSlides", () => {
  it("keeps a safe, concise eight-slide maximum", () => {
    const slides = Array.from({ length: 10 }, (_, index) => ({
      kind: index === 0 ? "title" : "unknown",
      kicker: "  Key   idea  ",
      title: `Slide ${index + 1}`,
      bullets: ["One", "Two", "Three", "Four", "Five", "Six"],
      takeaway: "A useful summary",
    }));
    const result = normaliseGeneratedSlides({ slides });
    expect(result).toHaveLength(8);
    expect(result[0].kind).toBe("title");
    expect(result[1].kind).toBe("concept");
    expect(result[0].kicker).toBe("Key idea");
    expect(result[0].bullets).toHaveLength(5);
  });

  it("drops rows without a title", () => {
    expect(
      normaliseGeneratedSlides({ slides: [{ bullets: ["No title"] }, null] })
    ).toEqual([]);
  });
});

describe("slide rendering", () => {
  it("wraps text without losing words", () => {
    expect(wrapSlideText("one two three four", 8)).toEqual([
      "one two",
      "three",
      "four",
    ]);
  });

  it("escapes generated text before writing SVG", () => {
    expect(escapeSlideXml('<script>&"')).toBe("&lt;script&gt;&amp;&quot;");
    const svg = renderGeneratedSlideSvg(
      {
        kind: "concept",
        kicker: "Core",
        title: "<script>alert(1)</script>",
        bullets: ["A & B"],
        takeaway: "Use <safe> examples",
      },
      {
        index: 0,
        total: 1,
        courseTitle: "Web & Design",
        week: 2,
      }
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("A &amp; B");
    expect(svg).toContain('width="1600" height="900"');
  });
});
