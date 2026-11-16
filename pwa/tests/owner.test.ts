import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { githubLogin, isOwner } from "../src/lib/owner";

function userWith(provider: string, providerId: string, login = "someone"): User {
  return {
    id: "u1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "",
    identities: [{
      id: providerId, identity_id: "i1", user_id: "u1", provider, created_at: "", last_sign_in_at: "", updated_at: "",
      identity_data: { provider_id: providerId, sub: providerId, user_name: login },
    }],
  } as User;
}

describe("isOwner", () => {
  it("lets in only the owner's GitHub account", () => {
    expect(isOwner(userWith("github", "26037275", "DxPerfection"))).toBe(true);
    expect(isOwner(userWith("github", "123"))).toBe(false);
    expect(isOwner(userWith("google", "26037275"))).toBe(false);
    expect(isOwner(null)).toBe(false);
  });

  it("reads the GitHub login", () => {
    expect(githubLogin(userWith("github", "26037275", "DxPerfection"))).toBe("DxPerfection");
  });
});
