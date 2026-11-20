
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Card from "@/components/Card";
import Input from "@/components/Input";
import Modal from "@/components/Modal";
import { toast } from "sonner";
import SegmentedControl from "@/components/SegmentedControl";
import { useT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

import {
  isValidEmail,
  isValidPassword,
  getPasswordRequirements,
} from "@/lib/validation";

type Dialog =
  | "logout"
  | "delete"
  | "changePassword"
  | "verifyEmail"
  | null;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-navy-900/70">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { t, lang, setLang } = useT();
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [dialog, setDialog] = useState<Dialog>(null);
  const [deletePassword, setDeletePassword] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [passwordError, setPasswordError] = useState("");

  const [editingAccount, setEditingAccount] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

 const [accountEmail, setAccountEmail] = useState("");
 const [accountRole, setAccountRole] = useState<"homeowner" | "architect">("homeowner");

 const [draftEmail, setDraftEmail] = useState("");
 const [draftRole, setDraftRole] = useState<"homeowner" | "architect">("homeowner");
 const [emailError, setEmailError] = useState("");
 const [pendingEmail, setPendingEmail] = useState("");
const [oldEmailCode, setOldEmailCode] = useState("");
const [emailStep, setEmailStep] = useState<1 | 2>(1);
const [newEmailCode, setNewEmailCode] = useState("");
const [emailVerifyError, setEmailVerifyError] = useState("");
const [emailVerifying, setEmailVerifying] = useState(false);
const [accountSaving, setAccountSaving] = useState(false);

  
useEffect(() => {
  async function loadProfile() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, preferredLanguage")
      .eq("userID", user.id)
      .single();

    if (profileError) {
      console.error("Profile error:", profileError.message);
    }

    const realEmail = user.email ?? "";

    setAccountEmail(realEmail);
    setDraftEmail(realEmail);

    if (
      profile?.role === "homeowner" ||
      profile?.role === "architect"
    ) {
      setAccountRole(profile.role);
      setDraftRole(profile.role);
    }

    if (
      profile?.preferredLanguage === "ar" ||
      profile?.preferredLanguage === "en"
    ) {
      setLang(profile.preferredLanguage);
    }
    setProfileLoading(false);
  }

  void loadProfile();
}, [router, supabase, setLang]);

  async function changeLanguage(newLang: Lang) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      toast.error(t("notifications.loginRequired"));
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({ preferredLanguage: newLang })
      .eq("userID", user.id)
      .select("preferredLanguage")
      .single();

    if (error || !data) {
      toast.error(t("notifications.languageSaveFailed"));
      console.error("Language update error:", error);
      return;
    }

    setLang(newLang);
  }

  async function saveAccount() {
    if (!isValidEmail(draftEmail.trim())) {
      setEmailError(t("error.emailInvalid"));
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setEmailError("يرجى تسجيل الدخول مرة أخرى.");
      return;
    }

  
    // Check whether the email needs to be changed
    const newEmail = draftEmail.trim().toLowerCase();
    const currentEmail = (user.email ?? "").toLowerCase();

    if (newEmail !== currentEmail) {
      // Request email change verification
      const { error: authError } =
        await supabase.auth.updateUser({
          email: newEmail,
        });

      if (authError) {
        setEmailError(
          authError.code === "over_email_send_rate_limit" ||
          authError.message.toLowerCase().includes("rate limit")
             ? t("profile.emailRateLimit")
            : authError.message
        );
        return;
      }

      // Open verification modal at step 1
      setPendingEmail(newEmail);
      setEmailStep(1);
      setOldEmailCode("");
      setNewEmailCode("");
      setEmailVerifyError("");
      setDialog("verifyEmail");
      return;
    }

    // If only the role changed, save it immediately
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ role: draftRole })
      .eq("userID", user.id);

    if (profileError) {
      setEmailError(profileError.message);
      return;
    }

    setAccountRole(draftRole);
    setAccountEmail(user.email ?? "");
    setEmailError("");
    setEditingAccount(false);
    toast.success(t("notifications.changesSaved"));
  }

async function validatePasswordChange() {
  if (!currentPassword || !newPassword || !confirmPassword) {
    setPasswordError(t("profile.passwordFieldsRequired"));
    return;
  }

  if (!isValidPassword(newPassword)) {
    setPasswordError(t("error.passwordRequirements"));
    return;
  }

  if (newPassword !== confirmPassword) {
    setPasswordError(t("profile.passwordMismatch"));
    return;
  }

  if (newPassword === currentPassword) {
    setPasswordError(t("profile.passwordUnchanged"));
    return;
  }

  // Verify the current password
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    setPasswordError("يرجى تسجيل الدخول مرة أخرى.");
    return;
  }

  const { error: verifyError } =
    await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });  

  if (verifyError) {
    setPasswordError("كلمة المرور الحالية غير صحيحة.");
    return;
  }

  // Update the password
  const { error: updateError } =
    await supabase.auth.updateUser({
      password: newPassword,
    });

  if (updateError) {
    setPasswordError(updateError.message);
    return;
  }

  closeDialog();
  toast.success(t("notifications.passwordUpdated"));
}


  function closeDialog() {
    setDialog(null);
    setDeletePassword("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast.error(t("notifications.logoutFailed"));
      return;
    }

    closeDialog();
    router.push("/login");
    router.refresh();
  }

  async function deleteAccount() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    toast.error(t("notifications.loginRequired"));
    return;
  }

  const response = await fetch("/api/account/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      password: deletePassword,
    }),
  });

  if (!response.ok) {
    toast.error(t("notifications.deleteAccountFailed"));
    return;
  }

  await supabase.auth.signOut();
  closeDialog();
  router.replace("/");
  router.refresh();
}

async function finishEmailChange(
  user: { id: string; email?: string }
) {
  const confirmedEmail = user.email ?? "";

  if (confirmedEmail.toLowerCase() !== pendingEmail) {
    setEmailVerifyError(t("profile.emailChangeIncomplete"));
    return;
  }

  // Save the selected role after email confirmation
  const { data: updatedProfile, error: roleError } = await supabase
    .from("profiles")
    .update({ role: draftRole })
    .eq("userID", user.id)
    .select("role")
    .single();

  if (roleError || !updatedProfile) {
    setAccountEmail(confirmedEmail);
    setDraftEmail(confirmedEmail);
    setEmailVerifyError(t("profile.emailChangedRoleFailed"));
    return;
  }

  setAccountRole(updatedProfile.role);
  setAccountEmail(confirmedEmail);
  setDraftEmail(confirmedEmail);
  setEmailError("");
  setEditingAccount(false);
  setDialog(null);
  setPendingEmail("");
  setOldEmailCode("");
  setNewEmailCode("");
  setEmailStep(1);

  toast.success(t("notifications.accountUpdated"));
}


async function verifyEmailChange() {
  if (emailVerifying) return;

  setEmailVerifying(true);
  setEmailVerifyError("");

  try {
    const { data: currentData, error: currentError } =
      await supabase.auth.getUser();

    if (currentError || !currentData.user) {
      setEmailVerifyError(t("profile.accountVerificationFailed"));
      return;
    }

    // Email may already be confirmed by Supabase
    if (currentData.user.email?.toLowerCase() === pendingEmail) {
      await finishEmailChange(currentData.user);
      return;
    }

    const code = emailStep === 1 ? oldEmailCode : newEmailCode;

    if (!/^\d{6}$/.test(code)) {
      setEmailVerifyError(t("profile.enterSixDigitCode"));
      return;
    }

    const { error: verifyError } =
      await supabase.auth.verifyOtp({
        email: emailStep === 1 ? accountEmail : pendingEmail,
        token: code,
        type: "email_change",
      });

    // Recheck actual email state after verification
    const { data: latestData, error: latestError } =
      await supabase.auth.getUser();

    if (
      !latestError &&
      latestData.user?.email?.toLowerCase() === pendingEmail
    ) {
      await finishEmailChange(latestData.user);
      return;
    }

    if (verifyError) {
      setEmailVerifyError(
        emailStep === 1
          ? t("profile.oldEmailCodeInvalid")
           : t("profile.newEmailCodeInvalid")
      );
      return;
    }

    if (emailStep === 1) {
      // Old code accepted; never verify it again
      setEmailStep(2);
      setEmailVerifyError("");
      return;
    }

    setEmailVerifyError(t("profile.emailUpdatePending"));
    
  } catch {
    setEmailVerifyError(t("profile.emailVerificationFailed"));
  } finally {
    setEmailVerifying(false);
  }
}

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
     

      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-pill border border-navy-900/15 bg-navy-50"
        >
          <svg
            className="h-9 w-9 text-navy-900"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </div>

        <div className="flex flex-col items-start gap-1">
          <h1 className="font-heading text-xl font-bold">
            {t("profile.myAccount")}
          </h1>
          <Badge>
  {profileLoading ? "" : t(`role.${accountRole}`)}
</Badge>
        </div>
      </div>

      <Card>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold">
            {t("profile.accountInfo")}
          </h2>

          <Button
            variant="secondary"

            onClick={() => {
              setDraftEmail(accountEmail);
              setDraftRole(accountRole);
              setEditingAccount(true);
            }}

          >
            {t("profile.editAccount")}
          </Button>
        </div>

        <dl className="flex flex-col gap-4">

          {editingAccount ? (
            <div className="flex flex-col gap-4">
              <Input
                label={t("common.email")}
                type="email"
                dir="ltr"
                autoComplete="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                error={emailError || undefined}
              />

              <SegmentedControl
                label={t("common.accountType")}

                value={draftRole}
                onChange={setDraftRole}

                options={[
                  { value: "homeowner", label: t("role.homeowner") },
                  { value: "architect", label: t("role.architect") },
                ]}
              />

              <div className="flex flex-wrap gap-3">

                <Button onClick={saveAccount}>
                  {t("common.save")}
                </Button>

                <Button
                  variant="secondary"

                  onClick={() => {
                    setDraftEmail(accountEmail);
                    setDraftRole(accountRole);
                    setEditingAccount(false);
                  }}

                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
           
) : (
  <dl className="flex flex-col gap-4">
    <InfoRow
      label={t("common.email")}
      value={profileLoading ? "" : accountEmail}
    />
    <InfoRow
      label={t("common.accountType")}
      value={
        profileLoading
          ? ""
          : t(`role.${accountRole}`)
      }
    />
  </dl>
)}

        </dl>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-bold">{t("profile.settings")}</h2>
        <div className="max-w-xs">
          <SegmentedControl<Lang>
            label={t("profile.language")}
            value={lang}
            onChange={changeLanguage}
            options={[
              { value: "ar", label: "العربية" },
              { value: "en", label: "English" },
            ]}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-bold">{t("profile.manage")}</h2>
        <div className="flex flex-wrap gap-3">

          <Button
            variant="secondary"
            onClick={() => setDialog("changePassword")}
          >
            {t("profile.changePassword")}
          </Button>

          <Button variant="secondary" onClick={() => setDialog("logout")}>
            {t("profile.logout")}
          </Button>
          <Button variant="danger" onClick={() => setDialog("delete")}>
            {t("profile.delete")}
          </Button>
        </div>
      </Card>

<Modal
  open={dialog === "verifyEmail"}
  onClose={() => {
    if (!emailVerifying) setDialog(null);
  }}
  title={t("profile.verifyEmailTitle")}
>
  <div className="flex flex-col gap-4">
    <p className="text-sm font-semibold text-navy-900">
      الخطوة {emailStep} من 2
    </p>

    <p className="text-sm text-navy-900/70">
      {emailStep === 1
        ? "أرسلنا رمز تحقق إلى بريدك الإلكتروني القديم. أدخلي الرمز للانتقال إلى الخطوة التالية."
        : "تم قبول رمز البريد القديم. أدخلي الآن الرمز المرسل إلى بريدك الإلكتروني الجديد."}
    </p>

    {emailStep === 1 ? (
      <Input
        label="رمز البريد الإلكتروني القديم"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        dir="ltr"
        maxLength={6}
        placeholder="000000"
        value={oldEmailCode}
        onChange={(e) => {
          setOldEmailCode(
            e.target.value.replace(/\D/g, "").slice(0, 6)
          );
          setEmailVerifyError("");
        }}
        disabled={emailVerifying}
      />
    ) : (
      <Input
        label="رمز البريد الإلكتروني الجديد"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        dir="ltr"
        maxLength={6}
        placeholder="000000"
        value={newEmailCode}
        onChange={(e) => {
          setNewEmailCode(
            e.target.value.replace(/\D/g, "").slice(0, 6)
          );
          setEmailVerifyError("");
        }}
        disabled={emailVerifying}
      />
    )}

    {emailVerifyError && (
      <p role="alert" className="text-sm text-danger-500">
        {emailVerifyError}
      </p>
    )}

    <div className="flex flex-wrap gap-3">
      <Button
        onClick={verifyEmailChange}
        disabled={
          emailVerifying ||
          (emailStep === 1
            ? oldEmailCode.length !== 6
            : newEmailCode.length !== 6)
        }
      >
        {emailVerifying
          ? "جارٍ التحقق..."
          : emailStep === 1
            ? "التالي"
            : "تأكيد تغيير البريد"}
      </Button>

      <Button
        variant="secondary"
        disabled={emailVerifying}
        onClick={() => setDialog(null)}
      >
        إلغاء
      </Button>
    </div>
  </div>
</Modal>



      <Modal
        open={dialog === "changePassword"}
        onClose={closeDialog}
        title={t("profile.changePassword")}
      >
        <div className="flex flex-col gap-4">
          <Input
            label={t("profile.currentPassword")}
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />

          <Input
            label={t("profile.newPassword")}
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <div className="flex flex-col gap-1 text-xs">
            {(
              [
                ["minLength", "signup.passwordMinLength"],
                ["hasNumber", "signup.passwordNumber"],
                ["hasUppercase", "signup.passwordUppercase"],
              ] as const
            ).map(([key, label]) => {
              const met = getPasswordRequirements(newPassword)[key];

              return (
                <p
                  key={key}
                  className={met ? "text-success-500" : "text-navy-900/60"}
                >
                  <span aria-hidden="true">{met ? "✓" : "○"}</span>{" "}
                  {t(label)}
                </p>
              );
            })}
          </div>

          <Input
            label={t("profile.confirmPassword")}
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          {passwordError && (
            <p role="alert" className="text-sm text-danger-500">
              {passwordError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-3">

            <Button onClick={validatePasswordChange}>
              {t("profile.validatePassword")}
            </Button>

            <Button variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={dialog === "logout"}
        onClose={closeDialog}
        title={t("profile.logout")}
      >
        <p className="text-sm text-navy-900/70">{t("profile.logoutBody")}</p>
        <div className="mt-6 flex gap-3">
          <Button onClick={logout}>{t("profile.logout")}</Button>
          <Button variant="secondary" onClick={closeDialog}>
            {t("common.cancel")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={dialog === "delete"}
        onClose={closeDialog}
        title={t("profile.delete")}
      >
        <p className="text-sm text-navy-900/70">{t("profile.deleteWarning")}</p>
        <div className="mt-4">
          <Input
            label={t("common.password")}
            type="password"
            dir="ltr"
            autoComplete="current-password"
            autoFocus
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
          <p className="mt-2 text-xs text-navy-900/70">
            {t("profile.deleteConfirm")}
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <Button
            variant="danger"
            disabled={deletePassword === ""}
            onClick={deleteAccount}
          >
            {t("profile.delete")}
          </Button>
          <Button variant="secondary" onClick={closeDialog}>
            {t("common.cancel")}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
