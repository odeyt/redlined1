'use client';

import { useAppState, useAppDispatch } from '@/lib/store';
import { moduleTitles } from '@/lib/mock-data';
import { Icon } from './Icon';
import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export function Header() {
  const { activeModule, jobCards } = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [title, subtitle] = moduleTitles[activeModule] || ['Dashboard', ''];

  function handleTopCreateInvoice() {
    const target = jobCards.find(j => !j.invoice) || jobCards[0];
    if (target) dispatch({ type: 'CREATE_INVOICE_FROM_JOB', jobId: target.id });
  }

  async function handleLogout() {
    await signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="actions">
        <input className="search" placeholder="Search customers, VINs, job cards, invoices, parts" />
        <button className="btn" onClick={() => dispatch({ type: 'SET_MODULE', module: 'job-cards' })}>
          <Icon name="add" /> New Job Card
        </button>
        <button className="btn primary" onClick={handleTopCreateInvoice}>
          <Icon name="invoice" /> Create Invoice
        </button>
        <button className="btn" onClick={handleLogout} title="Sign out">
          Sign Out
        </button>
      </div>
    </header>
  );
}
