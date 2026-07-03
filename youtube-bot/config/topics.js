'use strict';

// Video topics — the bot rotates through these in order.
// screenFlows reference keys in config/flows.js
// pexelsQueries are fallback B-roll search terms
module.exports = [
  {
    id: 'repair-order-60sec',
    titleHint: 'Create a Repair Order in 60 Seconds — Auto Shop CRM Demo 2025',
    hook: 'Most auto shops waste 20 minutes filling out a repair order by hand. Watch how Redlined1 does it in under 60 seconds.',
    angle: 'speed and simplicity vs pen-and-paper or slow legacy software',
    screenFlows: ['login', 'create_repair_order'],
    pexelsQueries: ['car mechanic repair shop', 'auto technician working', 'mechanic diagnostic car'],
    cta: 'Start your free shop at redlined1.com — link in description.',
  },
  {
    id: 'estimate-to-invoice',
    titleHint: 'Estimate to Invoice in One Click — Auto Shop Software Demo',
    hook: 'Stop retyping the same numbers twice. In Redlined1 you convert an estimate to a paid invoice with a single click.',
    angle: 'eliminate double-entry, reduce billing errors',
    screenFlows: ['login', 'create_estimate', 'convert_to_invoice'],
    pexelsQueries: ['invoice billing business', 'tablet car repair estimate', 'auto shop customer service'],
    cta: 'Try Redlined1 free at redlined1.com.',
  },
  {
    id: 'multi-vendor-parts',
    titleHint: 'Order Parts from Multiple Vendors on One Order — Redlined1',
    hook: 'Real repairs need parts from multiple suppliers. Redlined1 is the only shop CRM that tracks every vendor per line item.',
    angle: 'unique feature competitors do not have',
    screenFlows: ['login', 'create_parts_order'],
    pexelsQueries: ['auto parts store shelves', 'mechanic parts delivery', 'warehouse auto parts'],
    cta: 'See the full feature list at redlined1.com.',
  },
  {
    id: 'multi-currency',
    titleHint: 'Auto Shop Software with Multi-Currency Support — THB USD EUR',
    hook: 'Running an auto shop in Thailand, the Philippines, or anywhere outside the US? Redlined1 is built for you — full multi-currency support.',
    angle: 'unique international angle — no US-only limitation',
    screenFlows: ['login', 'multi_currency_invoice'],
    pexelsQueries: ['international business currency', 'asian auto repair shop', 'car repair thailand'],
    cta: 'redlined1.com — built for shops worldwide.',
  },
  {
    id: 'vs-mitchell1',
    titleHint: 'Mitchell1 Alternative 2025 — Is Redlined1 Better for Small Shops?',
    hook: 'Mitchell1 charges hundreds per month and locks you into a contract. Here is what Redlined1 gives you for free.',
    angle: 'competitor comparison — cost and simplicity',
    screenFlows: ['login', 'full_dashboard_tour'],
    pexelsQueries: ['frustrated mechanic paperwork', 'auto shop owner computer', 'car repair business'],
    cta: 'Switch to Redlined1 free at redlined1.com.',
  },
  {
    id: 'vehicle-management',
    titleHint: 'Track Every Vehicle, Every Job — Auto Shop Vehicle Management Demo',
    hook: 'Do you know which cars in your shop are waiting on parts right now? Redlined1 shows you everything at a glance.',
    angle: 'visibility and control over the shop floor',
    screenFlows: ['login', 'vehicle_management'],
    pexelsQueries: ['car lot dealership aerial', 'mechanic shop floor cars', 'auto workshop vehicles'],
    cta: 'Try Redlined1 free — redlined1.com.',
  },
  {
    id: 'qa-signoff',
    titleHint: 'Never Return a Bad Job Again — QA Sign-Off Workflow Demo',
    hook: 'Returned jobs kill your shop reputation. Redlined1 has a built-in QA checklist that runs every technician through a quality sign-off before the car leaves.',
    angle: 'quality control and liability protection',
    screenFlows: ['login', 'qa_signoff'],
    pexelsQueries: ['mechanic inspecting car', 'quality control automotive', 'car inspection checklist'],
    cta: 'Protect your reputation — redlined1.com.',
  },
  {
    id: 'vin-decode',
    titleHint: 'Scan a VIN and Auto-Fill the Vehicle — Auto Shop CRM Trick',
    hook: 'Stop typing vehicle details by hand. In Redlined1 you scan the VIN barcode and it auto-fills year, make, model, and engine spec instantly.',
    angle: 'time saving trick — feels like magic',
    screenFlows: ['login', 'vin_decode'],
    pexelsQueries: ['vin number car door', 'car dashboard close up', 'mechanic scanning barcode'],
    cta: 'redlined1.com — work smarter, not harder.',
  },
];
