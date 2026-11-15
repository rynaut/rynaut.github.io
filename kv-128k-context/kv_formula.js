/* KV cache memory for transformer inference.
 * bytes per token = 2 (K and V) x layers x kvHeads x headDim x bytesPerElement
 * Shared by the /kv-128k-context/ page and by the tests in this repo. MIT licence.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KVFormula = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const GiB = 1024 ** 3;
  const KiB = 1024;

  // Architecture values as used by the presets in https://rynaut.github.io/kv/ (published model configs).
  // Check your model's config.json: variants differ.
  const MODELS = {
    "llama3-8b": { name: "Llama 3.1 8B (dense, GQA)", layers: 32, kvHeads: 8, headDim: 128 },
    "qwen25-32b": { name: "Qwen2.5 32B (dense, 64 layers, 8 KV heads)", layers: 64, kvHeads: 8, headDim: 128 },
    "qwen-30b-a3b": { name: "Qwen 30B MoE (A3B, 48 layers, 4 KV heads)", layers: 48, kvHeads: 4, headDim: 128 },
    "llama3-70b": { name: "Llama 3.1 70B (dense, GQA)", layers: 80, kvHeads: 8, headDim: 128 },
  };

  function posInt(v, label) {
    if (!Number.isFinite(v) || v <= 0 || Math.floor(v) !== v) throw new RangeError(label + " must be a positive integer, got " + v);
  }

  function kvBytesPerToken(m, bytesPerElem) {
    const b = bytesPerElem === undefined ? 2 : bytesPerElem;
    if (!(b > 0)) throw new RangeError("bytesPerElem must be > 0");
    const att = m.attention || "gqa";
    if (att === "mla") {
      // Multi-head latent attention caches one compressed latent plus the rope key per layer: no factor 2.
      posInt(m.layers, "layers"); posInt(m.kvLoraRank, "kvLoraRank"); posInt(m.qkRopeHeadDim, "qkRopeHeadDim");
      return m.layers * (m.kvLoraRank + m.qkRopeHeadDim) * b;
    }
    if (att === "sliding") {
      throw new RangeError("sliding-window attention has no constant bytes per token; use kvCacheBytes");
    }
    // mha, gqa, mqa and hybrid: 2 (K and V) x cached layers x kvHeads x headDim x b.
    // Hybrid (attention + state-space) models cache KV on their attention layers only.
    const layers = att === "hybrid" ? m.attnLayers : m.layers;
    posInt(layers, att === "hybrid" ? "attnLayers" : "layers"); posInt(m.kvHeads, "kvHeads"); posInt(m.headDim, "headDim");
    return 2 * layers * m.kvHeads * m.headDim * b;
  }

  function kvCacheBytes(m, tokens, opts) {
    const o = opts || {};
    posInt(tokens, "tokens");
    const seqs = o.sequences === undefined ? 1 : o.sequences;
    posInt(seqs, "sequences");
    if (m.attention === "sliding") {
      // Global layers cache every token; local layers cache at most `window` tokens.
      const b = o.bytesPerElem === undefined ? 2 : o.bytesPerElem;
      if (!(b > 0)) throw new RangeError("bytesPerElem must be > 0");
      posInt(m.layers, "layers"); posInt(m.kvHeads, "kvHeads"); posInt(m.headDim, "headDim"); posInt(m.window, "window");
      if (!Number.isInteger(m.globalLayers) || m.globalLayers < 0 || m.globalLayers > m.layers) {
        throw new RangeError("globalLayers must be an integer between 0 and layers");
      }
      const perLayerToken = 2 * m.kvHeads * m.headDim * b;
      const localLayers = m.layers - m.globalLayers;
      return perLayerToken * (m.globalLayers * tokens + localLayers * Math.min(tokens, m.window)) * seqs;
    }
    return kvBytesPerToken(m, o.bytesPerElem) * tokens * seqs;
  }

  return { GiB, KiB, MODELS, kvBytesPerToken, kvCacheBytes };
});
