// Discord member counts for the community card (12-spec-community), read on the server from
// the public invite endpoint. It needs no bot, no guild ID and no "server widget" setting,
// and the visitor's browser never contacts Discord.

export interface DiscordCounts {
  members: number;
  online: number;
}

/** "https://discord.gg/PkQt42bDtk" → "PkQt42bDtk". */
export function inviteCode(invite: string): string | null {
  const match = /^https:\/\/discord\.gg\/([\w-]+)\/?$/.exec(invite);
  return match?.[1] ?? null;
}

/** The counts from an invite response, or null when they are missing. */
export function parseInvite(body: unknown): DiscordCounts | null {
  if (typeof body !== 'object' || body === null) return null;
  const { approximate_member_count: members, approximate_presence_count: online } = body as Record<
    string,
    unknown
  >;
  if (typeof members !== 'number' || typeof online !== 'number') return null;
  return { members, online };
}

export const inviteUrl = (code: string) =>
  `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`;
