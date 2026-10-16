<script lang="ts">
  import { fetchCheapest, fetchStatus, fetchThunder, type CheapestWindow, type PriceStatus, type Result, type ThunderForecast } from "./lib/api";
  import { locate } from "./lib/geolocation";
  import { loadSettings, savePosition, saveZone, type Position } from "./lib/settings";
  import { guessZone } from "./lib/zones/guessZone";
  import zoneData from "./lib/zones/zones.json";
  import { isZone, ZONE_INFO, type Zone } from "./lib/zones";
  import PriceHeadline from "./components/PriceHeadline.svelte";
  import CheapestCard from "./components/CheapestCard.svelte";
  import ThunderCard from "./components/ThunderCard.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import ZonePicker from "./components/ZonePicker.svelte";

  const INTERVAL_HOURS = 2;
  const PERIOD_HOURS = 8;
  const REFRESH_MS = 5 * 60_000;

  const initial = loadSettings(localStorage);
  let zone = $state<Zone | null>(initial.zone);
  let position = $state<Position | null>(initial.position);
  let message = $state<string | null>(null);
  let locating = $state(false);
  let settingsOpen = $state(false);

  let status = $state<Result<PriceStatus> | null>(null);
  let cheapest = $state<Result<CheapestWindow> | null>(null);
  let thunder = $state<Result<ThunderForecast> | null>(null);
  let updated = $state<Date | null>(null);

  const level = $derived(status?.ok ? status.data.level : "unknown");
  /** Where the thunder forecast is for: the user's position, or the zone's representative city. */
  const thunderPlace = $derived(position ?? (zone ? ZONE_INFO[zone] : null));

  function chooseZone(next: Zone) {
    zone = next;
    saveZone(localStorage, next);
    message = null;
  }

  async function useMyLocation() {
    locating = true;
    const result = await locate();
    locating = false;
    if (!result.ok) {
      message = result.message;
      return;
    }
    position = result.position;
    savePosition(localStorage, result.position);
    const guessed = guessZone(zoneData, result.position.lat, result.position.lon);
    if (isZone(guessed)) {
      chooseZone(guessed);
    } else {
      message = "Din plats verkar ligga utanför Sverige. Välj elområde manuellt.";
    }
  }

  async function refresh() {
    if (!zone) return;
    const [s, c, t] = await Promise.all([
      fetchStatus(zone),
      fetchCheapest(zone, INTERVAL_HOURS, PERIOD_HOURS),
      thunderPlace ? fetchThunder(thunderPlace.lat, thunderPlace.lon, PERIOD_HOURS) : Promise.resolve(null),
    ]);
    status = s;
    cheapest = c;
    thunder = t;
    updated = new Date();
  }

  // Reload whenever the zone or position changes, every few minutes, and when the tab becomes visible again.
  $effect(() => {
    void zone;
    void thunderPlace;
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
</script>

<main class="page" data-level={level}>
  <header>
    <span class="zone">
      {#if zone}{zone} · {ZONE_INFO[zone].name}{:else}Watten{/if}
    </span>
    {#if zone}
      <button type="button" class="settings-button" onclick={() => (settingsOpen = true)} aria-label="Inställningar">⚙︎</button>
    {/if}
  </header>

  {#if !zone}
    <section class="onboarding">
      <h1>Är elen billig just nu?</h1>
      <p>Dela din plats så väljs ditt elområde automatiskt, eller välj det själv.</p>
      <button type="button" class="primary" onclick={useMyLocation} disabled={locating}>
        {locating ? "Hämtar plats…" : "Använd min plats"}
      </button>
      <ZonePicker selected={null} onchoose={chooseZone} />
    </section>
  {:else}
    <PriceHeadline {status} />
    <div class="cards">
      <CheapestCard {cheapest} intervalHours={INTERVAL_HOURS} periodHours={PERIOD_HOURS} />
      <ThunderCard {thunder} hours={PERIOD_HOURS} usingPosition={position !== null} city={ZONE_INFO[zone].city} />
    </div>
  {/if}

  {#if message}
    <p class="message" role="status">{message}</p>
  {/if}

  <footer>
    <span>
      Priser: <a href="https://www.elprisetjustnu.se">Elpriset just nu</a> (exkl. moms) · Väder:
      <a href="https://www.met.no/en">MET Norway</a> (CC BY 4.0)
    </span>
    {#if updated}<span>Uppdaterad {updated.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span>{/if}
  </footer>
</main>

{#if settingsOpen && zone}
  <SettingsDialog
    {zone}
    {position}
    {locating}
    onchoose={chooseZone}
    onlocate={useMyLocation}
    onclose={() => (settingsOpen = false)}
  />
{/if}

<style>
  .page {
    --bg: var(--unknown-bg);
    --fg: var(--unknown-fg);
    height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: clamp(0.5rem, 2dvh, 1rem);
    padding: max(1rem, env(safe-area-inset-top)) 1rem max(0.75rem, env(safe-area-inset-bottom));
    background: var(--bg);
    color: var(--fg);
    overflow: hidden;
    transition: background-color 0.3s;
  }
  .page[data-level="cheap"] { --bg: var(--cheap-bg); --fg: var(--cheap-fg); }
  .page[data-level="normal"] { --bg: var(--normal-bg); --fg: var(--normal-fg); }
  .page[data-level="expensive"] { --bg: var(--expensive-bg); --fg: var(--expensive-fg); }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
  }
  .settings-button {
    background: none;
    border: 1px solid currentColor;
    color: inherit;
    border-radius: 999px;
    width: 2.5rem;
    height: 2.5rem;
    font-size: 1.25rem;
    cursor: pointer;
  }
  .onboarding {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1rem;
    max-width: 28rem;
  }
  .onboarding h1 { margin: 0; font-size: clamp(1.5rem, 6vw, 2.25rem); }
  .onboarding p { margin: 0; }
  .primary {
    padding: 0.8rem 1.2rem;
    border: none;
    border-radius: 0.6rem;
    background: #1f1f1f;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }
  .message { margin: 0; font-weight: 600; }
  footer {
    margin-top: auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    font-size: 0.75rem;
    opacity: 0.85;
  }
  footer a { color: inherit; }
</style>
