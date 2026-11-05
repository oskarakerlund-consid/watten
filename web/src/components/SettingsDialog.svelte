<script lang="ts">
  import type { Position } from "../lib/settings";
  import type { Zone } from "../lib/zones";
  import Dialog from "./Dialog.svelte";
  import ZonePicker from "./ZonePicker.svelte";

  let {
    zone,
    position,
    locating,
    onchoose,
    onlocate,
    onclose,
  }: {
    zone: Zone;
    position: Position | null;
    locating: boolean;
    onchoose: (zone: Zone) => void;
    onlocate: () => void;
    onclose: () => void;
  } = $props();
</script>

<Dialog title="Inställningar" {onclose}>
  <ZonePicker selected={zone} onchoose={onchoose} />

  <section>
    <h3>Plats</h3>
    <p>
      {#if position}
        Sparad position: {position.lat.toFixed(2)}, {position.lon.toFixed(2)} (avrundad till ca 1 km).
      {:else}
        Ingen plats delad. Åskprognosen gäller då elområdets största stad.
      {/if}
    </p>
    <button type="button" class="action" onclick={onlocate} disabled={locating}>
      {locating ? "Hämtar plats…" : position ? "Uppdatera min plats" : "Använd min plats"}
    </button>
    <p class="note">
      En ny plats väljer elområde automatiskt. Positionen sparas bara i din webbläsare och skickas avrundad för
      åskprognosen.
    </p>
  </section>
</Dialog>

<style>
  h3 { margin: 1.25rem 0 0.25rem; font-size: 1rem; }
</style>
