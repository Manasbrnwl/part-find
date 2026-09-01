import sharp from "sharp";
import { PARTFIND_LOGO_DATA_URI } from "./notification/logoAsset";

const esc = (s: string) =>
    (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Trim over-long text so it never overflows the fixed-width certificate. */
const clip = (s: string, max: number) =>
    s && s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s || "";

/**
 * Generates an SVG string for the certificate. A clean, modern design with an
 * ivory ground, gold frame, the official Part Find logo up top, and the
 * recipient details centered. Rating stars only show for rated (completion)
 * certificates; attendance certificates render as "Certificate of Participation".
 */
export function generateCertificateSvg(
    userName: string,
    postTitle: string,
    rating: number | null,
    recruiterName: string,
    issuedAt: Date
): string {
    const dateStr = issuedAt.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    const isRated = rating != null && rating > 0;
    const stars = isRated ? "★".repeat(rating as number) + "☆".repeat(5 - (rating as number)) : "";
    const certTitle = isRated ? "Certificate of Completion" : "Certificate of Participation";
    const roleLine = isRated ? "has successfully completed the role for" : "attended the event";
    const attribution = isRated
        ? `as rated by <tspan font-weight="bold">${esc(clip(recruiterName, 42))}</tspan>`
        : `presented by <tspan font-weight="bold">${esc(clip(recruiterName, 42))}</tspan>`;

    const safeUserName = esc(clip(userName, 40));
    const safePostTitle = esc(clip(postTitle, 54));

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="560" viewBox="0 0 800 560">
  <defs>
    <linearGradient id="divider" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#c8a94e" stop-opacity="0"/>
      <stop offset="50%" stop-color="#c8a94e" stop-opacity="1"/>
      <stop offset="100%" stop-color="#c8a94e" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Ground -->
  <rect width="800" height="560" fill="#fbf8f1"/>
  <rect x="18" y="18" width="764" height="524" fill="#ffffff"/>

  <!-- Gold frame -->
  <rect x="18" y="18" width="764" height="524" fill="none" stroke="#c8a94e" stroke-width="2"/>
  <rect x="27" y="27" width="746" height="506" fill="none" stroke="#e6d6a0" stroke-width="1"/>

  <!-- Corner flourishes -->
  <path d="M40 40 h34 M40 40 v34" stroke="#c8a94e" stroke-width="2.5" fill="none"/>
  <path d="M760 40 h-34 M760 40 v34" stroke="#c8a94e" stroke-width="2.5" fill="none"/>
  <path d="M40 520 h34 M40 520 v-34" stroke="#c8a94e" stroke-width="2.5" fill="none"/>
  <path d="M760 520 h-34 M760 520 v-34" stroke="#c8a94e" stroke-width="2.5" fill="none"/>

  <!-- Official Part Find logo (wordmark) -->
  <image xlink:href="${PARTFIND_LOGO_DATA_URI}" x="314" y="48" width="172" height="60" preserveAspectRatio="xMidYMid meet"/>

  <!-- Subtitle -->
  <text x="400" y="134" text-anchor="middle" font-family="Georgia, serif" font-size="11" letter-spacing="3" fill="#b8ac93">OFFICIAL RECOGNITION</text>

  <!-- Title -->
  <text x="400" y="182" text-anchor="middle" font-family="Georgia, serif" font-size="32" font-weight="bold" letter-spacing="1" fill="#2a2417">${certTitle}</text>
  <rect x="330" y="198" width="140" height="2" fill="url(#divider)"/>

  <!-- Certify -->
  <text x="400" y="234" text-anchor="middle" font-family="Georgia, serif" font-size="15" font-style="italic" fill="#7a7261">This is to certify that</text>

  <!-- Recipient -->
  <text x="400" y="280" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="bold" fill="#1c3a2b">${safeUserName}</text>
  <line x1="250" y1="294" x2="550" y2="294" stroke="#d9c583" stroke-width="1"/>

  <!-- Role + post -->
  <text x="400" y="328" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#544d3d">${roleLine}</text>
  <text x="400" y="356" text-anchor="middle" font-family="Georgia, serif" font-size="19" font-weight="bold" fill="#2a2417">${safePostTitle}</text>

  ${isRated ? `<text x="400" y="396" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#c8a94e" letter-spacing="4">${stars}</text>` : ``}

  <!-- Attribution -->
  <text x="400" y="${isRated ? 426 : 402}" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#544d3d">${attribution}</text>

  <!-- Footer -->
  <text x="170" y="498" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#4a4535">${dateStr}</text>
  <line x1="92" y1="508" x2="248" y2="508" stroke="#d9c583" stroke-width="1"/>
  <text x="170" y="524" text-anchor="middle" font-family="Georgia, serif" font-size="10" letter-spacing="2" fill="#a89e86">DATE OF ISSUE</text>

  <circle cx="400" cy="500" r="26" fill="none" stroke="#c8a94e" stroke-width="2.5"/>
  <text x="400" y="509" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#c8a94e">✦</text>

  <text x="630" y="498" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#4a4535">Part Find</text>
  <line x1="552" y1="508" x2="708" y2="508" stroke="#d9c583" stroke-width="1"/>
  <text x="630" y="524" text-anchor="middle" font-family="Georgia, serif" font-size="10" letter-spacing="2" fill="#a89e86">AUTHORIZED BY</text>
</svg>`;
}

/**
 * Renders the certificate SVG to a high-quality PNG buffer (1600×1120, 2×).
 */
export async function renderCertificateImage(
    userName: string,
    postTitle: string,
    rating: number | null,
    recruiterName: string,
    issuedAt: Date
): Promise<Buffer> {
    const svg = generateCertificateSvg(userName, postTitle, rating, recruiterName, issuedAt);
    const svgBuffer = Buffer.from(svg);

    const pngBuffer = await sharp(svgBuffer, { density: 300 })
        .resize(1600, 1120)
        .png({ quality: 100 })
        .toBuffer();

    return pngBuffer;
}
