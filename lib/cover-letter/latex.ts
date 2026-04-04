export function escapeLatex(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([%&#_$])/g, "\\$1")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
}

export function paragraphsToLatex(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => escapeLatex(paragraph.trim()))
    .filter(Boolean)
    .join("\n\n");
}
