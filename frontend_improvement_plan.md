# Frontend Improvement Plan — smelo.cz

## High Impact — Easy Wins

1. ~~**CSS Custom Properties** — Define `#ffb300`, `#222`, `#4ade80`, `#f87171` etc. in a shared `:root` block instead of repeating in every page's inline `<style>`.~~ DONE

2. ~~**Scroll reveal animations** — Add subtle `fade-in-up` on sections as they scroll into view (pure CSS `@keyframes` + `IntersectionObserver`).~~ DONE

3. ~~**Shadows instead of flat borders** — Replace some `border: 1px solid #333` with `box-shadow` (e.g., `0 4px 24px rgba(0,0,0,0.4)`) for depth.~~ DONE

4. ~~**Unify `max-width`** — Some pages use `640px`, others `700px`. Unify to `700px`.~~ DONE

## Medium Impact — Visual Polish

5. ~~**Body font upgrade** — Replace `Segoe UI / Arial` fallback with a Google Font (DM Sans) to pair with Staatliches.~~ DONE

6. **Gradient accents** — Subtle gold → amber gradients on key elements (card borders on hover, formula left-borders, headings).

7. ~~**Card hover effects** — Add `translateY(-2px)` and `box-shadow` on hover for more interactive feel.~~ DONE

8. ~~**Better input styling** — Subtle inner glow on focus (`box-shadow: 0 0 0 3px rgba(255,179,0,0.15)`) instead of just border color change.~~ DONE

9. ~~**Image optimization** — Add `loading="lazy"` to images.~~ DONE (lazy loading added; WebP conversion is a separate build step)

## Lower Priority — Nice to Have

10. **Testimonial carousel** — Add swipe support and slide direction.

11. **Collapsible sections** — Smooth `max-height` transition instead of instant toggle.

12. **Page transitions** — CSS `opacity` fade-in on `body` load.

13. **Range grid tooltips** — Show hand details on hover.
