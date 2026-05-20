export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function yesterday(reference = new Date()): string {
  const date = new Date(reference);
  date.setDate(date.getDate() - 1);
  return isoDate(date);
}

export function expandTemplate(template: string, date: string): string {
  return template.replaceAll("{date}", date).replaceAll("{from}", date).replaceAll("{to}", date);
}
