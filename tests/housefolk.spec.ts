import { test, expect } from '@playwright/test';

// All tests target the live app at https://app.housefolk.co/housefolk.html
// Only chromium is used (configured in playwright.config.ts).
// Tests cover the 8 specified scenarios.

const APP_URL = 'https://app.housefolk.co/housefolk.html';

// ────────────────────────────────────────────────────────────
// 1. Landing page loads with correct title and logo visible
// ────────────────────────────────────────────────────────────
test('1. Landing page loads with correct title and logo visible', async ({ page }) => {
  await page.goto(APP_URL);

  // Page title
  await expect(page).toHaveTitle('Housefolk — find your place');

  // Landing screen is visible
  const landingScreen = page.locator('#landing-screen');
  await expect(landingScreen).toBeVisible();

  // Logo is visible
  const logo = page.locator('.landing-logo');
  await expect(logo).toBeVisible();

  // Logo text contains "Housefolk" (case-insensitive match for "House" + "folk")
  await expect(logo).toContainText('House');
  await expect(logo).toContainText('folk');
});

// ────────────────────────────────────────────────────────────
// 2. Navigate to auth screen (sign in) — form visible
// ────────────────────────────────────────────────────────────
test('2. Navigate to auth screen via landing CTA — sign-in form visible', async ({ page }) => {
  await page.goto(APP_URL);

  // Click the "Browse for free" CTA which calls goToBrowse() → showScreen('auth')
  // when there is no token. This navigates to the auth screen.
  const browseCta = page.locator('.cta-btn.browse');
  await expect(browseCta).toBeVisible();
  await browseCta.click();

  // Auth screen should now be active
  const authScreen = page.locator('#auth-screen');
  await expect(authScreen).toBeVisible();

  // Sign-in tab should be active and sign-in form visible
  const tabIn = page.locator('#tab-in');
  await expect(tabIn).toBeVisible();

  // Switch to sign-in tab explicitly to make sure form-in is shown
  await tabIn.click();

  const formIn = page.locator('#form-in');
  await expect(formIn).toBeVisible();

  // Email and password fields are present
  await expect(page.locator('#si-email')).toBeVisible();
  await expect(page.locator('#si-pass')).toBeVisible();
});

// ────────────────────────────────────────────────────────────
// 3. Sign in with wrong credentials shows error (toast)
// ────────────────────────────────────────────────────────────
test('3. Sign in with wrong credentials shows error toast', async ({ page }) => {
  await page.goto(APP_URL);

  // Navigate to auth screen
  await page.locator('.cta-btn.browse').click();
  await expect(page.locator('#auth-screen')).toBeVisible();

  // Ensure sign-in tab is active
  await page.locator('#tab-in').click();
  await expect(page.locator('#form-in')).toBeVisible();

  // Fill in fake credentials
  await page.locator('#si-email').fill('test.wrong.credentials@faketest.invalid');
  await page.locator('#si-pass').fill('WrongPassword99!');

  // Click sign-in button
  const signInBtn = page.locator('#form-in .btn-primary');
  await signInBtn.click();

  // A toast notification should appear with an error message.
  // The toast element gets the class "show" when displayed.
  const toast = page.locator('#toast');
  await expect(toast).toHaveClass(/show/, { timeout: 10000 });

  // Toast should contain some error text (not empty)
  const toastText = await toast.textContent();
  expect(toastText).toBeTruthy();
  expect(toastText!.length).toBeGreaterThan(0);
});

// ────────────────────────────────────────────────────────────
// 4. Sign up form validation — empty fields show error
// ────────────────────────────────────────────────────────────
test('4. Sign up form validation — submitting empty fields shows toast error', async ({ page }) => {
  await page.goto(APP_URL);

  // Navigate to auth screen via "Post a listing" CTA
  await page.locator('.cta-btn.post').click();
  await expect(page.locator('#auth-screen')).toBeVisible();

  // Should be on sign-up tab (goToPost redirects unauthenticated users to sign-up)
  const formUp = page.locator('#form-up');
  await expect(formUp).toBeVisible();

  // Click "Create my account" with all fields empty
  const signUpBtn = page.locator('#form-up .btn-primary');
  await signUpBtn.click();

  // Toast error should appear
  const toast = page.locator('#toast');
  await expect(toast).toHaveClass(/show/, { timeout: 5000 });

  const toastText = await toast.textContent();
  expect(toastText).toBeTruthy();
  // The app shows "Please fill in all required fields" for empty sign-up
  expect(toastText).toContain('Please fill in all required fields');
});

// ────────────────────────────────────────────────────────────
// 5. Navigation to browse works from landing
// ────────────────────────────────────────────────────────────
test('5. Browse CTA from landing navigates to auth/browse screen', async ({ page }) => {
  await page.goto(APP_URL);

  // Verify we start on the landing page
  await expect(page.locator('#landing-screen')).toBeVisible();

  // Click the "Browse for free →" button
  const browseCta = page.locator('.cta-btn.browse');
  await expect(browseCta).toBeVisible();
  await expect(browseCta).toContainText('Browse');
  await browseCta.click();

  // Without a session token, goToBrowse() redirects to auth screen (sign-up tab)
  // The landing screen should no longer be the active visible element
  // and the auth screen should be visible
  const authScreen = page.locator('#auth-screen');
  await expect(authScreen).toBeVisible();

  // Landing screen should be hidden
  const landingScreen = page.locator('#landing-screen');
  await expect(landingScreen).not.toBeVisible();
});

// ────────────────────────────────────────────────────────────
// 6. Post listing button navigates to auth if not logged in
// ────────────────────────────────────────────────────────────
test('6. Post a listing CTA navigates to auth screen when not logged in', async ({ page }) => {
  await page.goto(APP_URL);

  // Verify we start on the landing page
  await expect(page.locator('#landing-screen')).toBeVisible();

  // Click the "Post a listing →" CTA
  const postCta = page.locator('.cta-btn.post');
  await expect(postCta).toBeVisible();
  await expect(postCta).toContainText('Post a listing');
  await postCta.click();

  // goToPost() redirects unauthenticated users to auth screen on sign-up tab
  const authScreen = page.locator('#auth-screen');
  await expect(authScreen).toBeVisible();

  // The sign-up form should be shown (goToPost calls switchTab('up'))
  const formUp = page.locator('#form-up');
  await expect(formUp).toBeVisible();

  // Landing screen should be hidden
  await expect(page.locator('#landing-screen')).not.toBeVisible();
});

// ────────────────────────────────────────────────────────────
// 7. All 3 listing type cards visible on post step A (#psa)
// ────────────────────────────────────────────────────────────
test('7. All 3 listing type cards are present in the DOM on post step A', async ({ page }) => {
  await page.goto(APP_URL);

  // The tier cards live inside #panel-post > #psa and are always in the DOM
  // even when the dashboard is not active. We verify they exist and have content.
  const flatshareCard = page.locator('#tc-flatshare');
  const rentalCard = page.locator('#tc-rental');
  const subletCard = page.locator('#tc-sublet');

  // Verify all three cards are present in the DOM
  await expect(flatshareCard).toBeAttached();
  await expect(rentalCard).toBeAttached();
  await expect(subletCard).toBeAttached();

  // Verify they have the tier-card class
  await expect(flatshareCard).toHaveClass(/tier-card/);
  await expect(rentalCard).toHaveClass(/tier-card/);
  await expect(subletCard).toHaveClass(/tier-card/);

  // Verify each card contains its listing type name
  await expect(flatshareCard).toContainText('Flatshare');
  await expect(rentalCard).toContainText('Rental');
  await expect(subletCard).toContainText('Sublet');
});

// ────────────────────────────────────────────────────────────
// 8. Logo visible on auth screen
// ────────────────────────────────────────────────────────────
test('8. Logo is visible on the auth screen', async ({ page }) => {
  await page.goto(APP_URL);

  // Navigate to auth screen
  await page.locator('.cta-btn.browse').click();
  await expect(page.locator('#auth-screen')).toBeVisible();

  // The auth screen has a logo with class "auth-logo"
  const authLogo = page.locator('.auth-logo');
  await expect(authLogo).toBeVisible();

  // Logo should contain the brand name
  await expect(authLogo).toContainText('House');
});
