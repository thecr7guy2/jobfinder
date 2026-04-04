import { describe, expect, it } from "vitest";

import { escapeLatex, paragraphsToLatex } from "@/lib/cover-letter/latex";
import { cleanRoleTitle, coverLetterSubject } from "@/lib/cover-letter/generate";
import { injectTemplatePlaceholders } from "@/lib/cover-letter/template";

describe("cover letter latex helpers", () => {
  it("escapes latex-sensitive characters", () => {
    expect(escapeLatex("Python & SQL_100%")).toBe("Python \\& SQL\\_100\\%");
    expect(escapeLatex("Use #1 {carefully}")).toBe("Use \\#1 \\{carefully\\}");
  });

  it("joins paragraphs into latex-safe body text", () => {
    expect(paragraphsToLatex(["First paragraph.", "Second & final paragraph."])).toBe(
      "First paragraph.\n\nSecond \\& final paragraph.",
    );
  });

  it("injects placeholders into the latex template", () => {
    expect(
      injectTemplatePlaceholders("Dear {{COMPANY_NAME}} for {{ROLE_TITLE}}", {
        COMPANY_NAME: "Booking.com",
        ROLE_TITLE: "Senior ML Engineer",
      }),
    ).toBe("Dear Booking.com for Senior ML Engineer");
  });

  it("sanitizes noisy scraped titles for the cover letter subject", () => {
    const rawTitle =
      "Medior Machine Learning Engineer Digital((Python, MLOps, Docker, Kubernetes)";

    const cleanedTitle = cleanRoleTitle(rawTitle);

    expect(cleanedTitle).toBe("Medior Machine Learning Engineer");
    expect(coverLetterSubject(cleanedTitle)).toBe(
      "Application for Medior Machine Learning Engineer",
    );
  });
});
