# Repository Guidelines

## Project Structure & Module Organization
- Static app in root: `index.html`, `styles.css`, `app.js`.
- Add assets to `assets/` if needed; keep images optimized.
- Keep UI text in Bangla; keep components small and cohesive.

## Build, Test, and Development Commands
- Open `index.html` directly in a browser for quick checks.
- Prefer a local server for CORS safety: `python -m http.server -d . 8080`.
- No test runner is configured; validate interactions manually in-browser.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; max line length ~100.
- JavaScript: `camelCase` for variables/functions, `PascalCase` for classes.
- DOM ids/classes in `kebab-case`. Keep pure helpers in `app.js`.
- Avoid heavy frameworks; vanilla JS, semantic HTML, and CSS variables.

## Testing Guidelines
- Manually verify: virtual keyboard input, backspace/space, settings persistence, and image generation (uses placeholder without API key).
- If adding tests, use a lightweight DOM runner (e.g., Vitest + jsdom) and mirror behaviors above.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`.
- One focused change per PR with clear description, steps to verify, and screenshots/GIFs for UI changes.
- Include notes about accessibility (labels, contrast) when editing UI.

## Security & Configuration Tips
- Never commit secrets. Enter the Gemini API key via Settings; it stores in `localStorage` only.
- For production, route API calls through a backend proxy to protect keys.

## Agent-Specific Instructions
- Keep labels and hints in Bangla; maintain kid-friendly visuals and large tap targets.
- When extending the keyboard, mirror layout groups and keep keys accessible.
- Keep diffs minimal and scoped; update this guide if conventions change.
