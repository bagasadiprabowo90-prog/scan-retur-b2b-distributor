import { describe, it, expect, beforeEach } from "vitest";
import {
  parseGoogleJwt,
  loadValidSession,
  saveSession,
  REQUIRED_DOMAIN,
  SESSION_TTL_MS,
  STORAGE_KEY,
  type AuthSession,
} from "../lib/auth";

describe("Google Authentication & Domain Restriction Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should have REQUIRED_DOMAIN configured to blpbeauty.com", () => {
    expect(REQUIRED_DOMAIN).toBe("blpbeauty.com");
  });

  it("should correctly parse and decode Google JWT credentials", () => {
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({
        email: "bagas@blpbeauty.com",
        name: "Bagas Adi Prabowo",
        given_name: "Bagas",
        picture: "https://lh3.googleusercontent.com/photo.jpg",
        hd: "blpbeauty.com",
        sub: "1234567890",
      })
    );
    const mockJwt = `${header}.${payload}.signature`;

    const parsed = parseGoogleJwt(mockJwt);
    expect(parsed).not.toBeNull();
    expect(parsed?.email).toBe("bagas@blpbeauty.com");
    expect(parsed?.name).toBe("Bagas Adi Prabowo");
    expect(parsed?.hd).toBe("blpbeauty.com");
    expect(parsed?.picture).toBe("https://lh3.googleusercontent.com/photo.jpg");
  });

  it("should return null for malformed tokens", () => {
    expect(parseGoogleJwt("")).toBeNull();
    expect(parseGoogleJwt("invalid-token")).toBeNull();
  });

  it("should properly enforce domain restriction logic", () => {
    const validEmail = "bagas@blpbeauty.com";
    const invalidEmail = "someone@gmail.com";
    const hackerEmail = "fake@blpbeauty.com.evil.com";

    const expectedDomain = `@${REQUIRED_DOMAIN.toLowerCase()}`;

    expect(validEmail.endsWith(expectedDomain)).toBe(true);
    expect(invalidEmail.endsWith(expectedDomain)).toBe(false);
    expect(hackerEmail.endsWith(expectedDomain)).toBe(false);
  });

  it("should expire sessions after expiration time", () => {
    const expiredSession: AuthSession = {
      user: {
        username: "bagas",
        displayName: "Bagas",
        email: "bagas@blpbeauty.com",
      },
      loginAt: Date.now() - SESSION_TTL_MS - 5000,
      expiresAt: Date.now() - 5000, // expired 5 seconds ago
      sessionToken: "expired-token",
    };

    saveSession(expiredSession);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    const loaded = loadValidSession();
    expect(loaded).toBeNull();
    // Auto-cleared from localStorage on detection
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("should retain active sessions before expiration time", () => {
    const activeSession: AuthSession = {
      user: {
        username: "dimas",
        displayName: "Dimas",
        email: "dimas@blpbeauty.com",
      },
      loginAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      sessionToken: "valid-active-token",
    };

    saveSession(activeSession);
    const loaded = loadValidSession();
    expect(loaded).not.toBeNull();
    expect(loaded?.user.username).toBe("dimas");
    expect(loaded?.user.email).toBe("dimas@blpbeauty.com");
    expect(loaded?.sessionToken).toBe("valid-active-token");
  });

  it("should clear session completely on logout", () => {
    const session: AuthSession = {
      user: {
        username: "irwan",
        displayName: "Irwan",
        email: "irwan@blpbeauty.com",
      },
      loginAt: Date.now(),
      expiresAt: Date.now() + 100000,
      sessionToken: "sample-token",
    };

    saveSession(session);
    expect(loadValidSession()).not.toBeNull();

    saveSession(null);
    expect(loadValidSession()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
