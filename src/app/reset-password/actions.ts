"use server";

import { redirect } from "next/navigation";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tarature-api-production.up.railway.app";

export async function confirmPasswordReset(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const newPassword = String(formData.get("new_password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (!token) redirect("/forgot-password?error=missing_token");
  if (newPassword.length < 8) redirect(`/reset-password?token=${token}&error=too_short`);
  if (newPassword !== confirmPassword) redirect(`/reset-password?token=${token}&error=mismatch`);

  let ok = false;
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: newPassword }),
      cache: "no-store",
    });
    ok = res.ok;
  } catch {
    redirect(`/reset-password?token=${token}&error=network`);
  }

  if (!ok) redirect(`/reset-password?token=${token}&error=invalid`);

  redirect("/login?reset=1");
}
