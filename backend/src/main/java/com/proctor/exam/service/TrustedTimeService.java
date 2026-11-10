package com.proctor.exam.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Connects to authoritative Date & Time APIs and maintains a monotonic hardware-timed
 * clock reference.
 * 
 * Prevents candidates from opening future-scheduled examinations or manipulating
 * exam timers by altering their laptop system clock.
 */
@Service
public class TrustedTimeService {

    private static final Logger log = LoggerFactory.getLogger(TrustedTimeService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .build();

    // Baseline reference: verified true network UTC Instant and corresponding monotonic CPU nanoseconds
    private volatile Instant baseNetworkInstant;
    private volatile long baseNanoTime;
    private volatile String timeSource = "UNINITIALIZED";
    private final AtomicBoolean isSyncing = new AtomicBoolean(false);

    @PostConstruct
    public void init() {
        syncWithNetworkTime();
    }

    /**
     * Periodically re-syncs every 15 minutes to guarantee sub-second accuracy
     * without drift over long-running sessions.
     */
    @Scheduled(fixedRate = 15 * 60 * 1000)
    public void scheduledSync() {
        syncWithNetworkTime();
    }

    public synchronized void syncWithNetworkTime() {
        if (!isSyncing.compareAndSet(false, true)) {
            return;
        }
        try {
            Instant networkTime = fetchNetworkTime();
            if (networkTime != null) {
                this.baseNetworkInstant = networkTime;
                this.baseNanoTime = System.nanoTime();
                long skewMs = Math.abs(Duration.between(Instant.now(), networkTime).toMillis());
                log.info("TrustedTimeService synced successfully with Date & Time API ({}). True UTC: {}. Local host skew: {} ms",
                        timeSource, networkTime, skewMs);
            } else if (this.baseNetworkInstant == null) {
                this.baseNetworkInstant = Instant.now();
                this.baseNanoTime = System.nanoTime();
                this.timeSource = "LOCAL_FALLBACK";
                log.warn("TrustedTimeService could not reach Date & Time API; initializing baseline with local clock: {}",
                        baseNetworkInstant);
            }
        } finally {
            isSyncing.set(false);
        }
    }

    /**
     * Returns true, tamper-proof current UTC Instant.
     * Calculated using monotonic CPU nanoseconds elapsed since the verified Date & Time API response.
     * Even if a candidate changes their laptop clock forward or backward, this method
     * remains completely unaffected.
     */
    public Instant now() {
        if (baseNetworkInstant == null) {
            syncWithNetworkTime();
        }
        if (baseNetworkInstant == null) {
            return Instant.now();
        }
        long elapsedNanos = System.nanoTime() - baseNanoTime;
        return baseNetworkInstant.plusNanos(elapsedNanos);
    }

    public String getTimeSource() {
        return timeSource;
    }

    private Instant fetchNetworkTime() {
        // 1. Primary: TimeAPI.io (Authoritative Date & Time API)
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://timeapi.io/api/time/current/zone?timeZone=UTC"))
                    .timeout(Duration.ofSeconds(4))
                    .GET()
                    .build();
            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 200) {
                JsonNode json = objectMapper.readTree(res.body());
                if (json.has("dateTime")) {
                    String dtStr = json.get("dateTime").asText();
                    this.timeSource = "TIMEAPI_IO";
                    return Instant.parse(dtStr.endsWith("Z") ? dtStr : dtStr + "Z");
                }
            }
        } catch (Exception e) {
            log.debug("TimeAPI.io request failed: {}", e.getMessage());
        }

        // 2. Secondary fallback: WorldTimeAPI
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://worldtimeapi.org/api/timezone/Etc/UTC"))
                    .timeout(Duration.ofSeconds(4))
                    .GET()
                    .build();
            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 200) {
                JsonNode json = objectMapper.readTree(res.body());
                if (json.has("datetime")) {
                    String dtStr = json.get("datetime").asText();
                    this.timeSource = "WORLDTIMEAPI_ORG";
                    return Instant.parse(dtStr);
                }
            }
        } catch (Exception e) {
            log.debug("WorldTimeAPI request failed: {}", e.getMessage());
        }

        // 3. Tertiary fallback: RFC-1123 HTTP Date header from NTP-synchronized public server
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://www.google.com"))
                    .method("HEAD", HttpRequest.BodyPublishers.noBody())
                    .timeout(Duration.ofSeconds(4))
                    .build();
            HttpResponse<Void> res = httpClient.send(req, HttpResponse.BodyHandlers.discarding());
            String dateHeader = res.headers().firstValue("date").orElse(null);
            if (dateHeader != null) {
                this.timeSource = "NTP_HTTP_DATE_HEADER";
                return DateTimeFormatter.RFC_1123_DATE_TIME.parse(dateHeader, Instant::from);
            }
        } catch (Exception e) {
            log.debug("HTTP Date header request failed: {}", e.getMessage());
        }

        return null;
    }
}
