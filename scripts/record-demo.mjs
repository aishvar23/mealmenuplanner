/**
 * Record the landing-page hero demo: a condensed onboarding → recommendation
 * walkthrough, captured as video against the running dev server. The raw .webm
 * lands in scripts/.demo-recording/ (git-ignored); it is then trimmed/scaled and
 * encoded into the looping MP4 + WebM the landing hero plays (public/demo/). The
 * encode used ffmpeg-static with a moderate ~1.6x speed-up (setpts) so the whole
 * flow + the recommendation are comfortably seen in one loop (the walk's beats
 * stay generous for readability; the speed-up just tightens the total), roughly:
 *   ffmpeg -ss 0.5 -i demo-raw.webm -vf "setpts=PTS/1.6,scale=430:920:flags=lanczos" \
 *     -an -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 24 -movflags +faststart \
 *     public/demo/onboarding-demo.mp4   (and -c:v libvpx-vp9 ... .webm; one -frames:v 1 poster)
 *
 * It reuses the e2e auth model: provision a throwaway confirmed user via the
 * Supabase service role, sign in through the real /sign-in form (in a context
 * with NO recording so sign-in stays out of the video), then drive the wizard
 * in a second, video-recording mobile-viewport context that starts already
 * authenticated at /onboarding. The temp user + the household it creates are
 * deleted at the end.
 *
 * The wizard mounts only the current step's controls and keeps step state in
 * memory (no per-step URL), so — like e2e/helpers/onboarding.ts — we walk it by
 * filling whatever required field is present, pressing Next, and waiting for the
 * step heading (h2) to actually change before continuing. Curated answers
 * (vegetarian, North Indian, dinner, 60-min weekday window — the same set the
 * e2e RECO specs rely on) reliably yield a real suggestion; a short cook time +
 * a breakfast cuisine can be filtered out by the prep-aware engine and leave the
 * slot empty. The preferred-dishes step is shown in full: it enters the "Select
 * meal combinations" mode and picks a couple of curated plates.
 *
 * Run with the dev server up:  node scripts/record-demo.mjs
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from .env.local).
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const RAW_DIR = path.resolve(process.cwd(), "scripts/.demo-recording");
const RAW_VIDEO = path.join(RAW_DIR, "demo-raw.webm");
const PASSWORD = "demo-Password-1234";
const EMAIL = `demo+${Date.now()}@example.com`;

// Mobile-ish portrait viewport: the app's responsive layout renders the clean
// single-column onboarding + stacked Today board that fits the hero's card.
const VIEWPORT = { width: 430, height: 920 };

/** Deliberate pause so each screen is readable in the recording. */
const beat = (page, ms = 900) => page.waitForTimeout(ms);

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (load .env.local).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fillIfVisible(locator, value) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.fill(value);
    return true;
  }
  return false;
}

async function clickIfVisible(locator) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
    return true;
  }
  return false;
}

async function headingText(heading) {
  return (
    (await heading
      .first()
      .textContent()
      .catch(() => null)) ?? ""
  );
}

/** Poll until the step heading differs from `before`, or time out (returns null). */
async function waitForHeadingChange(page, heading, before, timeout = 12_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const cur = await headingText(heading);
    if (cur !== before) return cur;
    await page.waitForTimeout(150);
  }
  return null;
}

async function walk(page) {
  await page.goto("/onboarding", { waitUntil: "networkidle" });
  await clickIfVisible(page.getByRole("button", { name: "Start over" }));
  const heading = page.getByRole("heading", { level: 2 });
  await heading.first().waitFor({ state: "visible", timeout: 15_000 });
  await beat(page, 1200);

  let typedName = false;
  let pickedCombos = false;
  for (let i = 0; i < 10; i++) {
    // Household name — type it once for a live-input feel, then keep it set.
    const name = page.getByLabel("Household name");
    if (await name.isVisible().catch(() => false)) {
      const val = await name.inputValue().catch(() => "");
      if (!val && !typedName) {
        await name.click();
        await name.pressSequentially("The Mehta Family", { delay: 110 });
        typedName = true;
        await beat(page, 1000);
      } else if (!val) {
        await name.fill("The Mehta Family");
      }
    }
    // Only the current step's controls exist, so these no-op on other steps.
    // Pause only when an action actually happened, so the (deliberately
    // unhurried) pacing lands on the relevant step, not as dead time everywhere.
    if (await fillIfVisible(page.getByLabel("Family size"), "4"))
      await beat(page, 1000);
    if (
      await clickIfVisible(
        page.getByRole("radio", { name: "Vegetarian", exact: true }),
      )
    )
      await beat(page, 1100);
    if (
      await clickIfVisible(
        page.getByRole("button", { name: "North Indian", exact: true }),
      )
    )
      await beat(page, 1100);
    if (
      await clickIfVisible(
        page.getByRole("radio", { name: "Medium", exact: true }),
      )
    )
      await beat(page, 1100);
    if (
      await clickIfVisible(
        page.getByRole("button", { name: "Dinner", exact: true }),
      )
    )
      await beat(page, 1100);
    if (await fillIfVisible(page.getByLabel("Weekday cooking time"), "60"))
      await beat(page, 1100);
    if (
      await clickIfVisible(
        page.getByRole("button", { name: "Balanced", exact: true }),
      )
    )
      await beat(page, 1100);

    // Preferred-dishes step — demo the meal-combination picker: enter "Select
    // meal combinations", pick a couple, then scroll the list to reveal and
    // select more (showing the scroll-and-pick interaction).
    const comboMode = page.getByRole("button", {
      name: "Select meal combinations",
    });
    if ((await comboMode.isVisible().catch(() => false)) && !pickedCombos) {
      await comboMode.click();
      await beat(page, 1400);
      // The 3 mode cards render first; combo cards (also aria-pressed) load
      // async after them, so wait for the first one then pick two near the top.
      const pressables = page.locator("button[aria-pressed]");
      await pressables.nth(3).waitFor({ state: "visible", timeout: 20_000 });
      await beat(page, 1100);
      await pressables.nth(3).click();
      await beat(page, 1100);
      await pressables.nth(4).click();
      await beat(page, 1300);

      // Scroll the combinations list (its own overflow container) down a few
      // times, pausing so the scroll reads, and keep selecting further ones.
      for (const idx of [5, 6, 7]) {
        await page.mouse.move(215, 620); // over the combinations list
        await page.mouse.wheel(0, 200);
        await beat(page, 1300);
        if (idx < (await pressables.count())) {
          await pressables.nth(idx).click();
          await beat(page, 1200);
        }
      }
      await beat(page, 1600); // linger on the selected combinations
      pickedCombos = true;
    }

    const finish = page.getByRole("button", { name: "Finish setup" });
    if (await finish.isVisible().catch(() => false)) {
      await beat(page, 2200); // linger on the review summary
      await finish.click();
      // /today does first-meal work on load, so wait on URL commit (not the full
      // `load` lifecycle, which can hang) then on DOM content + the slot heading.
      await page.waitForURL(/\/today(\?|#|$)/, {
        timeout: 60_000,
        waitUntil: "commit",
      });
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      break;
    }

    const before = await headingText(heading);
    await beat(page, 1400);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const changed = await waitForHeadingChange(page, heading, before);
    if (!changed) {
      throw new Error(
        `Wizard did not advance past "${before}" — a required field is likely unset.`,
      );
    }
  }

  // The payoff — generate today's recommendation and hold on it long enough to
  // read (the generate route can cold-compile, so retry once).
  await beat(page, 1800);
  const suggest = page.getByRole("button", { name: /suggest a meal/i }).first();
  const tryAnother = page.getByRole("button", { name: "Try another" }).first();
  await suggest.click();
  try {
    await tryAnother.waitFor({ state: "visible", timeout: 35_000 });
  } catch {
    if (await suggest.isEnabled().catch(() => false)) {
      await suggest.click();
      await tryAnother.waitFor({ state: "visible", timeout: 35_000 });
    } else {
      throw new Error("No recommendation was generated on /today.");
    }
  }
  // Frame the recommendation at the top and hold a long beat — this is the
  // payoff and must be clearly visible (and not truncated) before the loop
  // restarts. The long tail also buffers Playwright trimming frames on close.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await beat(page, 7000);
}

async function main() {
  fs.rmSync(RAW_DIR, { recursive: true, force: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const admin = makeAdmin();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !created?.user) {
    throw new Error(`Could not provision demo user: ${error?.message}`);
  }
  const userId = created.user.id;
  console.log(`[demo] provisioned ${EMAIL} (${userId})`);

  const browser = await chromium.launch();
  let ctx;
  let page;
  try {
    // 1) Sign in (no recording) and capture the authenticated session.
    const authCtx = await browser.newContext({ baseURL: BASE_URL });
    const authPage = await authCtx.newPage();
    await authPage.context().clearCookies();
    await authPage.goto("/sign-in");
    await authPage.getByLabel("Email").fill(EMAIL);
    await authPage.getByLabel("Password").fill(PASSWORD);
    await authPage
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await authPage.waitForURL(/\/onboarding(\?|$|\/)/, { timeout: 30_000 });
    const storageState = await authCtx.storageState();
    await authCtx.close();
    console.log("[demo] signed in, captured session");

    // 2) Record the walkthrough in a fresh, already-authenticated context.
    ctx = await browser.newContext({
      baseURL: BASE_URL,
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      storageState,
      recordVideo: { dir: RAW_DIR, size: VIEWPORT },
    });
    page = await ctx.newPage();

    try {
      await walk(page);
    } catch (walkErr) {
      await page
        .screenshot({ path: path.join(RAW_DIR, "error.png"), fullPage: true })
        .catch(() => {});
      console.error(
        `[demo] walk failed on step heading "${await headingText(
          page.getByRole("heading", { level: 2 }),
        )}" at ${page.url()}`,
      );
      throw walkErr;
    }

    const video = page.video();
    await ctx.close();
    ctx = undefined;
    if (video) await video.saveAs(RAW_VIDEO);
    console.log(`[demo] saved raw video → ${RAW_VIDEO}`);
  } finally {
    if (ctx) {
      const video = page?.video();
      await ctx.close().catch(() => {});
      // Best-effort: keep whatever was recorded for debugging a failed run.
      if (video) await video.saveAs(RAW_VIDEO).catch(() => {});
    }
    await browser.close();
    // Households reference users(id) without cascade, so delete them first.
    await admin.from("households").delete().eq("created_by_user_id", userId);
    await admin.auth.admin.deleteUser(userId);
    console.log("[demo] cleaned up temp user + household");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
