// src/quotation/access.ts
//
// Who may use the Quotations module on the phone: the super admin, plus any office user the super admin switches on
// (Quotations > Access). The server decides (routes/quotationRoutes.js: QUOTATION_APP_EMAILS + the quotation_app_access
// table); this hook only asks it, so the Quotes button shows for the right people. The answer is cached per login.

import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';

export interface QuotationAccess {
  allowed: boolean;
  /** true only for the super admin: may open the Access screen */
  canManage: boolean;
  /** false until the first answer arrives */
  ready: boolean;
}

const cache = new Map<string, { allowed: boolean; canManage: boolean }>();

export function useQuotationAccess(): QuotationAccess {
  const { user, appRole } = useAuth();
  const key = String(user?.email ?? '').trim().toLowerCase();
  const [, bump] = useState(0);

  useEffect(() => {
    if (!key || appRole !== 'staff') return undefined;
    let live = true;
    api
      .get('quotations/access/me')
      .then(({ data }) => cache.set(key, { allowed: !!data.allowed, canManage: !!data.canManage }))
      .catch(() => { if (!cache.has(key)) cache.set(key, { allowed: false, canManage: false }); })
      .finally(() => { if (live) bump((n) => n + 1); });
    return () => { live = false; };
  }, [key, appRole]);

  const hit = cache.get(key);
  return { allowed: hit?.allowed ?? false, canManage: hit?.canManage ?? false, ready: !!hit };
}
