<script lang="ts">
  import type { Snippet } from "svelte";

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="card">
  <h2>{title}</h2>
  {@render children()}
</section>

<style>
  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
  }
  h2 {
    margin: 0 0 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.85;
  }
  .card :global(p) { margin: 0; }
  .card :global(.big) { font-size: 1.4rem; font-weight: 700; }
</style>
