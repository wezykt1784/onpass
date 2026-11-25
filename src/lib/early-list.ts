// Checks for the landing page's early list form. Shared by both data layers so the rules match.
export interface EarlyListInput { email: string; name: string; company: string; sites: number }

export function earlyListProblem(i: EarlyListInput): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email) || i.email.length > 200) return "Check the email address.";
  if (!i.name.trim() || i.name.length > 80) return "Add your name.";
  if (!i.company.trim() || i.company.length > 120) return "Add your company.";
  if (!Number.isInteger(i.sites) || i.sites < 1 || i.sites > 5000) return "Add how many sites you run, as a number.";
  return null;
}
