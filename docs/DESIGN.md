# N2K Glass Design Rules

Netfreak2k OS is visually inspired by modern premium desktop interfaces but must retain its own identity.

## Desired characteristics

- compact translucent top bar
- floating dock
- rounded window geometry
- soft shadows and depth
- calm light/dark palettes
- restrained blur and animation
- consistent Netfreak2k branding

## Public asset policy

Only assets whose licenses permit redistribution may be shipped.

Do not include:

- Apple logos
- Apple wallpapers
- San Francisco / proprietary Apple fonts
- extracted macOS icons
- copied proprietary themes
- proprietary artwork from another operating system

Prefer:

- open/free icon themes
- open fonts
- original Netfreak2k artwork
- original or freely licensed wallpapers

Every third-party visual asset added later should have its license/source documented before release.

## Performance profiles

### Performance / Pi 3

- minimize live blur
- short/simple animations
- low-cost shadows
- avoid continuously animated widgets
- no heavy background compositing unless measured acceptable

### Enhanced

For Pi 4/5 and x86_64, richer translucency and animation may be enabled while preserving the same layout and design language.
