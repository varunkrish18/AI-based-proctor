package com.proctor.exam.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final Map<String, Bucket> verifyBuckets = new ConcurrentHashMap<>();
    private final Map<String, Bucket> frameBuckets = new ConcurrentHashMap<>();
    private final Map<String, Bucket> exportBuckets = new ConcurrentHashMap<>();

    private Bucket createBucket(long capacity) {
        Refill refill = Refill.greedy(capacity, Duration.ofMinutes(1));
        Bandwidth limit = Bandwidth.classic(capacity, refill);
        return Bucket.builder().addLimit(limit).build();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String uri = request.getRequestURI();
        String method = request.getMethod();
        String ip = extractClientIp(request);

        // 1. Student verification: 10 req / min
        if ("POST".equalsIgnoreCase(method) && uri.contains("/verify-student")) {
            Bucket bucket = verifyBuckets.computeIfAbsent(ip, k -> createBucket(10));
            if (!bucket.tryConsume(1)) {
                sendRateLimitResponse(response);
                return;
            }
        }

        // 2. Video Frame uploads: 120 req / min (supports 1-2 fps without throttling)
        if ("POST".equalsIgnoreCase(method) && uri.contains("/proctoring/") && uri.endsWith("/frame")) {
            Bucket bucket = frameBuckets.computeIfAbsent(ip, k -> createBucket(120));
            if (!bucket.tryConsume(1)) {
                sendRateLimitResponse(response);
                return;
            }
        }

        // 3. Admin Report exports: 5 req / min
        if ("GET".equalsIgnoreCase(method) && uri.contains("/report/export")) {
            Bucket bucket = exportBuckets.computeIfAbsent(ip, k -> createBucket(5));
            if (!bucket.tryConsume(1)) {
                sendRateLimitResponse(response);
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private void sendRateLimitResponse(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("Retry-After", "60");
        response.setContentType("application/json");
        response.getWriter().write("{\"status\":429,\"message\":\"Too Many Requests. Rate limit exceeded. Please wait.\"}");
    }

    private String extractClientIp(HttpServletRequest req) {
        String forwarded = req.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return req.getRemoteAddr();
    }
}
