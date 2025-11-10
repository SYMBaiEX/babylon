# Example P&L Share Cards

This directory contains example P&L share cards generated for review.

## Files

- **portfolio-1.png**: Profitable portfolio example
- **portfolio-2.png**: Loss portfolio example
- **perps-1.png**: Profitable perps example
- **perps-2.png**: Loss perps example
- **predictions-1.png**: Profitable predictions example
- **predictions-2.png**: Loss predictions example
- **pools-1.png**: Profitable pools example
- **pools-2.png**: Loss pools example

## Generation Instructions

To generate these cards:

1. Navigate to the markets page: http://localhost:3000/markets
2. Click on each tab (Dashboard, Perps, Predictions, Pools)
3. If you have positions, click the "Share" button on the P&L card
4. In the modal, click "Download P&L Card"
5. The card will be saved as a PNG image

## Card Specifications

- **Dimensions**: 1200x630 pixels
- **Format**: PNG with 2x pixel ratio
- **Optimized for**: Twitter/X, Farcaster, other social media
- **Brand Colors**: #0066FF (Babylon Blue), category-specific gradients

## Features

- User profile image and username
- Timestamp
- Large P&L display with color coding (green for profit, red for loss)
- Category-specific metrics
- Babylon logo branding
- Professional gradient background
- "Trade the narrative. Share the upside." tagline

## Testing

To test the sharing functionality:

1. Start the development server: `npm run dev`
2. Navigate to: http://localhost:3000/markets
3. Make some test trades or deposits
4. Click "Share" on any P&L card
5. Try all share options:
   - Share to X (Twitter)
   - Share to Farcaster
   - Download card
   - Copy link

## Notes

- The share cards use the actual Babylon logo SVG
- Colors match the brand guidelines (#0066FF primary)
- Cards are generated client-side using html-to-image library
- No API keys required for basic sharing (uses intent URLs)
