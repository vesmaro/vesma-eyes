import { describe, expect, it } from "vitest";
import {
  isValid,
  passwordIssue,
  usernameIssue,
  validateRegister,
} from "./passwordValidation";

/**
 * The client-side mirror of the server contract (ME-080 §5, AccountRegisterIn):
 * username 3..32 `[a-z0-9][a-z0-9_-]{2,31}` (stored lowercase), password
 * 8..512 (NIST length-only). These checks only spare the round-trip — the
 * wire stays the authority.
 */
describe("usernameIssue", () => {
  it("accepts the server's exact shape: 3..32 lowercase, starts alnum, - and _ inside", () => {
    expect(usernameIssue("abyss")).toBeNull();
    expect(usernameIssue("a-b_c9")).toBeNull();
    expect(usernameIssue("abc")).toBeNull();
    expect(usernameIssue("a".repeat(32))).toBeNull();
  });

  it("rejects empty, too-short, too-long, wrong-charset and bad-first-char", () => {
    expect(usernameIssue("")).toBe("required");
    expect(usernameIssue("  ")).toBe("required");
    expect(usernameIssue("ab")).toBe("username"); // < 3
    expect(usernameIssue("a".repeat(33))).toBe("username"); // > 32
    expect(usernameIssue("Abc")).toBe("username"); // uppercase
    expect(usernameIssue("abс")).toBe("username"); // cyrillic с
    expect(usernameIssue("a b")).toBe("username"); // space
    expect(usernameIssue("-ab")).toBe("username"); // must start alnum
    expect(usernameIssue("_ab")).toBe("username");
  });
});

describe("passwordIssue", () => {
  it("accepts 8..512, rejects shorter/longer and empty", () => {
    expect(passwordIssue("12345678")).toBeNull();
    expect(passwordIssue("p".repeat(512))).toBeNull();
    expect(passwordIssue("")).toBe("required");
    expect(passwordIssue("1234567")).toBe("password");
    expect(passwordIssue("p".repeat(513))).toBe("password");
  });
});

describe("validateRegister", () => {
  it("passes a fully valid triple", () => {
    const v = validateRegister("abyss", "parol-nadezhnyy-123", "parol-nadezhnyy-123");
    expect(isValid(v)).toBe(true);
  });

  it("flags the confirm mismatch as its own field issue (07k §4.1)", () => {
    const v = validateRegister("abyss", "parol-nadezhnyy-123", "parol-drugoy-12345");
    expect(v.username).toBeNull();
    expect(v.password).toBeNull();
    expect(v.confirm).toBe("confirm");
    expect(isValid(v)).toBe(false);
  });

  it("collects every field's issue at once (submit-time view)", () => {
    const v = validateRegister("AB", "1234567", "");
    expect(v.username).toBe("username");
    expect(v.password).toBe("password");
    expect(v.confirm).toBe("required");
  });
});
