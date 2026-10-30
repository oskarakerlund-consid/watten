<script lang="ts">
  import type { CheapestResponse, Result } from "../lib/api";
  import { formatPrice, formatSpan, formatTime } from "../lib/format";
  import Card from "./Card.svelte";

  let { cheapest, intervalHours, periodHours }: { cheapest: Result<CheapestResponse> | null; intervalHours: number; periodHours: number } =
    $props();
</script>

<Card title={`Billigaste ${intervalHours} h inom ${periodHours} h`}>
  {#if cheapest === null}
    <p>Hämtar…</p>
  {:else if !cheapest.ok}
    <p>{cheapest.message}</p>
  {:else}
    <p class="big">{formatSpan(new Date(cheapest.data.start), new Date(cheapest.data.end), new Date())}</p>
    <p>Snitt {formatPrice(cheapest.data.averageSekPerKwh)}</p>
    {#if !cheapest.data.complete}
      <p class="note">Priser är bara kända till {formatTime(new Date(cheapest.data.knownUntil), new Date())}.</p>
    {/if}
  {/if}
</Card>

<style>
  .note { font-size: 0.8rem; opacity: 0.85; margin-top: 0.25rem !important; }
</style>
