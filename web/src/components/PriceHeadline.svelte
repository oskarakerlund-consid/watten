<script lang="ts">
  import type { PriceStatusResponse, Result } from "../lib/api";
  import { formatPrice } from "../lib/format";

  let { status }: { status: Result<PriceStatusResponse> | null } = $props();

  const LABELS = {
    cheap: { symbol: "↓", text: "Billigt just nu" },
    normal: { symbol: "＝", text: "Normalt pris" },
    expensive: { symbol: "↑", text: "Dyrt just nu" },
  } as const;
</script>

<section class="headline" aria-live="polite">
  {#if status === null}
    <p class="label">Hämtar priser…</p>
  {:else if !status.ok}
    <p class="label">Priser saknas</p>
    <p class="detail">{status.message}</p>
  {:else}
    {@const label = LABELS[status.data.level]}
    <p class="label"><span class="symbol" aria-hidden="true">{label.symbol}</span> {label.text}</p>
    <p class="price">{formatPrice(status.data.currentSekPerKwh)}</p>
    <p class="detail">
      Närmaste timmen, jämfört med snittet {formatPrice(status.data.averageSekPerKwh)} de senaste
      {status.data.averageWindowHours} timmarna.
    </p>
  {/if}
</section>

<style>
  .headline {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 0;
  }
  p { margin: 0; }
  .label { font-size: clamp(1.75rem, 8vw, 3.5rem); font-weight: 700; line-height: 1.1; }
  .symbol { display: inline-block; min-width: 1em; }
  .price { font-size: clamp(1.25rem, 5vw, 2rem); font-weight: 600; margin-top: 0.25rem; }
  .detail { margin-top: 0.5rem; max-width: 32rem; opacity: 0.9; }
</style>
