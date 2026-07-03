'use strict';

// Playwright screen recording flows for Redlined1
// Each flow receives (page, env) and performs actions while being recorded
module.exports = {

  async login(page, env) {
    await page.goto(env.REDLINE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]').first();
    const passInput  = page.locator('input[type="password"]').first();
    await emailInput.fill(env.REDLINE_EMAIL);
    await passInput.fill(env.REDLINE_PASSWORD);
    await passInput.press('Enter');
    await page.waitForTimeout(3000);
  },

  async create_repair_order(page) {
    // Navigate to Repair Orders
    await page.locator('text=Repair Orders').first().click();
    await page.waitForTimeout(1500);
    // Click New RO
    const newBtn = page.locator('text=+ New RO, button:has-text("New RO")').first();
    await newBtn.click();
    await page.waitForTimeout(1000);
    // Fill customer
    const custInput = page.locator('input[placeholder*="customer" i], input[placeholder*="Customer" i]').first();
    await custInput.click();
    await custInput.type('SAISAVANH MOTOR', { delay: 60 });
    await page.waitForTimeout(800);
    // Select first suggestion if dropdown appears
    const firstSuggestion = page.locator('[role="listbox"] [role="option"], .dropdown-item').first();
    if (await firstSuggestion.isVisible().catch(() => false)) await firstSuggestion.click();
    await page.waitForTimeout(600);
    // Fill concern
    const concern = page.locator('textarea[placeholder*="customer reports" i], textarea[placeholder*="Concern" i]').first();
    await concern.click();
    await concern.type('Engine oil leak from rear main seal', { delay: 45 });
    await page.waitForTimeout(500);
    // Add a part
    const addPart = page.locator('button:has-text("Add Part"), text=+ Add Part').first();
    await addPart.click();
    await page.waitForTimeout(400);
    const partDesc = page.locator('input[placeholder*="Part name" i], input[placeholder*="description" i]').last();
    await partDesc.click();
    await partDesc.type('Rear Main Seal Kit', { delay: 50 });
    const unitCost = page.locator('input[placeholder="0"]').last();
    await unitCost.click();
    await unitCost.fill('850');
    await page.waitForTimeout(600);
    // Save
    const saveBtn = page.locator('button:has-text("Create RO"), button[type="submit"]:has-text("RO")').first();
    await saveBtn.click();
    await page.waitForTimeout(2500);
  },

  async create_estimate(page) {
    await page.locator('text=Estimates').first().click();
    await page.waitForTimeout(1500);
    const newBtn = page.locator('button:has-text("New Estimate"), button:has-text("+ New")').first();
    await newBtn.click();
    await page.waitForTimeout(1000);
    // Fill customer
    const custInput = page.locator('input[placeholder*="customer" i]').first();
    await custInput.click();
    await custInput.type('D1 IMPORTS', { delay: 60 });
    await page.waitForTimeout(800);
    const suggestion = page.locator('[role="option"], .dropdown-item').first();
    if (await suggestion.isVisible().catch(() => false)) await suggestion.click();
    await page.waitForTimeout(500);
    // Add line items
    const descInput = page.locator('input[placeholder*="description" i], input[placeholder*="service" i]').last();
    await descInput.click();
    await descInput.type('Front brake pad replacement', { delay: 50 });
    const rateInput = page.locator('input[placeholder*="rate" i], input[placeholder*="0.00" i], input[type="number"]').last();
    await rateInput.click();
    await rateInput.fill('3500');
    await page.waitForTimeout(500);
    // Set currency to THB
    const currencyInput = page.locator('input[placeholder*="currency" i], input[placeholder*="Currency" i]').first();
    if (await currencyInput.isVisible().catch(() => false)) {
      await currencyInput.click();
      await currencyInput.fill('THB');
      await page.waitForTimeout(500);
      const thbOption = page.locator('text=THB').first();
      if (await thbOption.isVisible().catch(() => false)) await thbOption.click();
    }
    await page.waitForTimeout(600);
    const saveBtn = page.locator('button:has-text("Save"), button[type="submit"]').first();
    await saveBtn.click();
    await page.waitForTimeout(2000);
  },

  async convert_to_invoice(page) {
    // Find the saved estimate and convert it
    await page.waitForTimeout(1000);
    const convertBtn = page.locator('button:has-text("Convert to Invoice"), button:has-text("Convert")').first();
    if (await convertBtn.isVisible().catch(() => false)) {
      await convertBtn.click();
      await page.waitForTimeout(2000);
    }
    // Navigate to invoices to show result
    await page.locator('text=Invoicing').first().click();
    await page.waitForTimeout(2000);
  },

  async create_parts_order(page) {
    await page.locator('text=Parts Orders').first().click();
    await page.waitForTimeout(1500);
    const newBtn = page.locator('button:has-text("New"), button:has-text("+ New Parts")').first();
    await newBtn.click();
    await page.waitForTimeout(1000);
    // Add parts from different vendors
    const partDesc = page.locator('input[placeholder*="Part name" i]').last();
    await partDesc.click();
    await partDesc.type('Radiator hose upper', { delay: 50 });
    const unitCost = page.locator('input[placeholder="0"]').last();
    await unitCost.click();
    await unitCost.fill('450');
    await page.waitForTimeout(400);
    // Add second part
    const addPart = page.locator('button:has-text("Add Part"), text=+ Add Part').first();
    await addPart.click();
    await page.waitForTimeout(300);
    const partDesc2 = page.locator('input[placeholder*="Part name" i]').last();
    await partDesc2.click();
    await partDesc2.type('Thermostat housing', { delay: 50 });
    const unitCost2 = page.locator('input[placeholder="0"]').last();
    await unitCost2.click();
    await unitCost2.fill('1200');
    await page.waitForTimeout(600);
    // Show vendor dropdown
    const vendorSelect = page.locator('select, [placeholder*="vendor" i]').first();
    if (await vendorSelect.isVisible().catch(() => false)) {
      await vendorSelect.click();
      await page.waitForTimeout(800);
    }
  },

  async multi_currency_invoice(page) {
    await page.locator('text=Invoicing').first().click();
    await page.waitForTimeout(1500);
    const newBtn = page.locator('button:has-text("Create Invoice"), button:has-text("+ New")').first();
    await newBtn.click();
    await page.waitForTimeout(1000);
    // Change currency to THB
    const currencyInput = page.locator('input[placeholder*="currency" i]').first();
    if (await currencyInput.isVisible().catch(() => false)) {
      await currencyInput.click();
      await currencyInput.fill('THB');
      await page.waitForTimeout(500);
      const option = page.locator('text=Thai Baht').first();
      if (await option.isVisible().catch(() => false)) await option.click();
    }
    // Add a line item
    const descInput = page.locator('input[placeholder*="description" i]').last();
    await descInput.click();
    await descInput.type('Engine overhaul labor', { delay: 50 });
    const rateInput = page.locator('input[type="number"]').last();
    await rateInput.click();
    await rateInput.fill('18000');
    await page.waitForTimeout(1000);
  },

  async full_dashboard_tour(page) {
    // Slow pan through each module
    const modules = ['Vehicles', 'Repair Orders', 'Estimates', 'Invoicing', 'Parts Orders', 'Employees'];
    for (const mod of modules) {
      const link = page.locator(`text=${mod}`).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForTimeout(2500);
      }
    }
  },

  async vehicle_management(page) {
    await page.locator('text=Vehicles').first().click();
    await page.waitForTimeout(1500);
    // Click through filter pills
    const pills = ['In Progress', 'Pending Parts', 'Completed'];
    for (const pill of pills) {
      const el = page.locator(`button:has-text("${pill}"), span:has-text("${pill}")`).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        await page.waitForTimeout(1200);
      }
    }
    // Click first vehicle to open detail
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(2000);
    }
  },

  async qa_signoff(page) {
    await page.locator('text=Repair Orders').first().click();
    await page.waitForTimeout(1500);
    // Find a Complete-ready RO and show QA flow
    const completeBtn = page.locator('button:has-text("Complete Job"), button:has-text("QA Sign")').first();
    if (await completeBtn.isVisible().catch(() => false)) {
      await completeBtn.click();
      await page.waitForTimeout(2000);
    }
  },

  async vin_decode(page) {
    await page.locator('text=Vehicles').first().click();
    await page.waitForTimeout(1500);
    const newBtn = page.locator('button:has-text("New Job Card"), button:has-text("+ New")').first();
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(1000);
    }
    // Show VIN field
    const vinInput = page.locator('input[placeholder*="VIN" i], input[placeholder*="vin" i]').first();
    if (await vinInput.isVisible().catch(() => false)) {
      await vinInput.scrollIntoViewIfNeeded();
      await vinInput.click();
      await vinInput.type('1HGCM82633A004352', { delay: 80 });
      await page.waitForTimeout(2500); // wait for auto-decode
    }
  },
};
