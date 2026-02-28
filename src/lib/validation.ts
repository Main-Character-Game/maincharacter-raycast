export class FormValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormValidationError";
  }
}

export type QuickAddFormInput = {
  title: string;
  notes: string;
};

export type NormalizedQuickAddInput = {
  title: string;
  notes?: string;
};

export function normalizeQuickAddInput(
  input: QuickAddFormInput,
): NormalizedQuickAddInput {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new FormValidationError("Title is required.");
  }

  const notes = input.notes.trim();

  return {
    title,
    ...(notes.length > 0 ? { notes } : {}),
  };
}
