## 2024-03-24 - explicit multiplication vs Math.pow
**Learning:** Explicit multiplication is significantly faster than `Math.pow` for small constant exponents in JavaScript tight loops, particularly for operations like `deltaE2000` which run over millions of pixels.
**Action:** Replace `Math.pow` with explicit multiplication and precalculate constants when running computationally heavy code.