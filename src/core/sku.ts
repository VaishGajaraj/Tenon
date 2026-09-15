import type { SkuDef } from "./types";
import { rcmReconSku } from "@/tenants/rcm/sku";
import { mitigationSupplementSku } from "@/tenants/mitigation/sku";

/**
 * SKU registry. Adding a tenant/SKU = writing one SkuDef file and listing it
 * here. Nothing else in the harness changes — that is the whole point.
 *
 * RCM recon is first: it is the act-one MOCK demo path. The mitigation
 * supplement SKU remains registered as legacy scaffold.
 */
const REGISTRY: SkuDef[] = [rcmReconSku, mitigationSupplementSku];

export function allSkus(): SkuDef[] {
  return REGISTRY;
}

export function getSku(tenant: string, sku: string): SkuDef {
  const def = REGISTRY.find((s) => s.tenant === tenant && s.sku === sku);
  if (!def) throw new Error(`Unknown SKU ${tenant}/${sku}`);
  return def;
}
