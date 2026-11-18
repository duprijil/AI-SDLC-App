const MAXIMUM_SLUG_LENGTH = 40;
const FALLBACK_SLUG = "work";

const slugOf = (title: string): string => {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (words.length <= MAXIMUM_SLUG_LENGTH) {
    return words || FALLBACK_SLUG;
  }
  const cut = words.slice(0, MAXIMUM_SLUG_LENGTH);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "") || FALLBACK_SLUG;
};

export const BranchName = {
  forTicket(pattern: string, ticketKey: string, title: string): string {
    return pattern.replaceAll("{key}", ticketKey).replaceAll("{slug}", slugOf(title));
  },
};
