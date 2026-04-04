export type CoverLetterSections = {
  opening_paragraph: string;
  experience_paragraph: string;
  closing_paragraph: string;
};

export type GeneratedCoverLetter = {
  filename: string;
  tex: string;
  previewText: string;
};
