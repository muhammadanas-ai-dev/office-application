import { z } from "zod";

const emailField = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .email("Enter a valid email address")
  .max(254, "Email address is too long");

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const signInSchema = z.object({
  email: emailField,
  password: passwordField,
});

export const signUpSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter your name")
    .max(100, "Name must be at most 100 characters"),
  email: emailField,
  password: passwordField,
});

export const resetRequestSchema = z.object({
  email: emailField,
});

export const updatePasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter your name")
    .max(100, "Name must be at most 100 characters"),
});

/** The three per-user preferences (Day 24) — the values the
 *  Settings form sends. */
export const updatePreferencesSchema = z.object({
  ocrLanguage: z.enum(["eng", "urd", "ara"], {
    message: "Choose English, Urdu or Arabic for OCR.",
  }),
  imageExportFormat: z.enum(["png", "jpg"], {
    message: "Choose PNG or JPG for image export.",
  }),
  imageExportDpi: z.coerce
    .number()
    .int()
    .refine((v) => v === 72 || v === 150 || v === 300, {
      message: "Choose 72, 150 or 300 DPI for image export.",
    }),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
