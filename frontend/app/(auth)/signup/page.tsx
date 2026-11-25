"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/Button";
import Card from "@/components/Card";
import Input from "@/components/Input";
import SegmentedControl from "@/components/SegmentedControl";
import { useT } from "@/lib/i18n";
import type { Role } from "@/lib/user";
import { toast } from "sonner";
import {
  isValidEmail,
  isValidPassword,
  getPasswordRequirements,
} from "@/lib/validation";

const DRAFT_KEY = "maamar-signup-draft";

export default function SignupPage() {
  const { t } = useT();
  const router = useRouter();
  const supabase = createClient();
  const [role, setRole] = useState<Role>("homeowner");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  // استرجاع المسودة (بدون كلمات المرور) عند الرجوع من صفحة الخصوصية
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.role === "homeowner" || draft.role === "architect") {
          setRole(draft.role);
        }
        if (typeof draft.email === "string") setEmail(draft.email);
        if (typeof draft.accepted === "boolean") setAccepted(draft.accepted);
      }
    } catch {
      // تجاهل أي خطأ في القراءة
    }
    setDraftLoaded(true);
  }, []);

  // حفظ المسودة عند أي تغيير (بعد ما تنقرأ المسودة القديمة)
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ role, email, accepted })
      );
    } catch {
      // تجاهل أي خطأ في الكتابة
    }
  }, [draftLoaded, role, email, accepted]);

  
  const emailError = isValidEmail(email) ? undefined : t("error.emailInvalid");
  const passwordRequirements = getPasswordRequirements(password);
  const passwordError = isValidPassword(password)
     ? undefined
       : t("error.passwordRequirements");
  const confirmPasswordError =
    confirmPassword !== password ? t("error.passwordMismatch") : undefined;
  const termsError = accepted ? undefined : t("error.termsRequired");

  
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);

   if (emailError || passwordError || confirmPasswordError || termsError) {
     return;
   }

   const { data, error } = await supabase.auth.signUp({
    
     email: email.trim(),
     password,
     options: {
       data: {
         role: role,
       },
     },
   });

   if (error) {
     toast.error(error.message);
     return;
    }
    if (data.user?.identities?.length === 0) {
  toast.error(
    t("signup.accountMayExist")
  );
  return;
}
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
     router.push(
      `/verify-email?email=${encodeURIComponent(email.trim())}`
    );
  }

  return (
    <Card className="w-full max-w-md sm:p-8">
      <h1 className="font-heading text-2xl font-bold">{t("signup.title")}</h1>
      <p className="mt-2 text-sm text-navy-900/70">{t("signup.subtitle")}</p>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-6 flex flex-col gap-5"
      >
        <SegmentedControl<Role>
          label={t("common.accountType")}
          value={role}
          onChange={setRole}
          options={[
            { value: "homeowner", label: t("role.homeowner") },
            { value: "architect", label: t("role.architect") },
          ]}
        />

        
        <Input
          label={t("common.email")}
          type="email"
          dir="ltr"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={submitted ? emailError : undefined}
        />
        
        <div className="flex flex-col gap-2">
         <Input
         label={t("common.password")}
         type="password"
         dir="ltr"
         autoComplete="new-password"
         value={password}
         onChange={(e) => setPassword(e.target.value)}
         error={submitted ? passwordError : undefined}
        />

        
<div className="flex flex-col gap-1 text-xs" aria-live="polite">
  {[
    {
      key: "signup.passwordMinLength",
      valid: passwordRequirements.minLength,
    },
    {
      key: "signup.passwordNumber",
      valid: passwordRequirements.hasNumber,
    },
    {
      key: "signup.passwordUppercase",
      valid: passwordRequirements.hasUppercase,
    },
  ].map((rule) => (
    <p
      key={rule.key}
      className={rule.valid ? "text-success-500" : "text-navy-900/60"}
    >
      <span aria-hidden="true">{rule.valid ? "✓" : "○"}</span>{" "}
      {t(rule.key as Parameters<typeof t>[0])}
    </p>
  ))}
</div>

</div>

          <Input
          label={t("common.confirmPassword")}
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={submitted ? confirmPasswordError : undefined}
        />
        
<div className="flex flex-col gap-2">
  <div className="flex items-center gap-2 text-sm text-navy-900/70">
    <input
      id="accept-terms"
      type="checkbox"
      checked={accepted}
      onChange={(e) => setAccepted(e.target.checked)}
      className="h-4 w-4 accent-navy-900"
    />

    <label htmlFor="accept-terms">
      <span>{t("signup.agreePrefix")} </span>
      <Link
        href="/privacy-policy"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-gold-700 underline hover:text-gold-800"
      >
        {t("signup.termsLink")}
      </Link>
    </label>
  </div>

  {submitted && termsError && (
    <p className="text-xs text-danger-500">{termsError}</p>
  )}
</div>


        <Button type="submit" fullWidth>
          {t("signup.submit")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-navy-900/70">
        {t("signup.haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-gold-700 underline">
          {t("signup.toLogin")}
        </Link>
      </p>
    </Card>
  );
}