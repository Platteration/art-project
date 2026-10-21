
## 2024-05-24 - Math.pow vs Explicit Multiplication in Tight Loops
**Learning:** In JavaScript tight loops (like the millions of pixel iterations in `js/processing.js`), explicitly multiplying a value (`v * v * v...`) is significantly faster than using `Math.pow(v, n)` for constant integer exponents (like `Math.pow(v, 7)` which is up to 50x slower).
**Action:** Replace `Math.pow(v, 7)` with explicit multiplication inside performance-critical functions like `deltaE2000` which is called heavily during color block processing and evaluation.
