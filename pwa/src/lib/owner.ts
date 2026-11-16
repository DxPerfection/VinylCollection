// Is the signed-in account the owner? Checked against what GitHub reported, which cannot be edited afterwards.
import type { User } from "@supabase/supabase-js";

import { ownerGithubId } from "./config";

export function isOwner(user: User | null | undefined, ownerId: string = ownerGithubId): boolean {
  for (const identity of user?.identities ?? []) {
    if (identity.provider !== "github") continue;
    const data = identity.identity_data ?? {};
    if ([identity.id, data.provider_id, data.sub].map((value) => String(value ?? "")).includes(ownerId)) {
      return true;
    }
  }
  return false;
}

export function githubLogin(user: User | null | undefined): string {
  const identity = user?.identities?.find((item) => item.provider === "github");
  return String(identity?.identity_data?.user_name ?? user?.email ?? "");
}
