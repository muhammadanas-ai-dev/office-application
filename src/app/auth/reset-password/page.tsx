import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password — Forma Office",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
