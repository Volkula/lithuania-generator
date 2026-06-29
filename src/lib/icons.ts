// Resolve a public icon path to a usable URL. Spaces must be percent-encoded;
// brackets/commas present in the faction filenames are left intact.
export function iconUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${encodeURI(file)}`;
}
