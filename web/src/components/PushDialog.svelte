<script lang="ts">
  import { currentSubscription, disablePush, enablePush, pushSupported } from "../lib/push";
  import type { Position } from "../lib/settings";
  import type { Zone } from "../lib/zones";
  import Dialog from "./Dialog.svelte";

  let { zone, position, onclose }: { zone: Zone; position: Position | null; onclose: () => void } = $props();

  type PushState = "loading" | "unsupported" | "off" | "on";

  let pushState = $state<PushState>("loading");
  let busy = $state(false);
  let message = $state<string | null>(null);

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
    try {
      const outcome = pushState === "on" ? await disablePush() : await enablePush(zone, position);
      if (!outcome.ok) message = outcome.message;
    } catch (error) {
      console.error("Could not change notifications", error);
      message = "Något gick fel med notiserna. Försök igen.";
    } finally {
      // Show what the browser actually has: disabling turns notifications off here even if the server is unreachable.
      pushState = (await currentSubscription().catch(() => null)) ? "on" : "off";
      busy = false;
    }
  }
</script>

<Dialog title="Notiser" {onclose}>
  {#if pushState === "loading"}
    <p>Kontrollerar…</p>
  {:else if pushState === "unsupported"}
    <p>Den här webbläsaren kan inte ta emot notiser.</p>
    <p class="note">På iPhone och iPad: välj Dela → Lägg till på hemskärmen och öppna Watten därifrån.</p>
  {:else}
    <p class="status" role="status">{pushState === "on" ? "🔔 Notiser är på." : "🔕 Notiser är av."}</p>
    <button type="button" class="action" onclick={toggle} disabled={busy}>
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
</Dialog>

<style>
  .status { font-weight: 600; }
  .message { font-weight: 600; color: #a4262c; }
</style>
