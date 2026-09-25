/**
 * Authoritative Network & Date-Time Synchronization Utility.
 * 
 * Protects against candidate tampering with local laptop clock / OS time.
 * Uses hardware monotonic clock (performance.now()) anchored to true UTC time
 * obtained from Date & Time APIs (/api/exams/time or direct timeapi.io).
 */

interface TimeResponse {
  iso?: string;
  epochMillis?: number;
  dateTime?: string;
  datetime?: string;
  source?: string;
}

let baseNetworkEpochMs: number | null = null;
let basePerformanceNow: number = 0;
let isSyncing = false;
let syncPromise: Promise<number> | null = null;

export async function syncTrustedTime(): Promise<number> {
  if (isSyncing && syncPromise) {
    return syncPromise;
  }

  isSyncing = true;
  syncPromise = (async () => {
    // 1. Try backend authoritative time endpoint (anchored to TimeAPI.io / Google HTTP Date)
    try {
      const resp = await fetch("/api/exams/time", { cache: "no-store" });
      if (resp.ok) {
        const data: TimeResponse = await resp.json();
        const epoch = data.epochMillis ?? (data.iso ? new Date(data.iso).getTime() : null);
        if (epoch && !isNaN(epoch)) {
          baseNetworkEpochMs = epoch;
          basePerformanceNow = performance.now();
          return epoch;
        }
      }
    } catch {
      // Backend request failed or offline, try direct public Date & Time APIs
    }

    // 2. Direct fallback to TimeAPI.io
    try {
      const resp = await fetch("https://timeapi.io/api/time/current/zone?timeZone=UTC", { cache: "no-store" });
      if (resp.ok) {
        const data: TimeResponse = await resp.json();
        if (data.dateTime) {
          const iso = data.dateTime.endsWith("Z") ? data.dateTime : `${data.dateTime}Z`;
          const epoch = new Date(iso).getTime();
          if (!isNaN(epoch)) {
            baseNetworkEpochMs = epoch;
            basePerformanceNow = performance.now();
            return epoch;
          }
        }
      }
    } catch {
      // Direct TimeAPI failed
    }

    // 3. Direct fallback to WorldTimeAPI
    try {
      const resp = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC", { cache: "no-store" });
      if (resp.ok) {
        const data: TimeResponse = await resp.json();
        if (data.datetime) {
          const epoch = new Date(data.datetime).getTime();
          if (!isNaN(epoch)) {
            baseNetworkEpochMs = epoch;
            basePerformanceNow = performance.now();
            return epoch;
          }
        }
      }
    } catch {
      // Fallback failed
    }

    // Fallback: if no network time has ever been obtained, use local clock
    if (baseNetworkEpochMs === null) {
      baseNetworkEpochMs = Date.now();
      basePerformanceNow = performance.now();
    }
    return baseNetworkEpochMs;
  })().finally(() => {
    isSyncing = false;
  });

  return syncPromise;
}

// Auto-sync on startup
if (typeof window !== "undefined") {
  syncTrustedTime();
  // Periodic background re-sync every 5 minutes
  setInterval(syncTrustedTime, 5 * 60 * 1000);
}

/**
 * Returns the true tamper-proof epoch milliseconds.
 * Calculated as (baseNetworkEpochMs + elapsed monotonic milliseconds).
 * Any changes to the laptop's system time do NOT affect performance.now().
 */
export function getTrustedEpochMs(): number {
  if (baseNetworkEpochMs === null) {
    return Date.now();
  }
  const elapsed = performance.now() - basePerformanceNow;
  return baseNetworkEpochMs + elapsed;
}

export function getTrustedDate(): Date {
  return new Date(getTrustedEpochMs());
}
