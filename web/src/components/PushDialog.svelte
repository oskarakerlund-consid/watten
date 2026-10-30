<script lang="ts">
  import { currentSubscription, disablePush, enablePush, pushSupported } from "../lib/push";
  import type { Position } from "../lib/settings";
  import type { Zone } from "../lib/zones";

  let { zone, position, onclose }: { zone: Zone; position: Position | null; onclose: () => void } = $props();

  type PushState = "loading" | "unsupported" | "off" | "on";

  let dialog: HTMLDialogElement;
  let pushState = $state<PushState>("loading");
  let busy = $state(false);
  let message = $state<string | null>(null);

  $effect(() => {
    dialog.showModal();
  });

  $effect(() => {
    if (!pushSupported()) {
      pushState = "unsupported";
      return;
    }
    currentSubscription().then(
      (subscription) => (pushState = subscription ? "on" : "off"),
      () => (pushState = "off"),
    );
  });

  async function toggle() {
    busy = true;
    message = null;
    const outcome = pushState === "on" ? await disablePush() : await enablePush(zone, position);
    // Show what the browser actually has: disabling turns notifications off here even if the server is unreachable.
    pushState = (await currentSubscription()) ? "on" : "off";
    busy = false;
    if (!outcome.ok) message = outcome.message;
  }
</script>

<dialog bind:this={dialog} onclose={onclose} aria-labelledby="push-title">
  <h2 id="push-title">Notiser</h2>

  {#if pushState === "loading"}
    <p>Kontrollerar…</p>
  {:else if pushState === "unsupported"}
    <p>Den här webbläsaren kan inte ta emot notiser.</p>
    <p class="note">På iPhone och iPad: välj Dela → Lägg till på hemskärmen och öppna Watten därifrån.</p>
  {:else}
    <p class="status" role="status">{pushState === "on" ? "🔔 Notiser är på." : "🔕 Notiser är av."}</p>
    <button type="button" class="toggle" onclick={toggle} disabled={busy}>
      {#if busy}Vänta…{:else if pushState === "on"}Stäng av notiser{:else}Slå på notiser{/if}
    </button>
    {#if pushState === "off"}
      <p class="note">Du får en bekräftelse direkt när notiserna slås på.</p>
    {/if}
  {/if}

  {#if message}<p class="message" role="alert">{message}</p>{/if}

  <p class="note">
    När notiser är på sparar Watten din webbläsares push-adress, ditt elområde ({zone}) och din avrundade position (om
    du har delat den). Allt raderas när du stänger av notiserna.
  </p>

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
  p { margin: 0 0 0.5rem; }
  .status { font-weight: 600; }
  .message { font-weight: 600; color: #a4262c; }
  .note { font-size: 0.8rem; color: #555; margin-top: 0.5rem; }
  button { padding: 0.6rem 1rem; border-radius: 0.6rem; border: 1px solid #1f1f1f; background: #fff; cursor: pointer; }
  .close { margin-top: 1rem; width: 100%; background: #1f1f1f; color: #fff; font-weight: 600; }
</style>
