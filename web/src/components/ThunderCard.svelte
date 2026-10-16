<script lang="ts">
  import type { Result, ThunderResponse } from "../lib/api";
  import { formatSpan } from "../lib/format";
  import Card from "./Card.svelte";

  let {
    thunder,
    hours,
    usingPosition,
    city,
  }: { thunder: Result<ThunderResponse> | null; hours: number; usingPosition: boolean; city: string } = $props();
</script>

<Card title={`Åska närmaste ${hours} h`}>
  {#if thunder === null}
    <p>Hämtar…</p>
  {:else if !thunder.ok}
    <p>{thunder.message}</p>
  {:else if thunder.data.expected && thunder.data.start && thunder.data.end}
    <p class="big"><span aria-hidden="true">⚡</span> Åska väntas {formatSpan(new Date(thunder.data.start), new Date(thunder.data.end), new Date())}</p>
    <p>Undvik att ladda elbil och använda känslig elutrustning.</p>
  {:else}
    <p class="big">Ingen åska väntas</p>
  {/if}
  <p class="where">
    {usingPosition ? "För din position" : `För ${city}. Dela din plats i inställningarna för en lokal prognos.`}
    {#if thunder?.ok && thunder.data.stale}(prognosen kan vara inaktuell){/if}
  </p>
</Card>

<style>
  .where { font-size: 0.8rem; opacity: 0.85; margin-top: 0.25rem !important; }
</style>
