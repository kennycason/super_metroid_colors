# Super Metroid Colors

ROM palette patcher for Super Metroid. Runs entirely in your browser — upload a ROM, toggle color effects, preview palettes, and download a patched ROM.

Supports both Samus/beam palettes and LZ5-compressed tileset palettes for full environment color control.

<table>
  <tr>
    <td><img src="screenshots/sm_colors_main_site.png" alt="Main site UI" width="480"></td>
    <td><img src="screenshots/sm_colors_psychedelic.png" alt="Psychedelic effect" width="480"></td>
  </tr>
  <tr>
    <td><img src="screenshots/sm_colors_gameboy.png" alt="Game Boy effect" width="480"></td>
    <td><img src="screenshots/sm_colors_grayscale.png" alt="Grayscale effect" width="480"></td>
  </tr>
  <tr>
    <td><img src="screenshots/sm_colors_pink_samus.png" alt="Pink Samus" width="480"></td>
    <td><img src="screenshots/sm_colors_psychedelic02.png" alt="Psychedelic effect in Brinstar" width="480"></td>
  </tr>
  <tr>
    <td><img src="screenshots/sm_colors_map_rando_01.png" alt="Map Rando example 1" width="480"></td>
    <td><img src="screenshots/sm_colors_map_rando_02.png" alt="Map Rando example 2" width="480"></td>
  </tr>
</table>

## Setup

```bash
npm install
npm run dev
```

## Testing

```bash
npm test          # unit tests (vitest)
npx playwright test  # e2e tests
```
