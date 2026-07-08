import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import type { Customer } from '@/lib/types';

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('shop_id', getShopId())
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
      shop_id: getShopId(),
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

export async function updateCustomer(id: string, customer: Omit<Customer, 'id' | 'portalToken'>): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .update({
      name: customer.name,
      type: customer.type,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      tags: customer.tags,
      follow_up: customer.followUp,
    })
    .eq('id', id)
    .eq('shop_id', getShopId())
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

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('shop_id', getShopId());
  if (error) throw error;
}

export async function updateCustomerEmail(customerId: string, email: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ email })
    .eq('id', customerId)
    .eq('shop_id', getShopId());
  if (error) throw error;
}

export async function updateFollowUp(customerId: string, followUp: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ follow_up: followUp })
    .eq('id', customerId)
    .eq('shop_id', getShopId());
  if (error) throw error;
}
