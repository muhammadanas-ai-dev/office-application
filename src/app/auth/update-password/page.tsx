import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata: Metadata = {
  title: "Choose a new password — Forma Office",
};

export default function UpdatePasswordPage() {
  return <UpdatePasswordForm />;
}
