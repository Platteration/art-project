
## 2024-10-15 - Micro-optimizations in Mathematical Kernels
**Learning:** In heavily called image-processing functions like `deltaE2000` (which is used thousands of times for color similarity metrics), replacing `Math.pow(v, 7)` with unrolled multiplications (`v * v * v...`) and hoisting out precalculated square values provides measurable performance gains in JS. Division in tight loop passes like Box Blurs (`boxH`, `boxV`) is significantly slower than multiplying by a pre-calculated inverse.
**Action:** When identifying mathematical hot paths, prefer unrolled multiplications for integer powers over `Math.pow()`, and pre-calculate inverses to replace loop divisions.
