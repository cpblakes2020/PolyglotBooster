const adminEmails = new Set(["cpblakes2020@gmail.com"]);

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && adminEmails.has(email));
}
