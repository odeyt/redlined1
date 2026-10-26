import type { Metadata } from 'next';
import { SearchLanding } from '@/components/marketing/SearchLanding';

const title = 'Mobile Mechanic Software for Jobs & Invoices | RedlineD1';
const description = 'Run mobile mechanic jobs from your phone: customer records, inspections, estimates and invoices in one workflow. Try RedlineD1 free. No credit card required.';
export const metadata: Metadata = {
  title, description,
  alternates: { canonical: '/mobile-mechanic-software' },
  openGraph: { type: 'website', title, description, url: '/mobile-mechanic-software', siteName: 'RedlineD1' },
  twitter: { card: 'summary', title, description },
  robots: { index: true, follow: true },
};

export default function MobileMechanicPage() {
  return <SearchLanding content={{
    slug: 'mobile-mechanic-software',
    audience: 'For independent mobile mechanics',
    title: 'Mobile mechanic software that goes to the job with you.',
    intro: 'Keep customer details, vehicle history, inspection photos, estimates and invoices together. RedlineD1 is a browser-based workspace you can use from a phone, tablet or laptop, whether you work at a customer’s driveway or return to a shop.',
    steps: [
      { title: 'Start with the customer and vehicle', body: 'Create a job card with the vehicle details and reason for the visit. Keep the customer’s contact details and service history connected so your next visit starts with context.' },
      { title: 'Document what you find', body: 'Use a digital inspection checklist and attach photos to findings. A clear record helps explain the condition you found and the work you recommend.' },
      { title: 'Build the estimate at the job site', body: 'Prepare an estimate from your phone while the vehicle is in front of you. Keep the proposed work with the job record instead of reconstructing the quote from messages later.' },
      { title: 'Invoice and record payment', body: 'Create the invoice when the work is complete and record payment in the same workflow. Keep a service history for the next time that customer calls.' },
    ],
    checklist: [
      'Create a sample customer, vehicle and job using the phone you use at work.',
      'Attach inspection photos and check how the report looks to a customer.',
      'Build an estimate, then review the invoice and payment-recording workflow.',
      'Find the job again through the customer or vehicle history.',
      'Check your expected monthly job volume against the Free and paid plan limits.',
    ],
    questions: [
      { question: 'Do I need a physical repair shop?', answer: 'No. RedlineD1 supports mobile mechanics working at customer locations as well as fixed repair shops. You can manage the job from a phone, tablet or laptop.' },
      { question: 'Is this a native mobile app?', answer: 'RedlineD1 is a responsive, installable web app. Open it in your browser and, on supported devices, add it to your home screen.' },
      { question: 'Can I rely on it without an internet connection?', answer: 'Offline-ready functionality is marked beta. Plan to use an internet connection for your normal workflow and test the specific actions you need before relying on them offline.' },
      { question: 'Can I start without paying?', answer: 'New accounts get seven days of full access with no credit card required. After that, keep the Free plan within its limits or choose a paid plan. Current limits and prices are listed on the pricing section.' },
    ],
    related: { href: '/digital-vehicle-inspection-software', label: 'digital vehicle inspection software' },
  }} />;
}
