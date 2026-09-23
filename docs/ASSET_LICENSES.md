# License and asset inventory

| Item | Evidence | Release treatment |
|---|---|---|
| WORLDIFACT source and new procedural geometry | Project-owned code in this repository | MIT source license; preserve notices |
| React, React DOM, React Router DOM, Three.js and production dependency tree | Installed manifests / lockfile reviewed 14 September 2026; MIT | Retain dependency license files/notices when distributing |
| TypeScript, Vite, Wrangler and other build tooling | Separate development dependencies | Keep their original licenses; do not relabel all tooling as project-owned |
| Existing favicon/social SVG | In-repository placeholders; no external embedded images found | Visual/provenance review remains open before contest media use |
| Queen legacy GLB and derivatives | Recovered from user-saved HTML, stored outside repository | Private working material; no public distribution license asserted |
| Current Queen, Julie, astronaut | Exact current originals/provenance not available in this checkout | Do not add placeholder assets under their names or claim release permission |
| Original FORGE open-frame polyhedron and LED display revision | Public [FORGE source GLB](https://forge-world-builder.terraformingplanet.chatgpt.site/world-assets/polyhedron.glb), recovered and matched to the reviewed SHA-256 `c0b756d4c92744189a4161f19bbf5b3c7629de30a1196a09f05c1ed94276749a` (9,807,116 bytes). `public/world-assets/polyhedron-led.provenance.json` records the source and retained geometry hashes. | The owner explicitly requested its display on the login screen and above the five portals. The bundled revision retains all 48 meshes, 2,976 triangles, 192 accessors and node transforms, removing only unused wood textures/material dependencies. Its static poster projects the same geometry. This establishes the requested WORLDIFACT display use, not a general third-party redistribution or MIT asset license. The original file remains unchanged outside this repository. |
| Recovered ISS 370 mm GLB/Blender/STL | Saved project files recovered 15 September; exact origin/licence not established by filenames | Private audit copies only; no public asset redistribution or production approval |
| Supplier/OpenAI/Product Hunt names and linked projects | References to third parties | No partnership, endorsement or ownership claim |

The MIT license applies to the project's source, documentation and procedural code. It does not grant rights to private imported models, reference photographs, third-party brands or linked project assets. License choice follows the owner's previously recorded MIT preference; publishing a source review branch does not grant rights to private assets.

Standard license reference: [SPDX MIT](https://spdx.org/licenses/MIT.html).

## Homepage brand banners — 23 September 2026

Owner-requested links to tools, platforms and the WORLDIFACT community use the following official brand assets. These third-party marks remain their owners' property and are excluded from the project MIT license. The section does not describe sponsorship or partnerships. Shopify and eBay link to the platforms, not to connected WORLDIFACT stores.

| Local file | Official source | Treatment |
|---|---|---|
| `public/brands/openai.svg` | [OpenAI brand](https://openai.com/brand/), [logo ZIP](https://cdn.openai.com/brand/openai-logos.zip), `OpenAI-logos/SVGs/OAI_OpenAI_Wordmark_White.svg` | White standalone wordmark; only the outer viewBox whitespace is trimmed. Original paths and colors retained. |
| `public/brands/product-hunt.png` | [Product Hunt branding](https://www.producthunt.com/branding), [logo ZIP](https://s3.producthunt.com/static/Product-Hunt-logo-all-1022.zip), `Product-Hunt-logo-all-1022/Pixels/product-hunt-logo-horizontal-orange.png` | Unmodified official horizontal orange logo; links to the existing WORLDIFACT listing. |
| `public/brands/shopify.svg` | [Shopify brand assets](https://www.shopify.com/brand-assets), [inverted primary SVG](https://cdn.shopify.com/shopifycloud/brochure/assets/brand-assets/shopify-logo-inverted-primary-logo-bdc6ddd67862d9bb1f8c559e1bb50dd233112ac57b29cac2edcf17ed2e1fe6fa.svg) | Unmodified green shopping bag and white wordmark on a neutral dark background. |
| `public/brands/ebay.svg` | [eBay brand resources](https://playbook.ebay.com/tools-and-resources), [logo ZIP](https://assets.ebay.com/m/2d5176c6399d84c2/original/eBay-Logo-Package.zip), `eBay-Logo-Package/03-eBayLogo-White/eBayLogo-White-RGB/eBayLogo-White-RGB.svg` | Official white logo; only the outer viewBox whitespace is trimmed. Original paths and colors retained. |
| `public/brands/blender-white.png` | [Blender logo](https://www.blender.org/about/logo/), [logo kit](https://download.blender.org/branding/blender_logo_kit.zip), `blender_logo_kit/blender_logo_no_socket_white.png` | Unmodified complete white logo; links to Blender. |

The FORGE MCP banner reuses the previously approved local polyhedron poster described above and the canonical Studio URL from `src/config/references.ts`. Logo assets are served locally with no new third-party scripts or tracking requests. Decorative lighting is applied to card backgrounds, not to third-party logo artwork.
