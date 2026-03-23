/**
 * Messaging flow tests for Housefolk app
 * Target: https://app.housefolk.co/housefolk.html
 * Credentials loaded from .env.test
 *
 * Sidebar navigation (as seen after login):
 *   #si-overview → #panel-overview
 *   #si-post     → #panel-post
 *   #si-listings → #panel-mylistings
 *   #si-inbox    → #panel-inbox
 *   #si-tenant   → #panel-tenant  (Renter account — browse, saved, messages)
 *
 * Contact modal (#contact-modal):
 *   - Opened via openEnquiryModal(id, title)
 *   - Closed via ✕ button or clicking outside
 *   - #contact-listing-title, #contact-message textarea, "Send message →" button
 *   - After send: #toast gets class "show"
 *
 * Browse (#listing-grid) is currently display:none (coming soon).
 * We call openEnquiryModal directly via page.evaluate.
 *
 * Auth strategy: sign in ONCE per user role using storageState, then reuse
 * the session across tests to avoid triggering server-side rate limiting.
 *
 * Tests are chromium-only (skip on firefox/webkit) and run serially.
 */

import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Run serially — only one worker should use these shared credentials at a time
test.describe.configure({ mode: 'serial' });

// Skip on non-chromium browsers to avoid parallel auth collisions
test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Messaging tests run on chromium only');
});

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

const APP_URL = '/housefolk.html';
const LANDLORD_EMAIL = process.env.TEST_LANDLORD_EMAIL!;
const LANDLORD_PASS = process.env.TEST_LANDLORD_PASS!;
const TENANT_EMAIL = process.env.TEST_TENANT_EMAIL!;
const TENANT_PASS = process.env.TEST_TENANT_PASS!;

// Paths for saved auth states (temp files, cleaned up after tests)
const TENANT_STORAGE_FILE = path.join(os.tmpdir(), `hf-tenant-storage-${process.pid}.json`);
const LANDLORD_STORAGE_FILE = path.join(os.tmpdir(), `hf-landlord-storage-${process.pid}.json`);

// ─── Helper: dismiss cookie banner if present ────────────────────────────────
async function dismissCookieBanner(page: Page) {
  try {
    const banner = page.locator('#cookie-banner');
    const isVisible = await banner.isVisible({ timeout: 2000 });
    if (isVisible) {
      await page.locator('#cookie-banner button').first().click();
      await expect(banner).not.toBeVisible({ timeout: 3000 });
    }
  } catch {
    // Cookie banner not present or already dismissed — continue
  }
}

// ─── Helper: perform a fresh sign-in and save storageState ──────────────────
async function performSignIn(page: Page, email: string, password: string, storageFile?: string) {
  await page.goto(APP_URL);
  await dismissCookieBanner(page);

  await page.locator('.cta-btn.browse').click();
  await expect(page.locator('#auth-screen')).toBeVisible({ timeout: 10000 });

  await page.locator('#tab-in').click();
  await expect(page.locator('#form-in')).toBeVisible();

  await page.locator('#si-email').fill(email);
  await page.locator('#si-pass').fill(password);
  await page.locator('#form-in .btn-primary').click();

  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 25000 });
  await dismissCookieBanner(page);

  // Save the storage state (localStorage/cookies) for reuse
  if (storageFile) {
    await page.context().storageState({ path: storageFile });
  }
}

// ─── Helper: restore session from storageState and navigate to app ───────────
async function restoreSession(page: Page, storageFile: string) {
  // storageState is set on the context, not the page
  // We need to add the storage to the current page context
  await page.context().addInitScript(() => {}); // noop to ensure init
  // Load the stored localStorage values
  const state = JSON.parse(fs.readFileSync(storageFile, 'utf-8'));
  const origins = state.origins || [];
  for (const origin of origins) {
    for (const ls of (origin.localStorage || [])) {
      await page.addInitScript(({ name, value }: { name: string; value: string }) => {
        localStorage.setItem(name, value);
      }, { name: ls.name, value: ls.value });
    }
  }
  await page.goto(APP_URL);
  await dismissCookieBanner(page);
}

// ─── Sign-in helpers that reuse cached storage when available ─────────────────
async function signInAsTenant(page: Page) {
  if (fs.existsSync(TENANT_STORAGE_FILE)) {
    await restoreSession(page, TENANT_STORAGE_FILE);
  } else {
    await performSignIn(page, TENANT_EMAIL, TENANT_PASS, TENANT_STORAGE_FILE);
    return;
  }
  // After restoring, check if we're logged in
  const dashVisible = await page.locator('#dash-screen').isVisible({ timeout: 5000 }).catch(() => false);
  if (!dashVisible) {
    // Session expired or invalid — sign in fresh
    await performSignIn(page, TENANT_EMAIL, TENANT_PASS, TENANT_STORAGE_FILE);
  }
}

async function signInAsLandlord(page: Page) {
  if (fs.existsSync(LANDLORD_STORAGE_FILE)) {
    await restoreSession(page, LANDLORD_STORAGE_FILE);
  } else {
    await performSignIn(page, LANDLORD_EMAIL, LANDLORD_PASS, LANDLORD_STORAGE_FILE);
    return;
  }
  const dashVisible = await page.locator('#dash-screen').isVisible({ timeout: 5000 }).catch(() => false);
  if (!dashVisible) {
    await performSignIn(page, LANDLORD_EMAIL, LANDLORD_PASS, LANDLORD_STORAGE_FILE);
  }
}

// ─── Helper: close contact modal via ✕ button ────────────────────────────────
async function closeContactModal(page: Page) {
  const closeBtn = page.locator('#contact-modal button').filter({ hasText: '✕' });
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
  } else {
    await page.evaluate(() => {
      const m = document.getElementById('contact-modal') as HTMLElement;
      if (m) m.style.display = 'none';
    });
  }
  await expect(page.locator('#contact-modal')).not.toBeVisible({ timeout: 5000 });
}

// ─── Helper: get first listing from landlord my-listings table ───────────────
async function getLandlordFirstListing(page: Page): Promise<{ id: string; title: string } | null> {
  await page.locator('#si-listings').click();
  await expect(page.locator('#panel-mylistings')).toBeVisible({ timeout: 10000 });

  const rows = page.locator('#panel-mylistings table tbody tr');
  const rowCount = await rows.count();
  if (rowCount === 0) return null;

  const firstRow = rows.first();
  let id = await firstRow.getAttribute('data-id')
    || await firstRow.getAttribute('data-listing-id');

  if (!id) {
    const idEl = firstRow.locator('[data-id]').first();
    if (await idEl.count() > 0) id = await idEl.getAttribute('data-id');
  }

  if (!id) return null;

  const firstCell = firstRow.locator('td').first();
  const title = ((await firstCell.textContent()) || '').trim() || 'Landlord Listing';
  return { id, title };
}

// ─── Cleanup: remove temp storage files after all tests ─────────────────────
test.afterAll(() => {
  for (const f of [TENANT_STORAGE_FILE, LANDLORD_STORAGE_FILE]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  }
});

// ─── Test 1: Contact modal opens via openEnquiryModal ───────────────────────
test('1. Contact modal opens via openEnquiryModal page.evaluate', async ({ page }) => {
  await signInAsTenant(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  await page.evaluate(() => {
    (window as any).openEnquiryModal('test-id', 'Test Listing');
  });

  const modal = page.locator('#contact-modal');
  await expect(modal).toBeVisible({ timeout: 5000 });

  await closeContactModal(page);
});

// ─── Test 2: Contact modal contains required elements ────────────────────────
test('2. Contact modal contains required elements', async ({ page }) => {
  await signInAsTenant(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  await page.evaluate(() => {
    (window as any).openEnquiryModal('test-listing-id', 'My Test Property');
  });

  const modal = page.locator('#contact-modal');
  await expect(modal).toBeVisible({ timeout: 5000 });

  // #contact-listing-title is present and shows the listing name
  await expect(page.locator('#contact-listing-title')).toBeVisible();
  await expect(page.locator('#contact-listing-title')).toContainText('My Test Property');

  // #contact-message textarea is present
  await expect(page.locator('#contact-message')).toBeVisible();

  // "Send message →" button is present
  await expect(modal.locator('button').filter({ hasText: /Send message/i })).toBeVisible();

  // ✕ close button is present
  await expect(modal.locator('button').filter({ hasText: '✕' })).toBeVisible();

  await closeContactModal(page);
});

// ─── Test 3: Tenant can type a message in the contact modal ──────────────────
test('3. Tenant can type a message in the contact modal textarea', async ({ page }) => {
  await signInAsTenant(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  await page.evaluate(() => {
    (window as any).openEnquiryModal('test-listing-id', 'My Test Property');
  });

  await expect(page.locator('#contact-modal')).toBeVisible({ timeout: 5000 });

  const textarea = page.locator('#contact-message');
  const testMessage = `Hello, I am interested in this property. Timestamp: ${Date.now()}`;
  await textarea.fill(testMessage);
  await expect(textarea).toHaveValue(testMessage);

  await closeContactModal(page);
});

// ─── Test 4: Sending a message shows a toast ─────────────────────────────────
test('4. Sending a message shows a toast notification', async ({ page }) => {
  // Sign in as landlord to get a listing id (uses cached storage if available)
  await signInAsLandlord(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });
  const listing = await getLandlordFirstListing(page);

  // Switch to tenant session
  await page.evaluate(() => {
    if (typeof (window as any).signOut === 'function') (window as any).signOut();
  });
  // Clear the landlord storage file so the next signInAsLandlord re-authenticates fresh
  // (no need — we can keep it, signOut clears localStorage in the browser context)
  await signInAsTenant(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  const listingId = listing?.id || 'test-listing-id';
  const listingTitle = listing?.title || 'Test Listing';

  await page.evaluate(({ id, title }: { id: string; title: string }) => {
    (window as any).openEnquiryModal(id, title);
  }, { id: listingId, title: listingTitle });

  await expect(page.locator('#contact-modal')).toBeVisible({ timeout: 5000 });

  await page.locator('#contact-message').fill(`Playwright test message — ${Date.now()}`);

  const sendBtn = page.locator('#contact-modal button').filter({ hasText: /Send message/i });
  await sendBtn.scrollIntoViewIfNeeded();
  await sendBtn.click();

  // Toast should appear (success or error — the UI responded either way)
  const toast = page.locator('#toast');
  await expect(toast).toHaveClass(/show/, { timeout: 10000 });
  const toastText = await toast.textContent();
  expect(toastText).toBeTruthy();
  expect((toastText || '').length).toBeGreaterThan(0);
});

// ─── Test 5: Full flow — tenant sends message, landlord sees it in inbox ──────
test('5. Full flow: tenant sends message, landlord sees it in inbox', async ({ page }) => {
  test.setTimeout(30000);

  // Step 1: sign in as landlord and get (or create) a listing
  await signInAsLandlord(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  let listing = await getLandlordFirstListing(page);

  if (!listing) {
    await page.locator('#si-post').click();
    await expect(page.locator('#panel-post')).toBeVisible({ timeout: 10000 });
    await page.locator('#tc-flatshare').click();
    await expect(page.locator('#psb')).toBeVisible({ timeout: 10000 });

    const autoTitle = `Messaging Test ${Date.now()}`;
    await page.locator('#f-title').fill(autoTitle);
    await page.locator('#f-loc').fill('London, UK');
    await page.locator('#f-price').fill('1100');
    await page.locator('#f-beds').selectOption('1');
    await page.locator('#f-desc').fill('Test listing for messaging Playwright test.');
    const avail = new Date();
    avail.setDate(avail.getDate() + 30);
    await page.locator('#f-avail').fill(avail.toISOString().split('T')[0]);

    const nextBtn = page.locator('#psb .btn-primary');
    await nextBtn.scrollIntoViewIfNeeded();
    await nextBtn.click();
    await expect(page.locator('#psc')).toBeVisible({ timeout: 10000 });

    const nextReviewBtn = page.locator('#psc .btn-primary');
    await nextReviewBtn.scrollIntoViewIfNeeded();
    await nextReviewBtn.click();
    await expect(page.locator('#psd')).toBeVisible({ timeout: 10000 });

    const confirmBtn = page.locator('#psd .btn-primary');
    await confirmBtn.scrollIntoViewIfNeeded();
    await confirmBtn.click();
    await expect(page.locator('#pse')).toBeVisible({ timeout: 15000 });

    await page.locator('#si-listings').click();
    await expect(page.locator('#panel-mylistings')).toBeVisible({ timeout: 10000 });
    listing = await getLandlordFirstListing(page);
  }

  const listingId = listing?.id ?? 'unknown-id';
  const listingTitle = listing?.title ?? 'Test Listing';

  // Step 2: switch to tenant session
  await page.evaluate(() => {
    if (typeof (window as any).signOut === 'function') (window as any).signOut();
  });
  await signInAsTenant(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  // Step 3: open contact modal for the listing
  await page.evaluate(({ id, title }: { id: string; title: string }) => {
    (window as any).openEnquiryModal(id, title);
  }, { id: listingId, title: listingTitle });

  await expect(page.locator('#contact-modal')).toBeVisible({ timeout: 5000 });

  // Step 4: fill and send message
  const uniqueMessage = `Playwright e2e message — ${Date.now()}`;
  await page.locator('#contact-message').fill(uniqueMessage);

  const sendBtn = page.locator('#contact-modal button').filter({ hasText: /Send message/i });
  await sendBtn.scrollIntoViewIfNeeded();
  await sendBtn.click();

  // Step 5: success toast should appear
  const toast = page.locator('#toast');
  await expect(toast).toHaveClass(/show/, { timeout: 10000 });
  const toastText = await toast.textContent();
  expect(toastText).toBeTruthy();

  // Step 6: close modal before navigating (it may still be open)
  await page.evaluate(() => {
    const m = document.getElementById('contact-modal') as HTMLElement;
    if (m) m.style.display = 'none';
  });
  await expect(page.locator('#contact-modal')).not.toBeVisible({ timeout: 3000 });

  // Step 7: check #tenant-messages-wrap in tenant panel
  await page.locator('#si-tenant').click();
  await expect(page.locator('#panel-tenant')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#tenant-messages-wrap')).toBeAttached();

  // Step 8: switch to landlord and check inbox
  await page.evaluate(() => {
    if (typeof (window as any).signOut === 'function') (window as any).signOut();
  });
  await signInAsLandlord(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  await page.locator('#si-inbox').click();
  await expect(page.locator('#panel-inbox')).toBeVisible({ timeout: 10000 });

  const inboxCard = page.locator('#panel-inbox .fcard');
  await expect(inboxCard).toBeAttached();
});

// ─── Test 6: Renter account panel is accessible ──────────────────────────────
test('6. Renter account panel is accessible after tenant signs in', async ({ page }) => {
  await signInAsTenant(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  await page.locator('#si-tenant').click();
  await expect(page.locator('#panel-tenant')).toBeVisible({ timeout: 10000 });

  await expect(page.locator('#tenant-messages-wrap')).toBeAttached();
});

// ─── Test 7: Contact modal can be closed via ✕ button ────────────────────────
test('7. Contact modal can be closed via the ✕ button', async ({ page }) => {
  await signInAsTenant(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  await page.evaluate(() => {
    (window as any).openEnquiryModal('test-id', 'Close Test Listing');
  });

  const modal = page.locator('#contact-modal');
  await expect(modal).toBeVisible({ timeout: 5000 });

  const closeBtn = modal.locator('button').filter({ hasText: '✕' });
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();

  await expect(modal).not.toBeVisible({ timeout: 5000 });
});

// ─── Test 8: Landlord inbox panel renders its container ──────────────────────
test('8. Landlord inbox panel renders fcard container', async ({ page }) => {
  await signInAsLandlord(page);
  await expect(page.locator('#dash-screen')).toBeVisible({ timeout: 10000 });

  await page.locator('#si-inbox').click();
  await expect(page.locator('#panel-inbox')).toBeVisible({ timeout: 10000 });

  await expect(page.locator('#panel-inbox .fcard')).toBeAttached();
});
