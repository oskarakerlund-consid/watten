<script lang="ts">
  import type { Position } from "../lib/settings";
  import type { Zone } from "../lib/zones";
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

  let dialog: HTMLDialogElement;

  $effect(() => {
    dialog.showModal();
  });
</script>

<dialog bind:this={dialog} onclose={onclose} aria-labelledby="settings-title">
  <h2 id="settings-title">Inställningar</h2>

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
    <button type="button" onclick={onlocate} disabled={locating}>
      {locating ? "Hämtar plats…" : position ? "Uppdatera min plats" : "Använd min plats"}
    </button>
    <p class="note">
      En ny plats väljer elområde automatiskt. Positionen sparas bara i din webbläsare och skickas avrundad för
      åskprognosen.
    </p>
  </section>

  <button type="button" class="close" onclick={() => dialog.close()}>Klar</button>
</dialog>

<style>
  dialog {
    width: min(26rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    border: none;
    border-radius: 1rem;
    padding: 1.25rem;
    color: #1f1f1f;
    background: #fff;
  }
  dialog::backdrop { background: rgb(0 0 0 / 0.5); }
  h2 { margin: 0 0 1rem; }
  h3 { margin: 1.25rem 0 0.25rem; font-size: 1rem; }
  p { margin: 0 0 0.5rem; }
  .note { font-size: 0.8rem; color: #555; margin-top: 0.5rem; }
  button { padding: 0.6rem 1rem; border-radius: 0.6rem; border: 1px solid #1f1f1f; background: #fff; cursor: pointer; }
  .close { margin-top: 1rem; width: 100%; background: #1f1f1f; color: #fff; font-weight: 600; }
</style>
