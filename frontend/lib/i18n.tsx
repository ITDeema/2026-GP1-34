"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

/*
 * Translations + language switching.
 * To add text: add the SAME key to both `ar` and `en` below
 * (TypeScript shows an error if one language is missing a key),
 * then use it in a screen with: const { t } = useT();  t("your.key")
 */

export type Lang = "ar" | "en";

const ar = {
  "brand.name": "معمار",
  "notifications.changesSaved": "تم حفظ التغييرات بنجاح",
  "notifications.emailUpdated": "تم تحديث البريد الإلكتروني بنجاح",
  "notifications.accountUpdated": "تم تحديث البريد الإلكتروني ونوع الحساب بنجاح",
  "notifications.passwordUpdated": "تم تغيير كلمة المرور بنجاح",
  "notifications.operationFailed": "تعذر إكمال العملية",

  "common.email": "البريد الإلكتروني",
  "common.password": "كلمة المرور",
  "common.confirmPassword": "تأكيد كلمة المرور",
  "common.fullName": "الاسم الكامل",
  "common.accountType": "نوع الحساب",
  "common.cancel": "إلغاء",

  "role.homeowner": "مالك منزل",
  "role.architect": "معماري",

  "nav.saved": "المفضلات",
  "nav.home": "الرئيسية",
  "nav.history": "السجل",
  "nav.profile": "البروفايل",
  "profile.myAccount": "حسابي",

  "home.title": "مرحبًا بعودتك إلى معمار",
  "home.subtitle": "ابدأ مشروعًا جديدًا أو تابع مشاريعك الأخيرة",
  "home.recent": "المشاريع الأخيرة",
  "home.newProject": "مشروع جديد",
  "home.newProjectHint": "ابدأ بتحليل قطعة أرض جديدة",
  "home.viewAll": "عرض جميع المشاريع",
  "home.empty": "لا توجد مشاريع سابقة حتى الآن",
  "home.emptyHint": "ابدأ مشروعك الأول لتظهر نتائجه هنا",
  "home.heroKicker": "لوحة التحكم",
  "home.startNew": "ابدأ تحليلًا جديدًا",
  "home.stale": "يُنصح بإعادة التحليل",
  "home.savedBadge": "مفضل",
  "home.stepsTitle": "ابدأ في ثلاث خطوات",
  "home.step1": "اختر قطعتك",
  "home.step1Text": "حدد موقعها على الخريطة",
  "home.step2": "أدخل بيانات المشروع",
  "home.step2Text": "نوع الفيلا والمساحة والارتفاع المتوقع",
  "home.step3": "احصل على قراراتك",
  "home.step3Text": "نتائج وتوصيات تصميمية جاهزة",

  "error.nameRequired": "أدخل الاسم الكامل",
  "error.emailInvalid": "أدخل بريدًا إلكترونيًا صحيحًا",
  "error.passwordRequired": "أدخل كلمة المرور",
  "error.passwordShort": "كلمة المرور يجب ألا تقل عن {min} أحرف",
  "error.passwordMismatch": "كلمتا المرور غير متطابقتين",
  "error.termsRequired": "يجب الموافقة على الشروط والأحكام",
  "error.passwordRequirements": "كلمة المرور لا تستوفي جميع الشروط المطلوبة.",
  "signup.passwordMinLength": "8 أحرف على الأقل",
  "signup.passwordNumber": "رقم واحد على الأقل (0–9)",
  "signup.passwordUppercase": "حرف إنجليزي كبير واحد على الأقل (A–Z)",

  "login.title": "تسجيل الدخول",
  "login.subtitle": "مرحبًا بعودتك، تابع تحليل مواقعك",
  "login.forgot": "نسيت كلمة المرور؟",
  "login.submit": "دخول",
  "login.noAccount": "ليس لديك حساب؟",
  "login.toSignup": "إنشاء حساب",

  "signup.title": "إنشاء حساب جديد",
  "signup.subtitle": "اختر نوع الحساب للبدء بتحليل موقعك",
  "signup.fullNamePlaceholder": "مثال: سارة العتيبي",
  "signup.terms": "أوافق على الشروط والأحكام وسياسة الخصوصية",
  "signup.submit": "إنشاء حساب",
  "signup.haveAccount": "لديك حساب مسبقًا؟",
  "signup.toLogin": "تسجيل الدخول",
  "signup.agreePrefix": "أوافق على",
  "signup.termsLink": "الشروط والأحكام وسياسة الخصوصية",
  "signup.accountMayExist": "إذا كان لديك حساب مسبقًا، يرجى تسجيل الدخول بدلًا من إنشاء حساب جديد.",

  "profile.accountInfo": "معلومات الحساب",
  "profile.editAccount": "تعديل المعلومات",
  "profile.settings": "الإعدادات",
  "profile.language": "لغة المنصة",
  "profile.manage": "إدارة الحساب",
  "profile.changePassword": "تغيير كلمة المرور",
  "profile.validatePassword": "التحقق من البيانات",
  
  "profile.currentPassword": "كلمة المرور الحالية",
  "profile.newPassword": "كلمة المرور الجديدة",
  "profile.confirmPassword": "تأكيد كلمة المرور الجديدة",
  
  "profile.passwordFieldsRequired": "يرجى تعبئة جميع حقول كلمة المرور",
  "profile.passwordMismatch": "كلمة المرور الجديدة وتأكيدها غير متطابقين",
  "profile.passwordUnchanged": "يجب أن تختلف كلمة المرور الجديدة عن الحالية",


  "profile.logout": "تسجيل الخروج",
  "profile.logoutBody": "هل أنت متأكد من تسجيل الخروج؟",
  "profile.delete": "حذف الحساب",
 "profile.deleteWarning":
  "سيتم جدولة حذف حسابك نهائيًا بعد 7 أيام. عند انتهاء المهلة، ستفقد المفضلة وسجل تحليلاتك. إذا سجلت الدخول خلال هذه الفترة، سيتم إلغاء طلب الحذف.",
  "profile.deleteConfirm": "أدخل كلمة المرور لتأكيد الحذف",
  "profile.verifyEmailTitle": "تأكيد تغيير البريد الإلكتروني",
  "notifications.loginRequired": "يرجى تسجيل الدخول مرة أخرى",
  "notifications.languageSaveFailed": "تعذر حفظ اللغة، يرجى المحاولة مرة أخرى",
  "notifications.logoutFailed": "تعذر تسجيل الخروج، يرجى المحاولة مرة أخرى",
  "notifications.deleteAccountFailed": "تعذر حذف الحساب. يرجى التحقق من كلمة المرور والمحاولة مرة أخرى",
"notifications.accountStatusFailed": "تعذر التحقق من حالة الحساب. يرجى المحاولة مرة أخرى",
"notifications.deletionGraceExpired": "انتهت مهلة إلغاء حذف الحساب",
"notifications.deletionCancelled": "تم إلغاء طلب حذف الحساب بنجاح",
"notifications.resetPasswordSuccess": "تم تغيير كلمة المرور بنجاح. يرجى تسجيل الدخول بكلمة المرور الجديدة",

  "common.save": "حفظ",
  "common.rename": "إعادة تسمية",
  "common.viewResults": "عرض النتائج",
  "common.searchByName": "ابحث باسم النتيجة",
  "common.noMatches": "لا توجد نتائج مطابقة للبحث",
  "common.loadError": "تعذر تحميل تحليلاتك. حاول مرة أخرى لاحقًا.",
  "unit.sqm": "م²",

  "forgot.title": "استعادة كلمة المرور",
  "forgot.subtitle": "أدخل بريدك الإلكتروني وسنرسل لك رمز التحقق",
  "forgot.submit": "إرسال الرمز",
  "forgot.back": "العودة إلى تسجيل الدخول",

  "rename.title": "إعادة تسمية النتيجة",
  "rename.label": "اسم النتيجة",
  "rename.errorRequired": "أدخل اسمًا للنتيجة",
  "rename.errorDuplicate": "يوجد مشروع آخر بنفس الاسم، اختر اسمًا مختلفًا",
  "rename.errorFailed": "تعذر حفظ الاسم، حاول مرة أخرى",
  
 "saved.title": "المفضلات",
 "saved.subtitle": "النتائج التي أضفتها إلى المفضلات للرجوع إليها لاحقًا",
 "saved.empty": "لا توجد نتائج في المفضلات بعد",
 "saved.emptyHint": "أضف نتيجة إلى المفضلات من لوحة النتائج لتظهر هنا",
 "saved.remove": "إزالة من المفضلات",
 "saved.removeBody": "ستُزال «{name}» من المفضلات، وتبقى في السجل.",
 "saved.removeConfirm": "إزالة",


  "history.title": "سجل التحليلات",
  "history.subtitle": "جميع عمليات تحليل المواقع التي أجريتها",
  "history.empty": "لا توجد تحليلات بعد",
  "history.colDate": "التاريخ",
  "history.colName": "الاسم",
  "history.colArea": "المساحة",
  "history.colNotes": "ملاحظات",
  "history.colActions": "إجراءات",
  "history.noteSetback": "القطعة قريبة من الحد الأدنى للارتدادات",
  "history.delete": "حذف",
  "history.deleteTitle": "حذف المشروع",
  "history.deleteBody": "سيُحذف «{name}» من السجل والمفضلات، ولا يمكن التراجع عن ذلك.",
  "history.deleteConfirm": "حذف",
  "history.deleteFailed": "تعذر حذف المشروع. حاول مرة أخرى.",

 
  "profile.verifyEmailStep": "الخطوة {step} من 2",
  "profile.oldEmailCodeSent": "تم إرسال رمز تحقق إلى البريد الإلكتروني القديم. يرجى إدخال الرمز للانتقال إلى الخطوة التالية.",
  "profile.newEmailCodeSent": "تم قبول رمز البريد الإلكتروني القديم. يرجى إدخال الرمز المرسل إلى البريد الإلكتروني الجديد.",
  "profile.oldEmailCode": "رمز البريد الإلكتروني القديم",
  "profile.newEmailCode": "رمز البريد الإلكتروني الجديد",
  "profile.verifying": "جارٍ التحقق...",
  "profile.next": "التالي",
  "profile.confirmEmailChange": "تأكيد تغيير البريد الإلكتروني",

  "profile.emailChangeIncomplete": "لم يكتمل تغيير البريد الإلكتروني بعد",
  "profile.emailRateLimit": "تم تجاوز الحد المسموح لإرسال رسائل البريد الإلكتروني. يرجى المحاولة لاحقًا",
  "profile.emailChangedRoleFailed": "تم تغيير البريد الإلكتروني بنجاح، لكن تعذر حفظ نوع الحساب. يرجى المحاولة مرة أخرى",
  "profile.accountVerificationFailed": "تعذر التحقق من الحساب. يرجى المحاولة مرة أخرى",
  "profile.enterSixDigitCode": "يرجى إدخال رمز التحقق المكون من 6 أرقام",
  "profile.oldEmailCodeInvalid": "رمز البريد الإلكتروني القديم غير صحيح أو انتهت صلاحيته",
  "profile.newEmailCodeInvalid": "رمز البريد الإلكتروني الجديد غير صحيح أو انتهت صلاحيته",
  "profile.emailUpdatePending": "تم قبول الرمز الجديد، لكن تحديث البريد الإلكتروني لم يكتمل بعد. يرجى عدم إعادة استخدام الرمز",
  "profile.emailVerificationFailed": "حدث خطأ أثناء التحقق. يرجى المحاولة مرة أخرى",

};

export type TranslationKey = keyof typeof ar;

const en: Record<TranslationKey, string> = {
  "brand.name": "معمار",
  "notifications.changesSaved": "Changes saved successfully",
  "notifications.emailUpdated": "Email updated successfully",
  "notifications.accountUpdated": "Email and account type updated successfully",
  "notifications.passwordUpdated": "Password changed successfully",
  "notifications.operationFailed": "Unable to complete the operation",

  "common.email": "Email",
  "common.password": "Password",
  "common.confirmPassword": "Confirm password",
  "common.fullName": "Full name",
  "common.accountType": "Account type",
  "common.cancel": "Cancel",

  "role.homeowner": "Homeowner",
  "role.architect": "Architect",

  "nav.saved": "Favorites",
  "nav.home": "Home",
  "nav.history": "History",
  "nav.profile": "Profile",
  "profile.myAccount": "My Account",

  "home.title": "Welcome back to Maamar",
  "home.subtitle": "Start a new project or continue your recent projects",
  "home.recent": "Recent projects",
  "home.newProject": "New Project",
  "home.newProjectHint": "Start analyzing a new plot",
  "home.viewAll": "View all projects",
  "home.empty": "No previous projects yet",
  "home.emptyHint": "Start your first project to see its results here",
  "home.heroKicker": "Dashboard",
  "home.startNew": "Start a new analysis",
  "home.stale": "A new analysis is recommended",
  "home.savedBadge": "Favorite",
  "home.stepsTitle": "Start in three steps",
  "home.step1": "Choose your plot",
  "home.step1Text": "Mark its location on the map",
  "home.step2": "Enter the project details",
  "home.step2Text": "Villa type, area and expected height",
  "home.step3": "Get your decisions",
  "home.step3Text": "Results and design recommendations, ready to use",

  "error.nameRequired": "Enter your full name",
  "error.emailInvalid": "Enter a valid email address",
  "error.passwordRequired": "Enter your password",
  "error.passwordShort": "Password must be at least {min} characters",
  "error.passwordMismatch": "Passwords do not match",
  "error.termsRequired": "You must accept the terms and conditions",
  "error.passwordRequirements": "Password does not meet all the required criteria.",
  "signup.passwordMinLength": "At least 8 characters",
  "signup.passwordNumber": "At least one number (0–9)",
  "signup.passwordUppercase": "At least one uppercase letter (A–Z)",

  "login.title": "Log in",
  "login.subtitle": "Welcome back, continue analyzing your sites",
  "login.forgot": "Forgot your password?",
  "login.submit": "Log in",
  "login.noAccount": "Don't have an account?",
  "login.toSignup": "Sign up",

  "signup.title": "Create a new account",
  "signup.subtitle": "Choose your account type to start analyzing your site",
  "signup.fullNamePlaceholder": "e.g. Sara Alotaibi",
  "signup.terms": "I agree to the terms and conditions and privacy policy",
  "signup.submit": "Sign up",
  "signup.haveAccount": "Already have an account?",
  "signup.toLogin": "Log in",
  "signup.agreePrefix": "I agree to the",
  "signup.termsLink": "Terms & Conditions and Privacy Policy",
  "signup.accountMayExist": "If you already have an account, please log in instead of signing up again.",

  "profile.accountInfo": "Account information",
  "profile.editAccount": "Edit information",
  "profile.settings": "Settings",
  "profile.language": "Platform language",
  "profile.manage": "Manage account",
  "profile.changePassword": "Change password",
  "profile.validatePassword": "Validate details",
  
  "profile.currentPassword": "Current password",
  "profile.newPassword": "New password",
  "profile.confirmPassword": "Confirm new password",
  
  "profile.passwordFieldsRequired": "Please fill in all password fields",
  "profile.passwordMismatch": "New password and confirmation do not match",
  "profile.passwordUnchanged": "The new password must be different from the current password",


  "profile.logout": "Log out",
  "profile.logoutBody": "Are you sure you want to log out?",
  "profile.delete": "Delete account",
  "profile.deleteWarning":
  "Your account will be permanently deleted after a 7-day grace period. Once this period ends, your favorites and analysis history will be lost. If you log in during these 7 days, your deletion request will be cancelled.",
  "profile.deleteConfirm": "Enter your password to confirm deletion",
  "notifications.loginRequired": "Please log in again",
  "notifications.languageSaveFailed": "Unable to save language preference. Please try again",
  "notifications.logoutFailed": "Unable to log out. Please try again",
  "notifications.deleteAccountFailed": "Unable to delete the account. Please check the password and try again",
  "notifications.accountStatusFailed": "Unable to check account status. Please try again",
  "notifications.deletionGraceExpired": "The account deletion grace period has expired",
  "notifications.deletionCancelled": "Your account deletion request has been cancelled successfully",
  "notifications.resetPasswordSuccess": "Password changed successfully. Please log in with your new password",


  "common.save": "Save",
  "common.rename": "Rename",
  "common.viewResults": "View results",
  "common.searchByName": "Search by result name",
  "common.noMatches": "No results match your search",
  "common.loadError": "Could not load your analyses. Please try again later.",
  "unit.sqm": "m²",

  "forgot.title": "Reset your password",
  "forgot.subtitle": "Enter your email and we'll send you a verification code",
  "forgot.submit": "Send code",
  "forgot.back": "Back to log in",

  "rename.title": "Rename result",
  "rename.label": "Result name",
  "rename.errorRequired": "Enter a name for the result",
  "rename.errorDuplicate": "Another project already has this name, choose a different one",
  "rename.errorFailed": "The name could not be saved, try again",
  
 "saved.title": "Favorites",
 "saved.subtitle": "Results you added to your favorites",
 "saved.empty": "No favorites yet",
 "saved.emptyHint": "Add a result to your favorites from the results dashboard and it will appear here",
 "saved.remove": "Remove from favorites",
 "saved.removeBody": "“{name}” will be removed from your favorites. It will remain in your history.",
 "saved.removeConfirm": "Remove",

  "history.title": "Analysis history",
  "history.subtitle": "All the site analyses you have run",
  "history.empty": "No analyses yet",
  "history.colDate": "Date",
  "history.colName": "Name",
  "history.colArea": "Area",
  "history.colNotes": "Notes",
  "history.colActions": "Actions",
  "history.noteSetback": "Plot is close to the minimum setback limit",
  "history.delete": "Delete",
  "history.deleteTitle": "Delete project",
  "history.deleteBody": "“{name}” will be deleted from your history and favorites. This cannot be undone.",
  "history.deleteConfirm": "Delete",
  "history.deleteFailed": "The project could not be deleted. Please try again.",

  "profile.verifyEmailTitle": "Confirm email change",
  "profile.verifyEmailStep": "Step {step} of 2",
  "profile.oldEmailCodeSent": "A verification code has been sent to the old email address. Enter the code to continue to the next step.",
  "profile.newEmailCodeSent": "The old email verification code was accepted. Enter the code sent to the new email address.",
  "profile.oldEmailCode": "Old email verification code",
  "profile.newEmailCode": "New email verification code",
  "profile.verifying": "Verifying...",
  "profile.next": "Next",
  "profile.confirmEmailChange": "Confirm email change",

  "profile.emailChangeIncomplete": "The email change has not been completed yet",
  "profile.emailRateLimit": "The email sending limit has been reached. Please try again later",
  "profile.emailChangedRoleFailed": "The email address was updated successfully, but the account type could not be saved. Please try again",
  "profile.accountVerificationFailed": "Unable to verify the account. Please try again",
  "profile.enterSixDigitCode": "Enter the 6-digit verification code",
  "profile.oldEmailCodeInvalid": "The old email verification code is invalid or has expired",
  "profile.newEmailCodeInvalid": "The new email verification code is invalid or has expired",
  "profile.emailUpdatePending": "The new code was accepted, but the email update is not complete yet. Do not reuse the code",
  "profile.emailVerificationFailed": "An error occurred during verification. Please try again",

};

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { ar, en };

/* ---- Everything below is plumbing. You never need to edit it. ---- */

const STORAGE_KEY = "maamar-lang";
const CHANGE_EVENT = "maamar-lang-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

function getServerSnapshot(): Lang {
  return "ar";
}

type TranslateFn = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TranslateFn;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [hydrated, setHydrated] = useState(false);

 useEffect(() => {
   setHydrated(getSnapshot() === lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (e.g. private mode): the change still applies below.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      let text = dictionaries[lang][key];
      for (const [name, value] of Object.entries(vars ?? {})) {
        text = text.replace(`{${name}}`, String(value));
      }
      return text;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return (
    <LanguageContext.Provider value={value}>{hydrated ? children : null}</LanguageContext.Provider>
  );
}

export function useT() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useT must be used inside <LanguageProvider>");
  }
  return context;
}
