import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fillLoginForm(page: Page, email: string, password: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
}

async function submitForm(page: Page) {
  await page.getByRole('button', { name: /sign in/i }).click();
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test('renders login page with AOP branding', async ({ page }) => {
    await expect(page).toHaveTitle(/Aurum Operations Platform/i);
    await expect(page.getByText('Aurum Operations Platform')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows validation errors for empty form submission', async ({ page }) => {
    await submitForm(page);
    await expect(page.getByText(/enter a valid email/i)).toBeVisible();
    await expect(page.getByText(/password is required/i)).toBeVisible();
  });

  test('shows validation error for invalid email', async ({ page }) => {
    await page.getByLabel('Email address').fill('not-an-email');
    await page.getByLabel('Password').fill('anything');
    await submitForm(page);
    await expect(page.getByText(/enter a valid email/i)).toBeVisible();
  });

  // ── Standard login (no TOTP) ─────────────────────────────────────────────

  test('redirects to /dashboard on successful login without TOTP', async ({ page }) => {
    // Mock the API response for a non-TOTP user
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'mock-jwt-token',
            requiresTOTP: false,
            user: { id: 'usr_001', email: 'admin@aurum.finance', role: 'ADMIN' },
          },
        }),
      });
    });

    await fillLoginForm(page, 'admin@aurum.finance', 'password123');
    await submitForm(page);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test('shows error toast on invalid credentials', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      });
    });

    await fillLoginForm(page, 'wrong@aurum.finance', 'wrongpassword');
    await submitForm(page);

    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 3000 });
  });

  // ── TOTP flow ─────────────────────────────────────────────────────────────

  test('shows TOTP input when API returns requiresTOTP', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { requiresTOTP: true },
        }),
      });
    });

    await fillLoginForm(page, 'totp-user@aurum.finance', 'password123');
    await submitForm(page);

    // TOTP step should appear
    await expect(page.getByLabel('Authenticator Code')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/enter your 6-digit authenticator code/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /verify code/i })).toBeVisible();
  });

  test('TOTP input only accepts numeric digits', async ({ page }) => {
    // Trigger TOTP step
    await page.route('**/api/v1/auth/login', async (route) => {
      const body = await route.request().postDataJSON();
      if (!body?.totpCode) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { requiresTOTP: true } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { requiresTOTP: true } }),
        });
      }
    });

    await fillLoginForm(page, 'totp-user@aurum.finance', 'password123');
    await submitForm(page);

    const totpInput = page.getByLabel('Authenticator Code');
    await expect(totpInput).toBeVisible({ timeout: 3000 });
    await totpInput.fill('abc123');
    // maxLength=6 and the input type=text keeps the value; zod ignores non-numeric
    await expect(totpInput).toHaveAttribute('maxlength', '6');
  });

  test('completes full TOTP login flow and redirects to dashboard', async ({ page }) => {
    let callCount = 0;

    await page.route('**/api/v1/auth/login', async (route) => {
      callCount += 1;
      const body = await route.request().postDataJSON();

      if (callCount === 1 || !body?.totpCode) {
        // First call: return requiresTOTP
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { requiresTOTP: true } }),
        });
      } else {
        // Second call with TOTP code: return access token
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              accessToken: 'mock-jwt-with-totp',
              user: { id: 'usr_002', email: 'totp-user@aurum.finance', role: 'TRADE_MANAGER' },
            },
          }),
        });
      }
    });

    // Step 1: enter credentials
    await fillLoginForm(page, 'totp-user@aurum.finance', 'securepass');
    await submitForm(page);

    // Step 2: TOTP screen appears
    const totpInput = page.getByLabel('Authenticator Code');
    await expect(totpInput).toBeVisible({ timeout: 3000 });
    await totpInput.fill('123456');

    // Step 3: verify
    await page.getByRole('button', { name: /verify code/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test('shows error on invalid TOTP code', async ({ page }) => {
    let callCount = 0;

    await page.route('**/api/v1/auth/login', async (route) => {
      callCount += 1;
      if (callCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { requiresTOTP: true } }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid TOTP code' }),
        });
      }
    });

    await fillLoginForm(page, 'totp-user@aurum.finance', 'password');
    await submitForm(page);

    const totpInput = page.getByLabel('Authenticator Code');
    await expect(totpInput).toBeVisible({ timeout: 3000 });
    await totpInput.fill('000000');
    await page.getByRole('button', { name: /verify code/i }).click();

    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 3000 });
    // Should stay on login page (TOTP step)
    await expect(page).toHaveURL(/\/login/);
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  test('root path redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveURL(/\/login/);
  });

  test('dashboard redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

// ─── Password reset links ─────────────────────────────────────────────────────

test.describe('Forgot password flow', () => {
  test('forgot-password page is reachable and renders correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/forgot-password`);
    await expect(page.getByText('Forgot Password')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible();
  });

  test('shows confirmation after requesting reset', async ({ page }) => {
    await page.route('**/api/v1/auth/password-reset/request', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { sent: true } }),
      });
    });

    await page.goto(`${BASE_URL}/forgot-password`);
    await page.getByLabel('Email address').fill('user@aurum.finance');
    await page.getByRole('button', { name: /send reset link/i }).click();

    await expect(page.getByText(/reset link sent/i)).toBeVisible({ timeout: 3000 });
  });
});
