// SI-13: Customer Lifetime Intelligence — Shop-context-aware service layer

import { getShopId, getShopIds } from '@/lib/shopStore';
import {
  buildCustomerProfile,
  getCustomerProfile,
  getCustomerSegments,
  getCustomerHealth,
} from '@/intelligence/customer/CustomerLifetimeEngine';
import { buildCustomerTimeline } from '@/intelligence/customer/CustomerTimelineEngine';
import { buildCustomerContext } from '@/intelligence/customer/CustomerContextBuilder';
import { findCustomerOpportunities } from '@/intelligence/customer/CustomerOpportunityEngine';
import type {
  CustomerBuildResult,
  CustomerLifetimeProfile,
  CustomerSegment,
  CustomerTimelineItem,
  CustomerRevenueOpportunity,
  CustomerHealthStatus,
} from '@/intelligence/customer/types';

export async function buildCustomerIntelligence(customerId: string): Promise<CustomerBuildResult> {
  const shopId = await getShopId();
  return buildCustomerProfile(shopId, customerId);
}

export async function getCustomerIntelligenceProfile(customerId: string): Promise<CustomerLifetimeProfile | null> {
  const shopId = await getShopId();
  return getCustomerProfile(shopId, customerId);
}

export async function getCustomerIntelligenceSegments(customerId: string): Promise<CustomerSegment[]> {
  const shopId = await getShopId();
  return getCustomerSegments(shopId, customerId);
}

export async function getCustomerIntelligenceTimeline(customerId: string): Promise<CustomerTimelineItem[]> {
  const shopId = await getShopId();
  const ctx = await buildCustomerContext(shopId, customerId);
  return buildCustomerTimeline(ctx);
}

export async function getCustomerIntelligenceOpportunities(customerId: string): Promise<CustomerRevenueOpportunity[]> {
  const shopId = await getShopId();
  const ctx = await buildCustomerContext(shopId, customerId);
  return findCustomerOpportunities(ctx);
}

export async function getCustomerIntelligenceHealth(): Promise<CustomerHealthStatus> {
  const shopId = await getShopId();
  return getCustomerHealth(shopId);
}
