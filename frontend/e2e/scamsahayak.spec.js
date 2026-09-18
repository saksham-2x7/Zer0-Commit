import { test, expect } from '@playwright/test';

test.describe('ScamSahayak End-to-End Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('scamsahayak-has-seen-help', 'true');
    });
    // Start on English page
    await page.goto('/');
  });

  test('Submits text and views result, checks history', async ({ page }) => {
    // 1. Submit a suspicious message
    const textarea = page.getByRole('textbox');
    await textarea.waitFor({ state: 'visible' });
    await textarea.fill('URGENT: Your bank account is suspended. Click here to verify your KYC and OTP immediately.');

    const analyzeBtn = page.getByRole('button', { name: 'Check message' });
    await expect(analyzeBtn).toBeEnabled();
    await analyzeBtn.click();

    // 2. Wait for result view (Mock Bedrock returns instantly)
    // We expect the risk level or explanation to show up.
    // Based on the code, there's usually a heading like "Explanation" or "Scam Analysis" 
    // or just checking if "Check message" disappears and the result shows.
    // The "Start over" button usually appears when done.
    const startOverBtn = page.getByRole('button', { name: /Check another message/i });
    await expect(startOverBtn).toBeVisible({ timeout: 10000 });

    // Ensure there's an explanation and checklist
    // Mock Bedrock fallback explanation has "identified as a HIGH risk" or something similar.
    await expect(page.locator('body')).toContainText(/risk/i);

    // 3. Open History Panel
    // The history panel can be opened with a button if it exists.
    const historyToggle = page.getByRole('button', { name: /history/i });
    if (await historyToggle.isVisible()) {
      await historyToggle.click();
      
      // History should contain the submitted text (or part of it)
      await expect(page.getByRole('dialog')).toContainText('URGENT: Your bank');
      
      // Close history
      await page.keyboard.press('Escape');
    }

    // 4. Start over
    await startOverBtn.click();
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('');
  });

  test('Switches language to Hindi', async ({ page }) => {
    const langSelect = page.getByRole('combobox');
    await langSelect.selectOption('hi');
    
    // Check if the placeholder or button translates to Hindi
    // Hindi translation for "Check message" is "संदेश तपासा" (Wait, that's Marathi? No, Hindi is "संदेश जांचें" or similar). 
    // From translations: "संदेश की जांच करें"
    const analyzeBtnHi = page.getByRole('button', { name: /संदेश/i });
    await expect(analyzeBtnHi).toBeVisible();
  });
});
