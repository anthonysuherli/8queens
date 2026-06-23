import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings and paragraphs", () => {
    const html = renderMarkdown("## Title\n\nHello world.");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<p>Hello world.</p>");
  });

  it("renders bold, italic, and inline code", () => {
    const html = renderMarkdown("a **b** c *d* e `f`");
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<em>d</em>");
    expect(html).toContain("<code>f</code>");
  });

  it("renders safe links and drops javascript: urls", () => {
    expect(renderMarkdown("[ok](https://x.com)")).toContain('href="https://x.com"');
    expect(renderMarkdown("[ok](https://x.com)")).toContain('rel="noreferrer"');
    expect(renderMarkdown("[bad](javascript:alert(1))")).not.toContain("javascript:");
  });

  it("escapes raw HTML in the source", () => {
    const html = renderMarkdown("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- one\n- two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
  });
});
