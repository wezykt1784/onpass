import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { TIERS, pounds } from "@/lib/pricing";
import { buttonClass } from "@/components/ui";
import { EarlyListForm } from "./early-list-form";
import { redirect } from "next/navigation";
import { PUBLIC_LANDING } from "@/lib/site-mode";

export const metadata: Metadata = { title: { absolute: `${BRAND.name}: recipes, spec books and allergen menus in one place` } };

const DIFFERENT = [
  ["Live, not overnight", "A recipe change reaches every spec book and every guest menu when you save. No nightly sync, no re-import."],
  ["Nothing unchecked reaches a guest", "A dish whose allergens aren't confirmed can't go live. If a live dish loses its data, guests keep the last checked version."],
  ["One place", "Recipes, spec books and guest menus share the same data, so there's nothing to keep in step."],
  ["Built for the people who cook", "Site chefs get the spec on their phone. Head chefs see their own brand. Guests filter by allergy without an app."],
  ["A page and QR code per pub", "Every site has its own guest menu address. Switch a site off and its guests see a polite offline note, not a broken link."],
  ["Build-your-own on the menu", "Buns, patties, sauces: each option is a recipe with its own allergens, and guest filters hide the ones that don't fit."],
] as const;

const NEXT = ["Alerts when a live dish gains an allergen", "Change history with undo", "Autosave", "Supplier spec updates in bulk", "Excel allergen matrix", "Zonal recipe import"];

const FAQ = [
  ["Can I bring my recipes from Zonal?", "A Zonal import is being built now. Until it's ready, send an export and we'll load your recipes for you."],
  ["Do guests need an app?", "No. They scan the QR code on the table and the menu opens in their phone's browser."],
  ["What happens when a dish's allergen data is missing?", "It's held back. It won't go live, and if it was already live, guests keep the last version where everything was confirmed."],
  ["Does it print packaging labels for Natasha's Law?", "No. Onpass covers recipes, spec books and allergen menus, not labels for pre-packed food."],
  ["What about calorie labelling?", "Calories per portion show on guest menus with the daily intake statement, switched on or off per brand."],
  ["How is it priced?", "Per site, per month, with everyone in your team included and every feature in every tier."],
] as const;

export default function Landing() {
  if (!PUBLIC_LANDING) redirect("/app");
  return (
    <div className="bg-bg text-text">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG mark */}
          <img src="/icon.svg" alt="" width={28} height={28} />{BRAND.name}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2">
          <a href="#pricing" className={buttonClass("ghost", "md", "hidden sm:inline-flex")}>Pricing</a>
          <Link href="/login" className={buttonClass("ghost")}>Sign in</Link>
          <a href="#early-list" className={buttonClass("primary")}><span className="sm:hidden">Early list</span><span className="hidden sm:inline">Join the early list</span></a>
        </nav>
      </header>

      <main>
        <section aria-labelledby="hero" className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <h1 id="hero" className="text-3xl leading-tight sm:text-4xl">Your recipes, spec books and allergen menus. One place, always live.</h1>
            <p className="mt-4 max-w-xl text-lg text-text-muted">Change a recipe once. Every spec book and every guest menu at every site follows the moment you save, and a dish with unconfirmed allergens never reaches a guest.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#early-list" className={buttonClass("primary", "lg")}>Join the early list</a>
              <Link href="/login" className={buttonClass("secondary", "lg")}>Sign in</Link>
            </div>
          </div>
          <Image src="/landing/publish-board.jpg" width={1280} height={800} priority sizes="(min-width: 1024px) 55vw, 100vw"
            alt="The publishing board: two menus live at a pub brand, a new version of one waiting in staging" className="w-full rounded-lg border border-border shadow-card" />
        </section>

        <section aria-labelledby="problem" className="bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 id="problem" className="text-2xl">Two jobs, two systems, and a night&apos;s wait between them</h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <p className="text-lg">A supplier changes an ingredient, and someone has to chase it through every recipe, every printed spec and every site&apos;s allergen menu. Most groups keep recipes in one system and publish menus from another, synced overnight.</p>
              <p className="text-lg">Allergen sheets you can&apos;t fully trust: half-filled ingredient data, no record of who changed what, and nothing to stop an unchecked dish going out.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="how" className="mx-auto max-w-6xl px-5 py-14">
          <h2 id="how" className="text-2xl">How it works</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {[["Build the recipe", "Add products and batch recipes. Allergens, diets, calories and GP work themselves out as you type."],
              ["Put it on a menu", "Sections, dishes and build-your-own groups. The spec book for the kitchen prints itself."],
              ["Publish to your sites", "Check it in staging, then go live or schedule it. Each pub gets its own guest page and QR code."]].map(([t, d], i) => (
              <li key={t} className="rounded-lg border border-border p-5">
                <span className="text-sm font-bold text-accent">Step {i + 1}</span>
                <h3 className="mt-1 text-lg">{t}</h3>
                <p className="mt-2 text-text-muted">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Image src="/landing/spec-page.jpg" width={1100} height={778} sizes="(min-width: 1024px) 60vw, 100vw"
              alt="A spec book page: dish photo, ingredients and method side by side, allergens underneath" className="w-full rounded-lg border border-border" />
            <Image src="/landing/guest-phone.jpg" width={390} height={844} sizes="(min-width: 1024px) 25vw, 60vw"
              alt="A pub's guest menu on a phone: a build-your-own burger group with allergen chips" className="mx-auto w-full max-w-xs rounded-lg border border-border" />
          </div>
        </section>

        <section aria-labelledby="different" className="bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 id="different" className="text-2xl">What&apos;s different</h2>
            <ul className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {DIFFERENT.map(([t, d]) => (
                <li key={t} className="rounded-lg bg-bg p-5 shadow-card">
                  <h3 className="flex items-center gap-2 text-lg"><Check aria-hidden className="size-5 shrink-0 text-accent" />{t}</h3>
                  <p className="mt-2 text-text-muted">{d}</p>
                </li>
              ))}
            </ul>
            <h3 className="mt-10 text-lg">Coming next</h3>
            <p className="mt-1 text-text-muted">Not in the app yet. These are what we&apos;re building now:</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {NEXT.map((n) => <li key={n} className="rounded-pill border border-border-input bg-bg px-3 py-1.5 text-sm">{n}</li>)}
            </ul>
          </div>
        </section>

        <section aria-labelledby="pricing-h" id="pricing" className="mx-auto max-w-6xl scroll-mt-4 px-5 py-14">
          <h2 className="text-2xl" id="pricing-h">Pricing</h2>
          <p className="mt-2 text-text-muted">Per site, per month. Everyone in your team included, every feature in every tier. 30-day trial, no card. Pay yearly and get 2 months free. Prices exclude VAT.</p>
          <ul className="mt-6 grid gap-5 md:grid-cols-3" aria-labelledby="pricing-h">
            {TIERS.map((t) => (
              <li key={t.id} className="flex flex-col rounded-lg border border-border p-6">
                <h3 className="text-lg">{t.name}</h3>
                <p className="text-sm text-text-muted">{t.forWho}</p>
                <p className="mt-4"><span className="text-3xl font-bold">{pounds(t.monthly ?? t.annual / 10)}</span> <span className="text-text-muted">per site a month</span></p>
                <p className="text-sm text-text-muted">{t.monthly ? `or ${pounds(t.annual)} per site a year` : `${pounds(t.annual)} per site a year, yearly only`}</p>
                <p className="mt-4 text-sm">{t.support}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="faq" className="bg-surface">
          <div className="mx-auto max-w-3xl px-5 py-14">
            <h2 id="faq" className="text-2xl">Questions</h2>
            <div className="mt-6 grid gap-3">
              {FAQ.map(([q, a]) => (
                <details key={q} className="rounded-lg bg-bg p-4 shadow-card">
                  <summary className="cursor-pointer font-semibold">{q}</summary>
                  <p className="mt-2 text-text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="early" id="early-list" className="mx-auto max-w-3xl scroll-mt-4 px-5 py-16">
          <h2 id="early" className="text-2xl">Get on the early list</h2>
          <p className="mt-2 mb-6 text-text-muted">We&apos;re opening to a small number of pub and restaurant groups first. Leave your details and we&apos;ll be in touch.</p>
          <div className="relative"><EarlyListForm /></div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-text-muted">
          <span>{BRAND.name}</span>
          <Link href="/login" className="underline">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
