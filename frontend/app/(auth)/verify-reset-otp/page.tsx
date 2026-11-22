
"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import Button from "@/components/Button";
import Card from "@/components/Card";
import Input from "@/components/Input";
import { toast } from "sonner";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyResetOtpPage() {
  const router = useRouter();
  const { lang } = useT();
  const ar = lang === "ar";

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  
useEffect(() => {
  const params = new URLSearchParams(window.location.search);

  setEmail(
    (params.get("email") ?? "").trim().toLowerCase()
  );

  const showNotice =
    sessionStorage.getItem("maamar-reset-notice") === "1";

  if (showNotice) {
    sessionStorage.removeItem("maamar-reset-notice");

    toast.info(
      lang === "ar"
        ? "إذا كان البريد الإلكتروني مرتبطًا بحساب في معمار، فسيصلك رمز تحقق لإعادة تعيين كلمة المرور."
        : "If this email is associated with a MAAMAR account, you will receive a verification code to reset your password.",
      {
        duration: 7000,
      }
    );
  }
}, [lang]);


  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setCooldown((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || resending) return;

    setError("");
    setSuccess("");

    if (!email) {
      setError(
        ar
          ? "البريد الإلكتروني غير موجود. ارجع لصفحة الاستعادة."
          : "Email address is missing. Return to password recovery."
      );
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError(
        ar
          ? "الرجاء إدخال رمز تحقق مكوّن من 6 أرقام."
          : "Please enter a 6-digit verification code."
      );
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { data, error: verifyError } =
        await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: code,
          type: "recovery",
        });

      if (verifyError) {
        setError(
          ar
            ? "رمز التحقق غير صحيح أو انتهت صلاحيته. تأكد من الرمز أو اطلب رمزًا جديدًا."
            : "Invalid or expired verification code. Check the code or request a new one."
        );
        return;
      }

      if (!data.session || !data.user?.id) {
        setError(
          ar
            ? "تعذر إنشاء جلسة الاستعادة. حاول مرة أخرى."
            : "Could not create a recovery session. Please try again."
        );
        return;
      }

      // This is a navigation marker, not an
      // independent security authorization.
      sessionStorage.setItem(
        "maamar-password-recovery",
        data.user.id
      );

      setSuccess(
        ar
          ? "تم التحقق من الرمز بنجاح!"
          : "Verification successful!"
      );

      router.replace("/reset-password");
      router.refresh();
    } catch {
      setError(
        ar
          ? "حدث خطأ غير متوقع. حاول مرة أخرى."
          : "An unexpected error occurred. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (!email || resending || loading || cooldown > 0) {
      return;
    }

    setError("");
    setSuccess("");
    setResending(true);

    try {
      const supabase = createClient();

      const { error: resendError } =
        await supabase.auth.resetPasswordForEmail(
          email.trim().toLowerCase()
        );

      if (resendError) {
        if (resendError.status === 429) {
          setError(
            ar
              ? "طلبات كثيرة جدًا. انتظر قليلًا قبل إعادة الإرسال."
              : "Too many requests. Please wait before resending."
          );
          return;
        }

        if (resendError.code !== "user_not_found") {
          setError(
            ar
              ? "تعذر معالجة طلب الإرسال. حاول لاحقًا."
              : "Could not process the request. Try again later."
          );
          return;
        }
      }

      setCooldown(RESEND_COOLDOWN);
      setCode("");

      setSuccess(
        ar
          ? "إذا كان البريد مسجلًا، فسيصلك رمز تحقق جديد."
          : "If the email is registered, a new code will be sent."
      );
    } catch {
      setError(
        ar
          ? "حدث خطأ أثناء إعادة الإرسال. حاول لاحقًا."
          : "An error occurred while resending. Try again later."
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <Card className="w-full max-w-md sm:p-8">
      <h1 className="font-heading text-2xl font-bold text-navy-900">
        {ar
          ? "التحقق من رمز الاستعادة"
          : "Verify Recovery Code"}
      </h1>

      <p className="mt-2 text-sm text-navy-900/70">
        {ar
          ? "أدخل رمز التحقق المكوّن من 6 أرقام الذي أرسلناه إلى بريدك الإلكتروني."
          : "Enter the 6-digit verification code sent to your email."}
      </p>

      {email ? (
        <p
          dir="ltr"
          className="mt-4 break-all text-center text-sm font-semibold text-gold-700"
        >
          {email}
        </p>
      ) : (
        <p className="mt-4 text-sm text-danger-500">
          {ar
            ? "لم يتم تحديد البريد الإلكتروني."
            : "Email address was not provided."}
        </p>
      )}

      <form
        onSubmit={verifyCode}
        className="mt-6 flex flex-col gap-5"
      >
        <Input
          label={ar ? "رمز التحقق" : "Verification Code"}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          placeholder="000000"
          maxLength={OTP_LENGTH}
          value={code}
          onChange={(event) => {
            setCode(
              event.target.value
                .replace(/\D/g, "")
                .slice(0, OTP_LENGTH)
            );
            setError("");
          }}
          className="text-center text-xl font-semibold tracking-[0.4em]"
          disabled={loading || resending}
          required
        />

        {error && (
          <div
            role="alert"
            className="rounded-control border border-danger-500/30 bg-danger-500/5 p-3 text-sm text-danger-500"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="rounded-control border border-success-500/30 bg-success-500/5 p-3 text-sm text-success-500"
          >
            {success}
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          disabled={
            loading ||
            resending ||
            !email ||
            code.length !== OTP_LENGTH
          }
        >
          {loading
            ? ar
              ? "جارٍ التحقق..."
              : "Verifying..."
            : ar
              ? "تأكيد الرمز"
              : "Verify Code"}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-navy-900/70">
          {ar ? "لم يصلك الرمز؟" : "Didn't receive the code?"}
        </p>

        <button
          type="button"
          onClick={resendCode}
          disabled={
            !email ||
            resending ||
            loading ||
            cooldown > 0
          }
          className="mt-2 text-sm font-semibold text-gold-700 underline hover:text-gold-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resending
            ? ar
              ? "جارٍ الإرسال..."
              : "Sending..."
            : cooldown > 0
              ? ar
                ? `إعادة الإرسال بعد ${cooldown} ثانية`
                : `Resend in ${cooldown}s`
              : ar
                ? "إعادة إرسال الرمز"
                : "Resend Code"}
        </button>
      </div>

      <div className="mt-6 border-t border-navy-900/10 pt-5 text-center">
        <Link
          href="/login"
          className="text-sm font-semibold text-navy-900/70 underline hover:text-gold-700"
        >
          {ar ? "العودة إلى تسجيل الدخول" : "Back to Login"}
        </Link>
      </div>
    </Card>
  );
}
