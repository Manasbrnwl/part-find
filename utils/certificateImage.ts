import sharp from "sharp";

/**
 * Generates an SVG string representing the certificate of completion.
 * Mirrors the design from generateCertificateHtml but in pure SVG
 * so it can be rendered without a browser/Chromium.
 */
export function generateCertificateSvg(
    userName: string,
    postTitle: string,
    rating: number,
    recruiterName: string,
    issuedAt: Date
): string {
    const dateStr = issuedAt.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

    // Escape XML-unsafe characters
    const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const safeUserName = esc(userName);
    const safePostTitle = esc(postTitle);
    const safeRecruiterName = esc(recruiterName);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
  <defs>
    <linearGradient id="divider" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="transparent"/>
      <stop offset="50%" stop-color="#b59a4a"/>
      <stop offset="100%" stop-color="transparent"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="800" height="560" fill="#fffdf6"/>

  <!-- Double border -->
  <rect x="4" y="4" width="792" height="552" rx="2" fill="none" stroke="#b59a4a" stroke-width="2"/>
  <rect x="12" y="12" width="776" height="536" rx="2" fill="none" stroke="#b59a4a" stroke-width="2"/>

  <!-- Corner accents -->
  <path d="M24 24 L72 24" stroke="#c9a84c" stroke-width="3" fill="none"/>
  <path d="M24 24 L24 72" stroke="#c9a84c" stroke-width="3" fill="none"/>
  <path d="M728 24 L776 24" stroke="#c9a84c" stroke-width="3" fill="none"/>
  <path d="M776 24 L776 72" stroke="#c9a84c" stroke-width="3" fill="none"/>
  <path d="M24 536 L72 536" stroke="#c9a84c" stroke-width="3" fill="none"/>
  <path d="M24 488 L24 536" stroke="#c9a84c" stroke-width="3" fill="none"/>
  <path d="M728 536 L776 536" stroke="#c9a84c" stroke-width="3" fill="none"/>
  <path d="M776 488 L776 536" stroke="#c9a84c" stroke-width="3" fill="none"/>

  <!-- Brand -->
  <text x="400" y="72" text-anchor="middle" font-family="Georgia, serif" font-size="13" font-weight="bold" letter-spacing="4" fill="#b59a4a">PART FIND</text>

  <!-- Title -->
  <text x="400" y="118" text-anchor="middle" font-family="Georgia, serif" font-size="36" font-weight="bold" fill="#2d2200" letter-spacing="2">Certificate of Completion</text>

  <!-- Subtitle -->
  <text x="400" y="144" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#888" letter-spacing="3">OFFICIAL RECOGNITION</text>

  <!-- Divider -->
  <rect x="340" y="164" width="120" height="2" fill="url(#divider)"/>

  <!-- Certify text -->
  <text x="400" y="200" text-anchor="middle" font-family="Georgia, serif" font-size="16" font-style="italic" fill="#555">This is to certify that</text>

  <!-- Recipient name -->
  <text x="400" y="248" text-anchor="middle" font-family="Georgia, serif" font-size="32" font-weight="bold" fill="#1a3a2a">${safeUserName}</text>
  <line x1="280" y1="256" x2="520" y2="256" stroke="#c9a84c" stroke-width="1"/>

  <!-- Role text -->
  <text x="400" y="296" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#444">has successfully completed the role for</text>

  <!-- Post title -->
  <text x="400" y="328" text-anchor="middle" font-family="Georgia, serif" font-size="18" font-weight="bold" fill="#444">${safePostTitle}</text>

  <!-- Rating stars -->
  <text x="400" y="368" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#b59a4a">${stars}</text>

  <!-- Rated by -->
  <text x="400" y="400" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#444">as rated by <tspan font-weight="bold">${safeRecruiterName}</tspan></text>

  <!-- Footer: Date -->
  <text x="160" y="480" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#666">${dateStr}</text>
  <line x1="80" y1="490" x2="240" y2="490" stroke="#c9a84c" stroke-width="1"/>
  <text x="160" y="508" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="#aaa" letter-spacing="2">DATE OF ISSUE</text>

  <!-- Footer: Seal -->
  <circle cx="400" cy="484" r="30" fill="none" stroke="#b59a4a" stroke-width="3"/>
  <text x="400" y="492" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#b59a4a">✦</text>

  <!-- Footer: Authorized -->
  <text x="640" y="480" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#666">Part Find</text>
  <line x1="560" y1="490" x2="720" y2="490" stroke="#c9a84c" stroke-width="1"/>
  <text x="640" y="508" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="#aaa" letter-spacing="2">AUTHORIZED BY</text>
</svg>`;
}

/**
 * Renders the certificate SVG to a PNG buffer using sharp.
 * Returns a high-quality 1600×1120 PNG (2× for retina clarity).
 */
export async function renderCertificateImage(
    userName: string,
    postTitle: string,
    rating: number,
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
