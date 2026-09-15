# Fix ISS in WORLDIFACT

Copied from the owner's existing Fix ISS site, source commit `293007c888dabef4274fcff3fa810b5ed71eb455`. This is the existing astronaut, station interior, equipment, eight repairs, save/load and mobile controls, with a Terra observation computer added in the first module. It is not a newly invented replacement game.

Original: https://fix-iss-repair-game.terraformingplanet.chatgpt.site/

The computer pauses the simulation and renderer while showing the separately copied Terra application. Closing it preserves station progress. Use Save before leaving the whole ISS portal; cross-portal persistence is still the original manual JSON save/load.

The outer ISS map is the historical NASA VTAD model: https://science.nasa.gov/resource/international-space-station-3d-model/ . The original application's historical-configuration and educational-simulation notices remain in its Help dialog. NASA attribution is not endorsement and game completion is not operational certification.

The interior, astronaut, equipment and training scenario are the owner's FORGE work. Vendor Three.js 0.180.0 is distributed with its original MIT license in `vendor/LICENSE`. All 14 vendor/model files are copied byte-for-byte from the existing public site and verified by the pinned SHA-256 manifest in `config/foundation-assets.json`; no new model or paid asset was generated.
