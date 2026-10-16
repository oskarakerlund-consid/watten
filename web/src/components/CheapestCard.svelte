<script lang="ts">
  import type { CheapestResponse, Result } from "../lib/api";
  import { formatPrice, formatSpan } from "../lib/format";
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
  {/if}
</Card>
