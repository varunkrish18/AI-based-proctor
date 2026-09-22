package com.proctor.exam.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Validates the Bearer JWT (if present) and populates the SecurityContext with a role
 * of ROLE_ADMIN or ROLE_STUDENT. Requests with no/invalid token proceed unauthenticated;
 * endpoint-level @PreAuthorize / SecurityConfig rules decide whether that's allowed.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                     @NonNull HttpServletResponse response,
                                     @NonNull FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            try {
                if (jwtService.isTokenValid(token)) {
                    String subject = jwtService.extractSubject(token);
                    String role = jwtService.extractRole(token);
                    var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + role));
                    var authToken = new UsernamePasswordAuthenticationToken(subject, token, authorities);
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                    if ("STUDENT".equals(role)) {
                        // Scope the session to the single exam it was issued for, so a token
                        // verified against exam A can never be replayed to start/answer exam B.
                        Long examId = jwtService.extractExamId(token);
                        request.setAttribute("studentSessionExamId", examId);
                    }
                }
            } catch (Exception ignored) {
                // Invalid/expired token -> leave unauthenticated; downstream rules will 401/403.
            }
        }
        filterChain.doFilter(request, response);
    }
}
