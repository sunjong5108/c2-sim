/* ═══════════════════════════════════════════════════════════
   Palantir Foundry OSDK client — skeleton
   실제 OSDK 사용 시 아래 주석을 해제하고 `@osdk/client`를 설치.
   ═══════════════════════════════════════════════════════════ */

/*
  Example usage (uncomment after `npm i @osdk/client @osdk/oauth`):

  import { createClient } from "@osdk/client";
  import { createPublicOauthClient } from "@osdk/oauth";
  import type { Client } from "@osdk/client";
  import { $ontologyRid } from "../../.generated/ontology";

  const url = import.meta.env.VITE_FOUNDRY_URL;
  const clientId = import.meta.env.VITE_FOUNDRY_CLIENT_ID;
  const ontologyRid = import.meta.env.VITE_FOUNDRY_ONTOLOGY_RID ?? $ontologyRid;

  if (!url || !clientId || !ontologyRid) {
    throw new Error("Foundry OSDK env vars missing. Copy .env.example and fill values.");
  }

  const auth = createPublicOauthClient(clientId, url, `${window.location.origin}/auth/callback`);
  export const foundryClient: Client = createClient(url, ontologyRid, auth);
*/

export interface FoundryClientSkeleton {
  url: string | undefined;
  clientId: string | undefined;
  ontologyRid: string | undefined;
}

export const foundryClientSkeleton: FoundryClientSkeleton = {
  url: import.meta.env.VITE_FOUNDRY_URL,
  clientId: import.meta.env.VITE_FOUNDRY_CLIENT_ID,
  ontologyRid: import.meta.env.VITE_FOUNDRY_ONTOLOGY_RID,
};
