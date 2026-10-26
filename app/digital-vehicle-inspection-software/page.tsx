import type { Metadata } from 'next';
import { SearchLanding } from '@/components/marketing/SearchLanding';

const title = 'Digital Vehicle Inspection Software | RedlineD1';
const description = 'Document vehicle inspections with checklists, photos and technician notes. Share findings with customers and connect repairs to estimates. Start RedlineD1 free.';
export const metadata: Metadata = {
  title, description,
  alternates: { canonical: '/digital-vehicle-inspection-software' },
  openGraph: { type: 'website', title, description, url: '/digital-vehicle-inspection-software', siteName: 'RedlineD1' },
  twitter: { card: 'summary', title, description },
  robots: { index: true, follow: true },
};

export default function DigitalInspectionPage() {
  return <SearchLanding content={{
    slug: 'digital-vehicle-inspection-software',
    audience: 'For repair shops and mobile technicians',
    title: 'Digital vehicle inspection software that makes findings clear.',
    intro: 'Replace disconnected inspection notes with a consistent record. RedlineD1 combines checklists, photos and technician notes with customer sharing, estimates and vehicle history, so the inspection stays connected to the repair workflow.',
    steps: [
      { title: 'Inspect with a consistent checklist', body: 'Work through vehicle systems such as brakes, tires, fluids and lights. Mark each item Pass, Attention or Fail so the report separates observations by condition.' },
      { title: 'Add photos and a useful explanation', body: 'Attach a photo to the finding and describe what was observed. Keep measurements and context in technician notes so another person can understand the recommendation.' },
      { title: 'Share findings with the customer', body: 'Send a customer share link to the inspection report. Photos and notes give the customer something concrete to review when discussing the recommended work.' },
      { title: 'Connect findings to the next step', body: 'Carry inspection findings into the estimate workflow and keep the inspection connected to the job and vehicle history. Review the customer approval process before starting work.' },
    ],
    checklist: [
      'Run a sample inspection and mark different items Pass, Attention and Fail.',
      'Photograph a finding and add a note that explains the observation clearly.',
      'Open the customer share link on another device and check readability.',
      'Review how a finding connects to an estimate and customer approval.',
      'Return to the vehicle record and find the earlier inspection.',
    ],
    questions: [
      { question: 'What is a digital vehicle inspection?', answer: 'A digital vehicle inspection, or DVI, is an electronic record of vehicle condition. A technician uses a checklist, notes and photos to document findings and share them with the customer.' },
      { question: 'Can technicians use a phone?', answer: 'Yes. RedlineD1 supports a phone-friendly inspection workflow, including photo documentation. Try a complete inspection on the devices your technicians use.' },
      { question: 'Does this work for mobile mechanics?', answer: 'Yes. An inspection can be documented at a customer’s home, workplace or fleet yard. The report stays connected to the customer and vehicle records.' },
      { question: 'Does a report replace a conversation with the customer?', answer: 'No. Use the report to support the conversation: explain the finding, the proposed repair and the estimate, and confirm the customer’s decision before work begins.' },
    ],
    related: { href: '/mobile-mechanic-software', label: 'software for mobile mechanics' },
  }} />;
}
