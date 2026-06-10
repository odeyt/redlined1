import { supabase } from '@/lib/supabase';
import type { Customer } from '@/lib/types';

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    type: row.type ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    tags: row.tags ?? [],
    followUp: row.follow_up ?? '',
    portalToken: row.portal_token ?? null,
  }));
}

export async function saveCustomer(customer: Omit<Customer, 'id'>): Promise<Customer> {
  const id = `C-${Date.now()}`;
  const { data, error } = await supabase
    .from('customers')
    .insert({
      id,
      name: customer.name,
      type: customer.type,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      tags: customer.tags,
      follow_up: customer.followUp,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    type: data.type ?? '',
    phone: data.phone ?? '',
    email: data.email ?? '',
    address: data.address ?? '',
    tags: data.tags ?? [],
    followUp: data.follow_up ?? '',
    portalToken: data.portal_token ?? null,
  };
}

export async function updateFollowUp(customerId: string, followUp: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ follow_up: followUp })
    .eq('id', customerId);
  if (error) throw error;
}
