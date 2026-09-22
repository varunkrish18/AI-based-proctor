import { useCallback, useEffect, useRef } from "react";
import { api, BASE_URL, getToken } from "../api/client";
import type { ClientEventItem } from "../types";

export function useEventLogger(attemptId: number | null | undefined) {
  const queueRef = useRef<ClientEventItem[]>([]);
  const isFlushingRef = useRef(false);

  const logEvent = useCallback(
    (
      eventType: string,
      durationSeconds?: number,
      metadata?: Record<string, unknown> | string
    ) => {
      const metaString =
        typeof metadata === "object"
          ? JSON.stringify(metadata)
          : metadata;

      const item: ClientEventItem = {
        eventType,
        occurredAt: new Date().toISOString(),
        durationSeconds:
          durationSeconds !== undefined ? Number(durationSeconds.toFixed(2)) : undefined,
        metadata: metaString,
      };

      queueRef.current.push(item);
    },
    []
  );

  /**
   * Helper to measure duration of an event (e.g. tab switch or fullscreen exit).
   * Returns a function to call when the event ends, which computes the duration and queues the event.
   */
  const startDurationEvent = useCallback(
    (eventType: string, metadata?: Record<string, unknown> | string) => {
      const startTime = Date.now();
      return () => {
        const durationSeconds = (Date.now() - startTime) / 1000;
        logEvent(eventType, durationSeconds, metadata);
        return durationSeconds;
      };
    },
    [logEvent]
  );

  const flushNow = useCallback(async () => {
    if (!attemptId || queueRef.current.length === 0 || isFlushingRef.current) {
      return;
    }
    isFlushingRef.current = true;
    const batch = [...queueRef.current];
    queueRef.current = [];

    try {
      await api.post(
        `/api/student/attempts/${attemptId}/proctoring/events`,
        { events: batch },
        "student"
      );
    } catch {
      // Re-queue un-sent items at the beginning if failed
      queueRef.current = [...batch, ...queueRef.current];
    } finally {
      isFlushingRef.current = false;
    }
  }, [attemptId]);

  // Periodic flush every 5 seconds
  useEffect(() => {
    if (!attemptId) return;
    const interval = setInterval(() => {
      if (queueRef.current.length > 0) {
        flushNow();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [attemptId, flushNow]);

  // Flush on page unload / tab close using fetch with keepalive: true
  useEffect(() => {
    if (!attemptId) return;

    function onBeforeUnload() {
      if (queueRef.current.length === 0) return;
      const batch = [...queueRef.current];
      queueRef.current = [];
      const token = getToken("student");
      const url = `${BASE_URL}/api/student/attempts/${attemptId}/proctoring/events`;

      try {
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ events: batch }),
          keepalive: true,
        });
      } catch {
        /* best-effort on tab close */
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Also trigger flush on component unmount
      if (queueRef.current.length > 0) {
        flushNow();
      }
    };
  }, [attemptId, flushNow]);

  return {
    logEvent,
    startDurationEvent,
    flushNow,
  };
}
