/**
 * Comprehensive device detector to prevent exam taking on mobile phones & tablets,
 * including when students enable "Desktop site" / "Desktop mode" in their mobile browser.
 */

export interface DeviceCheckResult {
  isMobile: boolean;
  reason?: string;
  details: {
    userAgent: string;
    maxTouchPoints: number;
    hasTouchEvents: boolean;
    coarsePointer: boolean;
    noHover: boolean;
    screenWidth: number;
    screenHeight: number;
    viewportWidth: number;
    viewportHeight: number;
  };
}

function getWebGLRenderer(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "";
    const debugInfo = (gl as any).getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return "";
    return String((gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();
  } catch {
    return "";
  }
}

export function checkIsMobileDevice(): DeviceCheckResult {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      isMobile: false,
      details: {
        userAgent: "",
        maxTouchPoints: 0,
        hasTouchEvents: false,
        coarsePointer: false,
        noHover: false,
        screenWidth: 1920,
        screenHeight: 1080,
        viewportWidth: 1920,
        viewportHeight: 1080,
      },
    };
  }

  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || "").toLowerCase();
  const platform = ((navigator as any).platform || "").toLowerCase();
  const maxTouchPoints = navigator.maxTouchPoints || (navigator as any).msMaxTouchPoints || 0;
  const hasTouchEvents = "ontouchstart" in window || maxTouchPoints > 0;
  
  const coarsePointer = Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const anyCoarsePointer = Boolean(window.matchMedia && window.matchMedia("(any-pointer: coarse)").matches);
  const noHover = Boolean(window.matchMedia && window.matchMedia("(hover: none)").matches);

  const screenWidth = window.screen?.width || window.innerWidth || 1024;
  const screenHeight = window.screen?.height || window.innerHeight || 768;
  const availWidth = window.screen?.availWidth || screenWidth;
  const availHeight = window.screen?.availHeight || screenHeight;
  const minScreenDimension = Math.min(screenWidth, screenHeight);
  const webglRenderer = getWebGLRenderer();

  const details = {
    userAgent: ua,
    maxTouchPoints,
    hasTouchEvents,
    coarsePointer: coarsePointer || anyCoarsePointer,
    noHover,
    screenWidth,
    screenHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };

  // 1. Direct mobile / tablet User Agent match
  const mobileUaRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet|silk|kindle/i;
  if (mobileUaRegex.test(ua)) {
    return {
      isMobile: true,
      reason: "Mobile or tablet browser detected via user agent signature.",
      details,
    };
  }

  // 2. Client Hints API (Chrome / Edge on Android reports mobile: true or Android / iOS platform)
  const uaData = (navigator as any).userAgentData;
  if (uaData) {
    if (uaData.mobile === true) {
      return {
        isMobile: true,
        reason: "Mobile device detected via client platform hints.",
        details,
      };
    }
    const chPlatform = (uaData.platform || "").toLowerCase();
    if (chPlatform.includes("android") || chPlatform.includes("ios") || chPlatform.includes("ipados")) {
      return {
        isMobile: true,
        reason: "Mobile operating system detected via client platform.",
        details,
      };
    }
  }

  // 3. WebGL Mobile GPU Detection (Even in 'Desktop Site' mode, mobile GPUs are exposed)
  // Adreno (Qualcomm), Mali (ARM), PowerVR (Imagination), Immortalis, Apple GPU on mobile
  const isMobileGpu =
    webglRenderer.includes("adreno") ||
    webglRenderer.includes("mali") ||
    webglRenderer.includes("powervr") ||
    webglRenderer.includes("immortalis") ||
    webglRenderer.includes("bifrost") ||
    (webglRenderer.includes("apple") && maxTouchPoints > 1);

  if (isMobileGpu) {
    return {
      isMobile: true,
      reason: `Mobile graphics processor detected (${webglRenderer || "mobile GPU"}). Desktop mode emulation is prohibited.`,
      details,
    };
  }

  // 4. Platform Architecture (Android in desktop mode reports 'Linux armv8l' / 'Linux aarch64')
  if (platform.includes("arm") || platform.includes("aarch64") || platform.includes("android") || platform.includes("iphone") || platform.includes("ipad")) {
    return {
      isMobile: true,
      reason: `Mobile ARM architecture detected (${platform}). Physical desktop PC or laptop required.`,
      details,
    };
  }

  // 5. Apple iPad / iPhone in "Request Desktop Website" mode
  // Safari on iOS desktop mode reports "Macintosh" / "MacIntel", but has maxTouchPoints > 1 (Mac computers have NO touchscreens)
  const isAppleDesktopSpoof = (/macintosh|mac os x/i.test(ua) || platform === "macintel") && maxTouchPoints > 1;
  if (isAppleDesktopSpoof) {
    return {
      isMobile: true,
      reason: "iPad or iPhone detected running in desktop website mode.",
      details,
    };
  }

  // 6. Android in "Desktop site" mode:
  // Android sets viewport to 980px, but physical touch screen has multi-touch (5+ touch points)
  if (maxTouchPoints >= 5 && (hasTouchEvents || anyCoarsePointer)) {
    return {
      isMobile: true,
      reason: "Multi-touch smartphone/tablet capacitive screen detected (Desktop site active).",
      details,
    };
  }

  // 7. Portrait phone aspect ratio with touch (Phones are 19:9 / 20:9: screen height is much larger than width)
  const isTallPortraitPhone = availHeight / availWidth >= 1.6 && hasTouchEvents;
  if (isTallPortraitPhone) {
    return {
      isMobile: true,
      reason: "Smartphone portrait physical display ratio detected.",
      details,
    };
  }

  // 8. Mobile orientation properties with touch
  if (hasTouchEvents && (window.orientation !== undefined || "orientation" in screen) && (coarsePointer || anyCoarsePointer)) {
    return {
      isMobile: true,
      reason: "Mobile hardware orientation sensor and touch display detected.",
      details,
    };
  }

  // 9. Coarse pointer with no mouse hover (touch screen phone)
  if (hasTouchEvents && (coarsePointer || anyCoarsePointer) && noHover) {
    return {
      isMobile: true,
      reason: "Touchscreen mobile device detected with coarse pointer and no physical mouse.",
      details,
    };
  }

  // 10. Small physical screen with touch enabled (< 800px min dimension)
  if (hasTouchEvents && minScreenDimension < 800) {
    return {
      isMobile: true,
      reason: "Physical smartphone display dimensions detected with touch interface.",
      details,
    };
  }

  return {
    isMobile: false,
    details,
  };
}
