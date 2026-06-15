'use client';

import { useAppState, useAppDispatch } from '@/lib/store';
import { moduleTitles } from '@/lib/mock-data';
import { Icon } from './Icon';
import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useShop } from '@/lib/useShop';

export function Header() {
  const { activeModule } = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { role } = useShop();
  const [title, subtitle] = moduleTitles[activeModule] || ['Dashboard', ''];
  const isTech = role === 'technician';

  function handleTopCreateInvoice() {
    dispatch({ type: 'SET_MODULE', module: 'invoices' });
    dispatch({ type: 'SET_PREFILL', prefill: { openNewForm: true } as never });
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
        {!isTech && (
          <button className="btn" onClick={() => dispatch({ type: 'OPEN_NEW_JOB_CARD' })}>
            <Icon name="add" /> New Job Card
          </button>
        )}
        {!isTech && (
          <button className="btn primary" onClick={handleTopCreateInvoice}>
            <Icon name="invoice" /> Create Invoice
          </button>
        )}
        <button className="btn" onClick={handleLogout} title="Sign out">
          Sign Out
        </button>
      </div>
    </header>
  );
}
