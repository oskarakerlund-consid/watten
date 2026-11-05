<script lang="ts">
  import type { Snippet } from "svelte";

  /** A modal dialog with a title and a close button. It opens when it is shown; `onclose` runs when it closes. */
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();

  const titleId = $props.id();
  let dialog: HTMLDialogElement;

  $effect(() => {
    dialog.showModal();
  });
</script>

<dialog bind:this={dialog} {onclose} aria-labelledby={titleId}>
  <h2 id={titleId}>{title}</h2>
  {@render children()}
  <button type="button" class="action close" onclick={() => dialog.close()}>Klar</button>
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
  /* Shared by the dialogs' content. Buttons opt in with `class="action"`, so other components keep their own style. */
  dialog :global(p) { margin: 0 0 0.5rem; }
  dialog :global(.note) { font-size: 0.8rem; color: #555; margin-top: 0.5rem; }
  dialog :global(.action) { padding: 0.6rem 1rem; border-radius: 0.6rem; border: 1px solid #1f1f1f; background: #fff; color: #1f1f1f; cursor: pointer; }
  .close { margin-top: 1rem; width: 100%; background: #1f1f1f; color: #fff; font-weight: 600; }
</style>
