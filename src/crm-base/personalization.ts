export function personalizationText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value !== 'object') {
    return String(value);
  }

  const record = value as Record<string, unknown>;
  const preferred = ['text', 'texte', 'message', 'personalization', 'gravure'];
  for (const key of preferred) {
    const item = record[key];
    if (typeof item === 'string' && item.trim()) {
      return item.trim();
    }
  }

  if (Array.isArray(record.texts)) {
    return record.texts
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(' · ');
  }

  return Object.values(record)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' · ');
}

export function toPersonalizationJson(text?: string | null) {
  const value = text?.trim();
  return value ? { text: value } : null;
}
