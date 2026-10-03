/**
 * Client-side validation for the password forms (ME-080 FE slice) — a pure
 * mirror of the server contract (docs/design/2026-10-01-accounts-password-auth.md
 * §5, `AccountRegisterIn`): username 3..32 chars, lowercase latin/digits with
 * `-`/`_` inside (`^[a-z0-9][a-z0-9_-]{2,31}$`), password 8..512 chars
 * (NIST SP 800-63B — length only, no composition rules). The server stays
 * the authority; these checks just spare the round-trip and let the form
 * speak human while the user types.
 *
 * Login deliberately validates NOTHING but "not empty": an unknown name must
 * reach the SAME neutral 401 as a wrong password — shape-policing the field
 * would tell the world which names exist.
 */

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 512;

export type FieldIssue = "required" | "username" | "password" | "confirm" | null;

export interface RegisterValidation {
  username: FieldIssue;
  password: FieldIssue;
  confirm: FieldIssue;
}

export function usernameIssue(value: string): FieldIssue {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "required";
  if (trimmed.length < 3 || trimmed.length > USERNAME_MAX || !USERNAME_PATTERN.test(trimmed)) {
    return "username";
  }
  return null;
}

export function passwordIssue(value: string): FieldIssue {
  if (value.length === 0) return "required";
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) return "password";
  return null;
}

/** Validate a registration attempt; `confirm` must repeat the password. */
export function validateRegister(
  username: string,
  password: string,
  confirm: string,
): RegisterValidation {
  return {
    username: usernameIssue(username),
    password: passwordIssue(password),
    confirm:
      confirm.length === 0
        ? "required"
        : confirm !== password
          ? "confirm"
          : null,
  };
}

/** True when every field passed — the submit may leave the browser. */
export function isValid(validation: RegisterValidation): boolean {
  return validation.username === null && validation.password === null && validation.confirm === null;
}
