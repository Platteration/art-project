## 2023-10-25 - Math.pow vs Multiplication in Node VM
**Learning:** Benchmarking heavy math functions inside Node's `vm` module (e.g. `script.runInContext`) adds extreme overhead that skews relative comparisons. An operation that takes ~6000ms in `vm` might take ~40ms natively.
**Action:** Always test performance optimizations by requiring/reading the file in a raw Node script, or explicitly bypassing sandboxed execution if accurate measurements are required.
