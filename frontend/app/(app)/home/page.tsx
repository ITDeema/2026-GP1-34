"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { HeartIcon } from "@/components/IconButton";
import Modal from "@/components/Modal";
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
import { createClient } from "@/lib/supabase/client";
import type { AnalysisResult } from "@/lib/results";

const STEPS: { title: TranslationKey; text: TranslationKey }[] = [
  { title: "home.step1", text: "home.step1Text" },
  { title: "home.step2", text: "home.step2Text" },
  { title: "home.step3", text: "home.step3Text" },
];

export default function HomePage() {
  const { t, lang } = useT();
  const { results, loaded, loadError, setSaved } = useResults();
  const [removing, setRemoving] = useState<AnalysisResult | null>(null);
  // The first visit after creating the account says "Welcome to Maamar", later ones "Welcome back".
  // The account remembers it (user_metadata.welcomed), so it is the same on every device. null = not known yet.
  const [firstVisit, setFirstVisit] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      const first = Boolean(user) && user?.user_metadata?.welcomed !== true;
      setFirstVisit(first);
      if (first) {
        supabase.auth.updateUser({ data: { welcomed: true } }).then(({ error }) => {
          if (error) console.warn("Welcome flag not saved:", error.message);
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function confirmRemove() {
    if (removing) setSaved(removing.id, false);
    setRemoving(null);
  }

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
              {/* hidden (but keeping its place) until it is known whether this is the first visit */}
              <h1
                className={`font-heading text-3xl font-bold leading-[1.4] sm:text-4xl ${firstVisit === null ? "invisible" : ""}`}
              >
                {t(firstVisit ? "home.titleFirst" : "home.title")}
              </h1>
              <p className="mt-3 max-w-xl text-base leading-8 text-white/75">
                {t(firstVisit || noProjects ? "home.subtitleNew" : "home.subtitle")}
              </p>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-xl font-bold text-navy-900">{t("home.recent")}</h2>
              <Link href="/history" className="text-sm font-semibold text-gold-700 underline">
                {t("home.viewAll")}
              </Link>
            </div>

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
                    {project.stale && (
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="caution">{t("home.stale")}</Badge>
                      </div>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-3">
                      <Link
                        href={`/results/${project.id}`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-gold-700 underline"
                      >
                        {t("common.viewResults")}
                        <span aria-hidden="true">↗</span>
                      </Link>
                      {project.saved && (
                        <button
                          type="button"
                          aria-label={t("saved.remove")}
                          title={t("saved.remove")}
                          onClick={() => setRemoving(project)}
                          className="flex h-9 w-9 items-center justify-center rounded-control border border-navy-900/15 bg-white transition-colors hover:border-navy-700 hover:bg-navy-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
                        >
                          <HeartIcon />
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

      </div>

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t("saved.remove")}
      >
        <p className="text-sm text-navy-900/70">
          {t("saved.removeBody", { name: removing?.name ?? "" })}
        </p>
        <div className="mt-6 flex gap-3">
          <Button onClick={confirmRemove}>{t("saved.removeConfirm")}</Button>
          <Button variant="secondary" onClick={() => setRemoving(null)}>
            {t("common.cancel")}
          </Button>
        </div>
      </Modal>
    </main>
    </AppPage>
  );
}