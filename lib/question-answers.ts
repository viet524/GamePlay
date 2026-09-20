import type { Question } from "@/lib/game-types";

export function normalizeAnswerText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("vi")
    .replace(/[.!?]+$/g, "");
}

function extractMultiSelectTokens(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }

  const text = String(raw).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
    if (parsed != null && String(parsed).trim()) {
      return [String(parsed).trim()];
    }
  } catch {
    /* not JSON */
  }

  const unwrapped = text.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!unwrapped) return [];

  if (/[;|]/.test(unwrapped)) {
    return unwrapped
      .split(/[;|]/)
      .map((part) => part.replace(/^["'\s]+|["'\s]+$/g, "").trim())
      .filter(Boolean);
  }

  if (/^["']?\s*.+\s*,\s*.+/.test(unwrapped) && !unwrapped.includes(";")) {
    return unwrapped
      .split(",")
      .map((part) => part.replace(/^["'\s]+|["'\s]+$/g, "").trim())
      .filter(Boolean);
  }

  return [unwrapped.replace(/^["']+|["']+$/g, "").trim()].filter(Boolean);
}

function resolveOptionToken(token: string, options: string[]): string | null {
  const normalized = normalizeAnswerText(token);
  if (!normalized) return null;

  const byText = options.find((item) => normalizeAnswerText(item) === normalized);
  if (byText) return byText;

  const letter = normalized.replace(/\./g, "");
  if (/^[a-h]$/.test(letter)) {
    const option = options[letter.charCodeAt(0) - 97];
    return option || null;
  }

  if (/^[1-8]$/.test(letter)) {
    const option = options[Number(letter) - 1];
    return option || null;
  }

  return null;
}

export function parseMultiSelectAnswers(raw: unknown, options: string[] = []): string[] {
  const tokens = extractMultiSelectTokens(raw);
  if (tokens.length === 0) return [];
  if (options.length === 0) {
    return [...new Set(tokens)];
  }

  const matched: string[] = [];
  for (const token of tokens) {
    const option = resolveOptionToken(token, options);
    if (option && !matched.includes(option)) matched.push(option);
  }
  return matched;
}

export function stringifyMultiSelectAnswers(answers: string[]): string {
  return JSON.stringify(answers);
}

export function detectCsvDelimiter(headerLine: string): "," | ";" {
  let inQuote = false;
  let commas = 0;
  let semicolons = 0;
  for (const char of headerLine) {
    if (char === '"') {
      inQuote = !inQuote;
    } else if (!inQuote && char === ",") {
      commas += 1;
    } else if (!inQuote && char === ";") {
      semicolons += 1;
    }
  }
  return semicolons > commas ? ";" : ",";
}

export function parseCsvRow(line: string, delimiter: "," | ";" = ","): string[] {
  const fields: string[] = [];
  let inQuote = false;
  let current = "";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuote && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === delimiter && !inQuote) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

export function getMainQuestions(questions: Question[]): Question[] {
  return questions.filter((q) => !q.isBackup);
}

export function getBackupsForParent(questions: Question[], parentId: string): Question[] {
  return questions.filter((q) => q.isBackup && q.parentQuestionId === parentId);
}

export function pickUnusedBackup(backups: Question[], usedIds: string[]): Question | null {
  const unused = backups.filter((q) => !usedIds.includes(q.id));
  if (unused.length === 0) return null;
  const index = Math.floor(Math.random() * unused.length);
  return unused[index];
}
