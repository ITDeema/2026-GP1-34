"use client";

import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { useT } from "@/lib/i18n";

const CONTACT_EMAIL = "maamar.team@gmail.com";

type Section = {
  title: string;
  text?: string;
  items?: string[];
  contact?: boolean; // يعرض رابط البريد تحت القسم
};
type Group = { heading: string; sections: Section[] };
type Content = {
  title: string;
  updated: string;
  intro: string;
  back: string;
  groups: Group[];
};

const content: Record<"ar" | "en", Content> = {
  ar: {
    title: "الشروط والأحكام وسياسة الخصوصية",
    updated: "منصة معمار | آخر تحديث: 25 نوفمبر 2026",
    intro:
      "منصة معمار مشروع تخرج أكاديمي لتحليل المواقع السكنية. باستخدامك للمنصة أو إنشائك حساباً فيها، فإنك توافق على الشروط وسياسة الخصوصية الموضحة أدناه.",
    back: "العودة إلى إنشاء الحساب",
    groups: [
      {
        heading: "أولاً: الشروط والأحكام",
        sections: [
          {
            title: "1. استخدام المنصة",
            text: "تقدّم معمار أدوات تساعد المستخدم على تحليل قطعة الأرض وفهم خصائصها ومحيطها، وعرض النتائج في رسوم ومؤشرات.",
          },
          {
            title: "2. طبيعة النتائج",
            text: "النتائج المقدّمة إرشادية، ولا تُعد بديلاً عن الدراسة الهندسية المتخصصة أو الاعتمادات الرسمية. وتعتمد دقتها على جودة البيانات المتاحة وعلى مدخلات المستخدم، وقد تتغير عند تحديث مصادر البيانات أو طرق التحليل. ينبغي التحقق من الاشتراطات التنظيمية لدى الجهات المختصة قبل اتخاذ أي قرار تنفيذي.",
          },
          {
            title: "3. مسؤوليات المستخدم",
            text: "يلتزم المستخدم بإدخال معلومات صحيحة قدر الإمكان، والحفاظ على سرية بيانات دخوله، واستخدام المنصة للأغراض المسموح بها، وعدم محاولة تعطيل خدماتها أو إساءة استخدامها.",
          },
          {
            title: "4. حدود المسؤولية",
            text: "تُقدَّم المنصة بحالتها الحالية، ولا يتحمل فريق معمار مسؤولية أي قرارات تُتخذ بالاعتماد على نتائجها وحدها.",
          },
        ],
      },
      {
        heading: "ثانياً: سياسة الخصوصية",
        sections: [
          {
            title: "1. المعلومات التي نجمعها",
            items: [
              "بيانات الحساب: البريد الإلكتروني وكلمة المرور (تُدار عبر خدمة المصادقة ولا نطّلع عليها)، ونوع الحساب، واللغة المفضلة.",
              "بيانات التحليل: إحداثيات القطعة ومساحتها، ونوع الفيلا، والارتفاع المتوقع للمبنى، ونتائج التحليل والمشاريع المحفوظة وسجل التحليلات.",
            ],
          },
          {
            title: "2. كيف نستخدم معلوماتك",
            text: "نستخدمها لتشغيل المنصة وإدارة حسابك، وإجراء التحليلات وعرض نتائجها، وتوفير السجل والمحفوظات، وإرسال رسائل الحساب مثل التحقق من البريد وإعادة تعيين كلمة المرور. لا نبيع معلوماتك، ولا نستخدمها لأغراض أخرى دون إبلاغك.",
          },
          {
            title: "3. حفظ المعلومات وحمايتها",
            text: "تُخزَّن معلوماتك في قاعدة بيانات سحابية، ولا يصل كل مستخدم إلا إلى مشاريعه وتحليلاته. تُنقل البيانات عبر اتصال مشفّر، ولا تُحفظ كلمات المرور كنص مقروء. ومع ذلك لا توجد وسيلة آمنة بنسبة مطلقة، لذلك ننصحك باستخدام كلمة مرور قوية وعدم مشاركتها.",
          },
          {
            title: "4. الخدمات الخارجية",
            text: "تعتمد المنصة على خدمات طرف ثالث لتشغيل بعض وظائفها، مثل قاعدة البيانات والمصادقة، والخرائط وصور الأقمار الصناعية والبحث عن المواقع. قد تصل إلى هذه الخدمات عناوين البحث والإحداثيات اللازمة لعرض الخريطة، وتخضع لسياسات الخصوصية الخاصة بها.",
          },
          {
            title: "5. حقوقك",
            text: "يمكنك عرض معلومات حسابك وتعديلها، وإدارة تحليلاتك ومشاريعك المحفوظة وحذفها، وطلب حذف حسابك من صفحة الملف الشخصي بعد تأكيد كلمة المرور.",
          },
          {
            title: "6. تحديث الوثيقة",
            text: "قد نحدّث هذه الوثيقة عند تطوير المنصة أو تغيّر طريقة معالجة المعلومات، وسيظهر تاريخ آخر تحديث في أعلاها.",
          },
          {
            title: "7. التواصل",
            text: "لأي استفسار عن هذه الوثيقة، تواصل معنا عبر البريد الإلكتروني:",
            contact: true,
          },
        ],
      },
    ],
  },

  en: {
    title: "Terms & Conditions and Privacy Policy",
    updated: "MAAMAR Platform | Last updated: November 25, 2026",
    intro:
      "MAAMAR is an academic graduation project for analyzing residential sites. By using the platform or creating an account, you agree to the terms and privacy policy set out below.",
    back: "Back to sign up",
    groups: [
      {
        heading: "Part 1: Terms & Conditions",
        sections: [
          {
            title: "1. Use of the Platform",
            text: "MAAMAR provides tools that help users analyze a plot of land, understand its characteristics and surroundings, and view the results in charts and indicators.",
          },
          {
            title: "2. Nature of the Results",
            text: "The results provided are indicative only and are not a substitute for specialized engineering studies or official approvals. Their accuracy depends on the quality of the available data and on user input, and they may change when data sources or analysis methods are updated. Regulatory requirements should be verified with the competent authorities before making any executive decision.",
          },
          {
            title: "3. User Responsibilities",
            text: "Users must enter accurate information as far as possible, keep their login credentials confidential, use the platform only for permitted purposes, and not attempt to disrupt its services or misuse them.",
          },
          {
            title: "4. Limitation of Liability",
            text: "The platform is provided \"as is\", and the MAAMAR team is not responsible for any decisions made relying solely on its results.",
          },
        ],
      },
      {
        heading: "Part 2: Privacy Policy",
        sections: [
          {
            title: "1. Information We Collect",
            items: [
              "Account data: email address and password (managed by the authentication service and not visible to us), account type, and preferred language.",
              "Analysis data: plot coordinates and area, villa type, expected building height, analysis results, saved projects, and analysis history.",
            ],
          },
          {
            title: "2. How We Use Your Information",
            text: "We use it to operate the platform and manage your account, run analyses and display their results, provide history and saved items, and send account emails such as email verification and password reset. We do not sell your information, and we do not use it for other purposes without notifying you.",
          },
          {
            title: "3. Storage and Protection",
            text: "Your information is stored in a cloud database, and each user can access only their own projects and analyses. Data is transmitted over an encrypted connection, and passwords are never stored in readable form. However, no method is completely secure, so we advise you to use a strong password and not share it.",
          },
          {
            title: "4. Third-Party Services",
            text: "The platform relies on third-party services to run some of its functions, such as the database and authentication, maps, satellite imagery, and location search. Search queries and the coordinates needed to display the map may be sent to these services, which are subject to their own privacy policies.",
          },
          {
            title: "5. Your Rights",
            text: "You can view and edit your account information, manage and delete your analyses and saved projects, and request deletion of your account from the profile page after confirming your password.",
          },
          {
            title: "6. Updates to This Document",
            text: "We may update this document as the platform evolves or the way information is processed changes. The date of the last update appears at the top.",
          },
          {
            title: "7. Contact",
            text: "For any questions about this document, contact us by email:",
            contact: true,
          },
        ],
      },
    ],
  },
};

export default function PrivacyPolicyPage() {
  const { lang } = useT();
  const isAr = lang === "ar";
  const c = content[isAr ? "ar" : "en"];

  return (
    <>
      <header className="border-b border-navy-900/15 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo height={48} />
            <span className="font-heading text-lg font-bold text-navy-900">
              {isAr ? "معمار" : "MAAMAR"}
            </span>
          </Link>

          <nav className="flex items-center gap-5 text-sm font-semibold">
            <Link href="/" className="text-navy-900/70 hover:text-navy-900">
              {isAr ? "العودة إلى واجهة معمار" : "Back to MAAMAR"}
            </Link>

            <Link
              href="/login"
              className="rounded-control bg-gold-500 px-4 py-2 text-navy-900 hover:bg-gold-600"
            >
              {isAr ? "تسجيل الدخول" : "Log in"}
            </Link>
          </nav>
        </div>
      </header>

      <main
        dir={isAr ? "rtl" : "ltr"}
        className="min-h-screen bg-navy-50 px-4 py-10 sm:px-6"
      >
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <Link
              href="/signup"
              className="text-sm font-semibold text-gold-700 hover:underline"
            >
              {c.back}
            </Link>
          </div>

          <div className="rounded-card border border-navy-900/10 bg-white p-6 shadow-sm sm:p-10">
            <h1 className="font-heading text-2xl font-bold text-navy-900 sm:text-3xl">
              {c.title}
            </h1>

            <p className="mt-2 text-xs font-semibold text-navy-900/60">
              {c.updated}
            </p>

            <p className="mt-5 text-sm leading-8 text-navy-900/75">{c.intro}</p>

            <div className="mt-8 space-y-10">
              {c.groups.map((group) => (
                <div key={group.heading}>
                  <h2 className="border-b border-navy-900/10 pb-3 font-heading text-xl font-bold text-navy-900">
                    {group.heading}
                  </h2>

                  <div className="mt-6 space-y-6">
                    {group.sections.map((section) => (
                      <section key={section.title}>
                        <h3 className="font-heading text-base font-bold text-navy-900">
                          {section.title}
                        </h3>

                        {section.text && (
                          <p className="mt-2 text-sm leading-8 text-navy-900/75">
                            {section.text}
                          </p>
                        )}

                        {section.items && (
                          <ul className="mt-2 list-disc space-y-2 ps-5 text-sm leading-8 text-navy-900/75">
                            {section.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        )}

                        {section.contact && (
                          <a
                            href={`mailto:${CONTACT_EMAIL}`}
                            dir="ltr"
                            className="mt-1 inline-block text-sm font-semibold text-gold-700 hover:underline"
                          >
                            {CONTACT_EMAIL}
                          </a>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}