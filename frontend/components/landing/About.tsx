"use client";

import { IconCheck, IconInfo } from "@/components/landing/Icons";
import Reveal from "@/components/landing/Reveal";
import SaduBand from "@/components/landing/SaduBand";
import { useCopy } from "@/components/landing/useCopy";

// The "About us" part of the landing page, under the FAQ: the same design as the old /about page.
export default function About() {
  const c = useCopy().about;

  return (
    <>
    <section id="about" className="lp-hero relative isolate overflow-hidden text-stone-50">
      <div className="lp-grid absolute inset-0 -z-10" aria-hidden="true" />
      <div className="mx-auto max-w-4xl px-6 pb-32 pt-20 text-center sm:pt-24">
        <p className="mb-5 inline-flex items-center gap-3 text-sm font-bold text-gold-400">
          <span className="h-px w-10 bg-gold-500" aria-hidden="true" />
          {c.kicker}
          <span className="h-px w-10 bg-gold-500" aria-hidden="true" />
        </p>
        <h2 className="font-heading text-4xl font-bold leading-[1.3] sm:text-6xl">{c.title}</h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/75">{c.sub}</p>
      </div>
      <div className="absolute inset-x-0 bottom-0" aria-hidden="true">
        <SaduBand className="text-gold-500" opacity={0.5} />
      </div>
    </section>

    <section className="bg-stone-50 py-24 sm:py-28">
      <Reveal className="mx-auto max-w-4xl px-6">
        <p className="mb-6 flex items-center gap-3 text-sm font-bold text-gold-700">
          <span className="h-px w-10 bg-gold-500" aria-hidden="true" />
          {c.storyKicker}
        </p>
        <p className="font-heading text-2xl font-semibold leading-[1.8] text-navy-900 sm:text-3xl sm:leading-[1.8]">
          {c.story}
        </p>
      </Reveal>
    </section>

    <section className="bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <h2 className="font-heading text-3xl font-bold text-navy-900 sm:text-4xl">{c.doTitle}</h2>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {c.doItems.map((item, i) => (
            <Reveal key={item.title} delay={80 * i}>
              <div className="lp-card h-full rounded-2xl border border-navy-900/10 bg-white p-7">
                <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-pill bg-gold-100 text-gold-700">
                  <IconCheck className="h-5 w-5" strokeWidth={2.6} />
                </span>
                <h3 className="font-heading text-xl font-bold text-navy-900">{item.title}</h3>
                <p className="mt-3 text-[0.95rem] leading-7 text-navy-900/70">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>

    <section id="team" className="bg-stone-50 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <h2 className="font-heading text-3xl font-bold text-navy-900 sm:text-4xl">{c.teamTitle}</h2>
        </Reveal>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {c.members.map((member, i) => (
            <li key={member.name}>
              <Reveal delay={80 * i}>
                <div className="lp-card flex h-full flex-col items-center rounded-2xl border border-navy-900/10 bg-white p-7 text-center">
                  <span
                    className="flex h-20 w-20 items-center justify-center rounded-pill bg-navy-900 font-heading text-3xl font-bold text-white"
                    aria-hidden="true"
                  >
                    {member.name.charAt(0)}
                  </span>
                  <h3 className="mt-5 font-heading text-xl font-bold text-navy-900">{member.name}</h3>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>

        <Reveal className="mt-14">
          <p className="flex items-start gap-3 rounded-xl border border-navy-900/10 bg-white px-5 py-4 text-sm leading-7 text-navy-900/70">
            <IconInfo className="mt-1 h-5 w-5 shrink-0 text-gold-700" />
            {c.note}
          </p>
        </Reveal>
      </div>
    </section>
    </>
  );
}