<script lang="ts">
  import { ZONE_INFO, ZONES, type Zone } from "../lib/zones";

  let { selected, onchoose }: { selected: Zone | null; onchoose: (zone: Zone) => void } = $props();
</script>

<fieldset>
  <legend>Elområde</legend>
  <div class="options">
    {#each ZONES as zone (zone)}
      <button type="button" aria-pressed={selected === zone} onclick={() => onchoose(zone)}>
        <strong>{zone}</strong>
        <span>{ZONE_INFO[zone].name}</span>
      </button>
    {/each}
  </div>
</fieldset>

<style>
  fieldset { border: none; margin: 0; padding: 0; }
  legend { font-weight: 600; margin-bottom: 0.5rem; padding: 0; }
  .options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.6rem 0.75rem;
    border-radius: 0.6rem;
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  button[aria-pressed="true"] { background: #1f1f1f; color: #fff; border-color: #1f1f1f; }
  span { font-size: 0.8rem; }
</style>
