export function splitOrderName(fullName?: string | null) {
  const clientName = (fullName || '').trim();
  const [firstName = '', ...rest] = clientName.split(/\s+/);
  return {
    clientName,
    firstName,
    lastName: rest.join(' '),
  };
}

export function joinOrderName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}
