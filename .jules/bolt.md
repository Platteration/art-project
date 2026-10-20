
## 2024-05-14 - explicit multiplication vs Math.pow
**Learning:** In tight math-heavy loops like `deltaE2000` color differencing, `Math.pow(v, n)` has substantial function call and engine overhead compared to simple explicit multiplication (`v * v * ...`) for small constant integer powers like 2 and 7.
**Action:** Always prefer explicit multiplication or caching squared terms over `Math.pow` for small constant integer exponents when optimizing pixel-processing or tight math loops.
