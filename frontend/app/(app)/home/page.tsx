"use client";

import Link from "next/link";
import Badge from "@/components/Badge";
import Card from "@/components/Card";
import { HeroPlot } from "@/components/home/HomeParts";
import PlotThumbMap from "@/components/home/PlotThumbMap";
import { IconArrow } from "@/components/landing/Icons";
import SaduBand from "@/components/landing/SaduBand";
import { formatDate } from "@/lib/format";
import AppPage from "@/components/AppPage";
import { useT } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { plotCopy } from "@/lib/plot-copy";
import { useResults } from "@/lib/results";

const STEPS: { title: TranslationKey; text: TranslationKey }[] = [
  { title: "home.step1", text: "home.step1Text" },
  { title: "home.step2", text: "home.step2Text" },
  { title: "home.step3", text: "home.step3Text" },
];

export default function HomePage() {
  const { t, lang } = useT();
  const { results, loaded, loadError } = useResults();

  const recentProjects = [...results]
    .sort((a, b) => {
      if (a.lastOpenedAt && b.lastOpenedAt) {
        return b.lastOpenedAt.localeCompare(a.lastOpenedAt);
      }

      if (a.lastOpenedAt) return -1;
      if (b.lastOpenedAt) return 1;

      return b.date.localeCompare(a.date);
    })
    .slice(0, 3);

  const noProjects = loaded && !loadError && results.length === 0;

  return (
    <AppPage>
    <main>
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-10">
        <section className="relative isolate overflow-hidden rounded-card bg-linear-to-b from-navy-950 to-navy-900 text-white">
          <div className="grid items-center gap-8 p-8 pb-14 lg:grid-cols-[1.2fr_1fr] lg:p-10 lg:pb-16">
            <div>
              <p className="mb-3 text-sm font-bold text-gold-300">{t("home.heroKicker")}</p>
              <h1 className="font-heading text-3xl font-bold leading-[1.4] sm:text-4xl">{t("home.title")}</h1>
              <p className="mt-3 max-w-xl text-base leading-8 text-white/75">{t("home.subtitle")}</p>
              <Link
                href="/select-plot"
                className="mt-7 inline-flex items-center gap-3 rounded-control bg-gold-500 px-6 py-3.5 text-sm font-bold text-navy-950 transition-colors hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t("home.startNew")}
                <IconArrow className="flip-rtl h-5 w-5" />
              </Link>
            </div>
            <HeroPlot className="mx-auto hidden h-52 w-full max-w-sm lg:block" />
          </div>
          <div className="absolute inset-x-0 bottom-0" aria-hidden="true">
            <SaduBand className="text-gold-500" opacity={0.22} />
          </div>
        </section>

        {noProjects ? (
          <section className="flex flex-col gap-6">
            <h2 className="font-heading text-xl font-bold text-navy-900">{t("home.stepsTitle")}</h2>
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <Card className="flex h-full items-start gap-4">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-navy-900 font-heading text-lg font-bold text-white"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-heading font-bold text-navy-900">{t(step.title)}</h3>
                      <p className="mt-1 text-sm leading-6 text-navy-900/70">{t(step.text)}</p>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <section className="flex flex-col gap-5">
            <h2 className="font-heading text-xl font-bold text-navy-900">{t("home.recent")}</h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                href="/select-plot"
                className="group block h-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
              >
                <Card className="flex h-full min-h-64 flex-col items-center justify-center gap-4 border-2 border-dashed border-gold-700/60 text-center transition-colors group-hover:bg-navy-50">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-900 text-3xl font-light text-white">
                    +
                  </span>
                  <div>
                    <h3 className="font-heading font-bold text-navy-900">{t("home.newProject")}</h3>
                    <p className="mt-2 text-xs text-navy-900/70">{t("home.newProjectHint")}</p>
                  </div>
                </Card>
              </Link>

              {recentProjects.map((project) => (
                <Card key={project.id} className="flex min-h-64 flex-col gap-4 overflow-hidden p-0">
                  <PlotThumbMap
                    id={project.id}
                    lat={project.lat}
                    lng={project.lng}
                    area={project.area}
                    villaType={project.villaType}
                    label={project.name}
                    className="h-36 w-full"
                  />
                  <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
                    <div>
                      <h3 className="font-heading text-base font-bold">{project.name}</h3>
                      <p className="mt-2 text-sm text-navy-900/70">
                        {project.area} {t("unit.sqm")} · {formatDate(project.date, lang)}
                      </p>
                      {project.villaType && (
                        <p className="mt-1 text-xs text-navy-900/60">
                          {plotCopy[lang].select.villaTypes[project.villaType]}
                        </p>
                      )}
                    </div>
                    {(project.saved || project.stale) && (
                      <div className="flex flex-wrap gap-2">
                        {project.saved && <Badge tone="success">{t("home.savedBadge")}</Badge>}
                        {project.stale && <Badge tone="caution">{t("home.stale")}</Badge>}
                      </div>
                    )}
                    <Link
                      href={`/results/${project.id}`}
                      className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-gold-700 underline"
                    >
                      {t("common.viewResults")}
                      <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
    </AppPage>
  );
}
