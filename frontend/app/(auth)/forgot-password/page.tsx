
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import Card from "@/components/Card";
import Input from "@/components/Input";
import { useT } from "@/lib/i18n";
import { isValidEmail } from "@/lib/validation";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const { t, lang } = useT();
  const ar = lang === "ar";
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");

  const normalizedEmail = email.trim().toLowerCase();

  const emailError = isValidEmail(normalizedEmail)
    ? undefined
    : normalizedEmail
      ? t("error.emailInvalid")
      : ar
        ? "البريد الإلكتروني مطلوب."
        : "Email address is required.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setRequestError("");

    if (emailError || loading) return;

    setLoading(true);

    try {
      const supabase = createClient();

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail
        );

      if (error) {
        // Do not reveal whether an account exists.
        if (error.status === 429) {
          setRequestError(
            ar
              ? "طلبات كثيرة جدًا. انتظر قليلًا ثم حاول مجددًا."
              : "Too many requests. Please wait and try again."
          );
          return;
        }

        // Some providers return different errors for
        // unknown email addresses. Avoid exposing them.
        if (error.code === "user_not_found") {
          router.push(
            `/verify-reset-otp?email=${encodeURIComponent(normalizedEmail)}`
          );
          return;
        }

        setRequestError(
          ar
            ? "تعذر معالجة الطلب حاليًا. حاول لاحقًا."
            : "Unable to process the request. Please try later."
        );
        return;
      }

      router.push(
        `/verify-reset-otp?email=${encodeURIComponent(normalizedEmail)}`
      );
    } catch {
      setRequestError(
        ar
          ? "حدث خطأ في الاتصال. حاول مرة أخرى."
          : "A connection error occurred. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md sm:p-8">
      <h1 className="font-heading text-2xl font-bold text-navy-900">
        {t("forgot.title")}
      </h1>

      <p className="mt-2 text-sm text-navy-900/70">
        {t("forgot.subtitle")}
      </p>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-6 flex flex-col gap-5"
      >
        <Input
          label={t("common.email")}
          type="email"
          dir="ltr"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setRequestError("");
          }}
          error={submitted ? emailError : undefined}
          disabled={loading}
        />

        {requestError && (
          <div
            role="alert"
            className="rounded-control border border-danger-500/30 bg-danger-500/5 p-3 text-sm text-danger-500"
          >
            {requestError}
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          disabled={loading}
        >
          {loading
            ? ar
              ? "جارٍ إرسال الطلب..."
              : "Sending request..."
            : t("forgot.submit")}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-navy-900/60">
        {ar
          ? "إذا كان البريد مسجلًا، فستصلك رسالة تحتوي على رمز الاستعادة."
          : "If the email is registered, you will receive a recovery code."}
      </p>

      <p className="mt-6 text-center text-sm">
        <Link
          href="/login"
          className="font-semibold text-gold-700 underline hover:text-gold-800"
        >
          {t("forgot.back")}
        </Link>
      </p>
    </Card>
  );
}
