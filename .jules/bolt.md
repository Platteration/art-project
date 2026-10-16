## 2024-05-24 - Inline RGB to Lab conversion for 2x speedup in tight loop
**Learning:** In highly iterated functions (e.g. `prepare()` processing millions of pixels), function call overhead and array allocation inside the loop (`return [116 * fy - 16, ...]`) become significant bottlenecks. Inlining color conversion formulas inside tight loops gives massive performance gains in plain JavaScript.
**Action:** When a math-heavy utility function is called per-pixel in a hot path, inline it manually to avoid array allocation overhead and function call overhead.
