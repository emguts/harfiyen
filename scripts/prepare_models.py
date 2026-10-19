"""Download seda-v0.1 from Hugging Face and convert it for the browser.

Outputs go to public/models/seda-v0.1/:

  encoder.webgpu.onnx  int8 weights, but MatMulInteger -> DequantizeLinear + MatMul
                       so that every op runs on onnxruntime-web's WebGPU EP
  decoder.onnx         unchanged (runs on wasm)
  joiner.int8.onnx     unchanged (runs on wasm)
  rnnlm.int8.onnx      unchanged (runs on wasm)
  lodr.bin             2gram.fst re-encoded in a flat little-endian format
  tokens.txt           unchanged
  model.json           model hyper-parameters read from the ONNX metadata,
                       plus file sizes for download progress

the punctuation / true-casing model to public/models/punct/:

  punct.int8.onnx      1-800-BAD-CODE/punct_cap_seg_47_language, dynamic int8
  spm.json             its SentencePiece unigram vocabulary (pieces + scores)
  punct.json           labels and windowing parameters

Duyu-small to public/models/duyu-small/:

  encoder_pre / encoder_pass / encoder_post / decoder .onnx   int8 graphs, unchanged (wasm)
  fbank.bin            the feature window (400) and mel filters (257 x 80), float32
  tokens.json          SentencePiece pieces by id (decoding only)
  model.json           special tokens, refinement gates and pass embeddings, file sizes

Whisper large-v3 turbo to public/models/whisper-large-v3-turbo/, and the three text-to-speech models for
dubbing: EMA Lightning to public/models/ema-lightning/, Antalia Mini to public/models/antalia-mini/ and Ahenk Cep
to public/models/ahenk-cep/,
and the Turkish -> English translation model to public/models/opus-mt-tc-big-tr-en/.

Usage:  python scripts/prepare_models.py [--src DIR]
"""

import argparse
import collections
import hashlib
import json
import os
import shutil
import struct
import urllib.request
from pathlib import Path

import numpy as np
import onnx
from onnx import helper

REPO = "atasoglu/seda-v0.1"
FILES = [
    "encoder.int8.onnx",
    "decoder.onnx",
    "joiner.int8.onnx",
    "tokens.txt",
    "lm/rnnlm.int8.onnx",
    "lm/2gram.fst",
]

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "models" / "seda-v0.1"


def download(dst: Path) -> None:
    for f in FILES:
        p = dst / f
        if p.exists():
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://huggingface.co/{REPO}/resolve/main/{f}"
        print("download", url)
        urllib.request.urlretrieve(url, p)


def convert_matmul_integer(src: Path, dst: Path) -> None:
    """Rewrite ORT dynamic quantization into weight-only DequantizeLinear.

    Pattern produced by onnxruntime.quantization.quantize_dynamic:
        a_q, a_s, a_zp = DynamicQuantizeLinear(a)
        y_i = MatMulInteger(a_q, w_q, a_zp, w_zp)
        y_f = Cast(y_i)
        s   = Mul(a_s, w_s)
        y   = Mul(y_f, s)
    becomes
        w   = DequantizeLinear(w_q, w_s, w_zp)
        y   = MatMul(a, w)
    """
    m = onnx.load(str(src))
    g = m.graph
    prod = {o: n for n in g.node for o in n.output}
    cons = collections.defaultdict(list)
    for n in g.node:
        for i in n.input:
            cons[i].append(n)
    inits = {i.name for i in g.initializer}

    removed = set()
    replacement = {}  # id(MatMulInteger node) -> [new nodes]
    dq_done = {}

    for n in g.node:
        if n.op_type != "MatMulInteger":
            continue
        a_q, w_q, _a_zp, w_zp = n.input
        assert w_q in inits and w_zp in inits
        dql = prod[a_q]
        assert dql.op_type == "DynamicQuantizeLinear"
        (cast,) = cons[n.output[0]]
        assert cast.op_type == "Cast"
        (mul,) = cons[cast.output[0]]
        assert mul.op_type == "Mul"
        scale_name = [i for i in mul.input if i != cast.output[0]][0]
        scale_mul = prod[scale_name]
        assert scale_mul.op_type == "Mul"
        a_s = dql.output[1]
        w_s = [i for i in scale_mul.input if i != a_s][0]
        assert w_s in inits

        new_nodes = []
        if w_q not in dq_done:
            w_f = w_q + "_dequantized"
            new_nodes.append(
                helper.make_node(
                    "DequantizeLinear", [w_q, w_s, w_zp], [w_f], name=w_q + "_DQ"
                )
            )
            dq_done[w_q] = w_f
        new_nodes.append(
            helper.make_node(
                "MatMul",
                [dql.input[0], dq_done[w_q]],
                [mul.output[0]],
                name=n.name + "_MatMul",
            )
        )
        replacement[id(n)] = new_nodes
        removed.update({id(cast), id(mul), id(scale_mul)})

    # Drop DynamicQuantizeLinear nodes whose outputs are no longer used.
    kept_inputs = set()
    for n in g.node:
        if id(n) in removed or n.op_type == "MatMulInteger":
            continue
        kept_inputs.update(n.input)
    for nodes in replacement.values():
        for n in nodes:
            kept_inputs.update(n.input)
    for n in g.node:
        if n.op_type == "DynamicQuantizeLinear" and not any(
            o in kept_inputs for o in n.output
        ):
            removed.add(id(n))

    new_list = []
    for n in g.node:
        if id(n) in replacement:
            new_list.extend(replacement[id(n)])
        elif id(n) not in removed:
            new_list.append(n)
    del g.node[:]
    g.node.extend(new_list)

    # The rewritten graph no longer carries quantized activations.
    for p in m.metadata_props:
        if p.key == "onnx.infer":
            p.value = "seda-webgpu"
    onnx.checker.check_model(m)
    onnx.save(m, str(dst))
    print(f"{dst.name}: {len(replacement)} MatMulInteger rewritten")


def simplify_static(path: Path) -> None:
    """Fix the batch size to 1 and constant-fold the shape arithmetic.

    The streaming encoder has ~1000 Shape/Gather/Concat nodes computing sizes
    that are constant once the batch is fixed. On WebGPU every one of them is
    a dispatch (or a GPU->CPU sync), so folding them roughly halves the run
    time. The int8 weights are temporarily turned into graph inputs so the
    folding cannot expand them to float32.
    """
    os.environ.setdefault("ONNXSIM_FIXED_POINT_ITERS", "500")
    import onnxsim

    m = onnx.load(str(path))
    g = m.graph
    for v in list(g.input) + list(g.output):
        for d in v.type.tensor_type.shape.dim:
            if d.dim_param == "N":
                d.Clear()
                d.dim_value = 1

    dq_weights = {n.input[0] for n in g.node if n.op_type == "DequantizeLinear"}
    held = [i for i in g.initializer if i.name in dq_weights]
    for init in held:
        g.initializer.remove(init)
        g.input.append(helper.make_tensor_value_info(init.name, init.data_type, list(init.dims)))

    before = len(g.node)
    meta = list(m.metadata_props)
    m, ok = onnxsim.simplify(m, skip_shape_inference=False)
    assert ok, "onnxsim check failed"

    g = m.graph
    names = {i.name for i in held}
    keep = [i for i in g.input if i.name not in names]
    del g.input[:]
    g.input.extend(keep)
    g.initializer.extend(held)
    del m.metadata_props[:]
    m.metadata_props.extend(meta)
    onnx.checker.check_model(m)
    onnx.save(m, str(path))
    print(f"{path.name}: {before} -> {len(g.node)} nodes after static simplification")


def externalize_pad_mask(path: Path) -> None:
    """Replace the int64 `processed_lens` bookkeeping with an int32 input.

    The encoder derives a left-context padding mask from processed_lens:
        mask = concat(reverse(processed_lens <= arange(128)), zeros(32))
    Those int64 ops are placed on the CPU by onnxruntime-web, which forces a
    GPU<->CPU round trip per chunk and rules out WebGPU graph capture. The app
    computes the same [1, 160] int32 mask itself (see StreamingEncoder) and
    tracks processed_lens in JavaScript.
    """
    m = onnx.load(str(path))
    g = m.graph
    byname = {n.name: n for n in g.node}
    concat = byname["/Concat_4"]
    mask_name = concat.output[0]
    for n in g.node:
        for i, x in enumerate(n.input):
            if x == mask_name:
                n.input[i] = "pad_mask"
    drop = {"/Unsqueeze_9", "/Add_2", "/LessOrEqual", "/Cast", "/Slice_2", "/Concat_4"}
    assert drop <= set(byname), "unexpected encoder graph layout"
    keep = [n for n in g.node if n.name not in drop]
    del g.node[:]
    g.node.extend(keep)

    inputs = [i for i in g.input if i.name != "processed_lens"]
    inputs.append(helper.make_tensor_value_info("pad_mask", onnx.TensorProto.INT32, [1, 160]))
    del g.input[:]
    g.input.extend(inputs)
    outputs = [o for o in g.output if o.name != "new_processed_lens"]
    del g.output[:]
    g.output.extend(outputs)

    used = {x for n in g.node for x in n.input}
    unused = [i for i in g.initializer if i.name not in used]
    for i in unused:
        g.initializer.remove(i)
    onnx.checker.check_model(m)
    onnx.save(m, str(path))
    print(f"{path.name}: processed_lens replaced by pad_mask input")


def convert_fst(src: Path, dst: Path) -> None:
    """Parse an OpenFst 'vector' StdArc binary and write a flat CSR layout.

    lodr.bin (little endian):
        magic 'LODR', u32 version=1
        i32 start, i32 num_states, i32 num_arcs, i32 backoff_id
        f32 final[num_states]            (+inf when not final)
        i32 arc_offset[num_states + 1]
        i32 ilabel[num_arcs]
        i32 nextstate[num_arcs]
        f32 weight[num_arcs]
    Arcs of each state are sorted by ilabel (needed for binary search).
    """
    b = src.read_bytes()
    pos = 0

    def rd(fmt):
        nonlocal pos
        v = struct.unpack_from("<" + fmt, b, pos)
        pos += struct.calcsize("<" + fmt)
        return v if len(v) > 1 else v[0]

    def rd_str():
        nonlocal pos
        n = rd("i")
        s = b[pos : pos + n].decode()
        pos += n
        return s

    magic = rd("I")
    assert magic == 2125659606, "not an OpenFst binary"
    fst_type, arc_type = rd_str(), rd_str()
    assert fst_type == "vector" and arc_type == "standard", (fst_type, arc_type)
    _version, flags = rd("i"), rd("i")
    _props = rd("Q")
    # num_arcs in the header is not filled in by VectorFst::Write.
    start, num_states, _ = rd("q"), rd("q"), rd("q")
    assert flags & 0x3 == 0, "symbol tables not supported"

    final = np.empty(num_states, np.float32)
    offsets = np.zeros(num_states + 1, np.int32)
    ilabels, nexts, weights = [], [], []
    arc_dtype = np.dtype([("i", "<i4"), ("o", "<i4"), ("w", "<f4"), ("n", "<i4")])
    backoff_id = -1
    unsorted = 0
    for s in range(num_states):
        final[s] = rd("f")
        n = rd("q")
        arcs = np.frombuffer(b, arc_dtype, n, pos)
        pos += n * arc_dtype.itemsize
        if backoff_id < 0:
            eps = arcs[arcs["o"] == 0]
            if len(eps):
                backoff_id = int(eps[0]["i"])
        if n > 1 and np.any(np.diff(arcs["i"]) < 0):
            unsorted += 1
        arcs = np.sort(arcs, order="i", kind="stable")
        ilabels.append(arcs["i"].copy())
        nexts.append(arcs["n"].copy())
        weights.append(arcs["w"].copy())
        offsets[s + 1] = offsets[s] + n
    num_arcs = int(offsets[-1])
    assert pos == len(b), "trailing bytes in fst"
    assert backoff_id >= 0, "no backoff arc found"

    with open(dst, "wb") as f:
        f.write(b"LODR")
        f.write(struct.pack("<Iiiii", 1, start, num_states, num_arcs, backoff_id))
        f.write(final.astype("<f4").tobytes())
        f.write(offsets.astype("<i4").tobytes())
        f.write(np.concatenate(ilabels).astype("<i4").tobytes())
        f.write(np.concatenate(nexts).astype("<i4").tobytes())
        f.write(np.concatenate(weights).astype("<f4").tobytes())
    print(
        f"{dst.name}: {num_states} states, {num_arcs} arcs, "
        f"backoff={backoff_id}, unsorted states={unsorted}"
    )


def meta(path: Path) -> dict:
    return {p.key: p.value for p in onnx.load(str(path), load_external_data=False).metadata_props}


def write_config(src: Path) -> None:
    enc = meta(src / "encoder.int8.onnx")
    dec = meta(src / "decoder.onnx")
    lm = meta(src / "lm/rnnlm.int8.onnx")
    tokens = (src / "tokens.txt").read_text().split("\n")
    unk = next(int(t.split()[1]) for t in tokens if t.startswith("<unk> "))
    files = {
        f: (OUT / f).stat().st_size
        for f in [
            "encoder.webgpu.onnx",
            "decoder.onnx",
            "joiner.int8.onnx",
            "tokens.txt",
            "rnnlm.int8.onnx",
            "lodr.bin",
        ]
    }
    cfg = {
        "name": "seda-v0.1",
        "sampleRate": 16000,
        "featureDim": 80,
        "chunkSize": int(enc["T"]),
        "chunkShift": int(enc["decode_chunk_len"]),
        "subsampling": 4,
        "frameShiftMs": 10,
        "contextSize": int(dec["context_size"]),
        "vocabSize": int(dec["vocab_size"]),
        "blankId": 0,
        "unkId": unk,
        # Recurrent encoder states; the model outputs them as "new_" + name.
        "encoderStates": [
            i.name
            for i in onnx.load(str(OUT / "encoder.webgpu.onnx"), load_external_data=False).graph.input
            if i.name not in ("x", "pad_mask")
        ],
        "leftContext": 128,
        "padMaskLen": 160,
        # processed_lens grows by this many (encoder_embed) frames per chunk.
        "processedPerChunk": 32,
        "lm": {
            "sosId": int(lm["sos_id"]),
            "numLayers": int(lm["num_layers"]),
            "hiddenSize": int(lm["hidden_size"]),
            "scale": 0.6,
            "lodrScale": -0.5,
        },
        "files": files,
    }
    (OUT / "model.json").write_text(json.dumps(cfg, indent=2))
    print("model.json:", json.dumps({k: v for k, v in cfg.items() if k not in ("files", "encoderStates")}))


PUNCT_REPO = "1-800-BAD-CODE/punct_cap_seg_47_language"
PUNCT_OUT = ROOT / "public" / "models" / "punct"


def spm_vocab(path: Path, normalizer: str) -> dict:
    """A SentencePiece unigram model as src/punct/spm.ts reads it."""
    from sentencepiece import sentencepiece_model_pb2 as pb

    m = pb.ModelProto()
    m.ParseFromString(path.read_bytes())
    assert m.trainer_spec.model_type == 1, "expected a unigram model"
    assert m.normalizer_spec.name == normalizer, m.normalizer_spec.name
    assert not m.trainer_spec.byte_fallback
    types = sorted({p.type for p in m.pieces})
    assert set(types) <= {1, 2, 3}, f"unsupported piece types {types}"
    return {
        "pieces": [p.piece for p in m.pieces],
        "scores": [round(p.score, 5) for p in m.pieces],
        # 1 normal, 2 unknown, 3 control
        "types": [p.type for p in m.pieces],
        "unkId": next(i for i, p in enumerate(m.pieces) if p.type == 2),
        "bosId": m.trainer_spec.bos_id,
        "eosId": m.trainer_spec.eos_id,
        "padId": m.trainer_spec.pad_id,
    }


def prepare_punct(cache: Path) -> None:
    """Punctuation, true-casing and sentence boundaries (47 languages, incl. Turkish)."""
    import yaml
    from onnxruntime.quantization import QuantType, quantize_dynamic

    files = ["punct_cap_seg_47lang.onnx", "spe_unigram_64k_lowercase_47lang.model", "config.yaml"]
    for f in files:
        p = cache / f
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            url = f"https://huggingface.co/{PUNCT_REPO}/resolve/main/{f}"
            print("download", url)
            urllib.request.urlretrieve(url, p)
    PUNCT_OUT.mkdir(parents=True, exist_ok=True)

    out = PUNCT_OUT / "punct.int8.onnx"
    # Weights (MatMul) and the 64k x 512 embedding table (Gather) to int8,
    # per channel: 233 -> 59 MB with the same output as fp32 on our Turkish
    # test sentences (per-tensor scales changed one sentence boundary).
    quantize_dynamic(
        str(cache / files[0]),
        str(out),
        weight_type=QuantType.QInt8,
        op_types_to_quantize=["MatMul", "Gather"],
        per_channel=True,
    )

    spm = spm_vocab(cache / files[1], "identity")
    (PUNCT_OUT / "spm.json").write_text(json.dumps(spm, ensure_ascii=False, separators=(",", ":")))

    cfg = yaml.safe_load((cache / files[2]).read_text())
    punct = {
        "maxLength": cfg["max_length"],
        "overlap": 16,
        "preLabels": cfg["pre_labels"],
        "postLabels": cfg["post_labels"],
        "nullToken": cfg.get("null_token", "<NULL>"),
        "files": {f: (PUNCT_OUT / f).stat().st_size for f in ["punct.int8.onnx", "spm.json"]},
    }
    (PUNCT_OUT / "punct.json").write_text(json.dumps(punct, ensure_ascii=False, indent=2))
    print(f"punct: {out.stat().st_size / 1e6:.1f} MB model, {len(spm['pieces'])} pieces")


WHISPER_REPO = "onnx-community/whisper-large-v3-turbo_timestamped"
WHISPER_OUT = ROOT / "public" / "models" / "whisper-large-v3-turbo"
# Two choices in the app: fp16 encoder with q4f16 decoder ("Whisper Turbo"),
# and q4f16 for both ("Whisper Turbo Hafif"); they share the decoder. The *_timestamped export also
# returns cross-attention, which word timestamps need.
WHISPER_FILES = [
    "encoder_model_fp16.onnx",
    "decoder_model_merged_q4f16.onnx",
    "encoder_model_q4f16.onnx",
]
# Silero VAD v5 (MIT): Whisper invents text over silence.
VAD_URL = "https://github.com/snakers4/silero-vad/raw/v5.1.2/src/silero_vad/data/silero_vad.onnx"


def prepare_whisper() -> None:
    """Whisper large-v3 turbo for the high-accuracy option. Used as published."""
    WHISPER_OUT.mkdir(parents=True, exist_ok=True)
    for f in [*(f"onnx/{f}" for f in WHISPER_FILES), "vocab.json", "added_tokens.json", "config.json", "generation_config.json"]:
        p = WHISPER_OUT / Path(f).name
        if not p.exists():
            url = f"https://huggingface.co/{WHISPER_REPO}/resolve/main/{f}"
            print("download", url)
            urllib.request.urlretrieve(url, str(p) + ".part")
            os.replace(str(p) + ".part", p)
    vad = WHISPER_OUT / "silero_vad.onnx"
    if not vad.exists():
        print("download", VAD_URL)
        urllib.request.urlretrieve(VAD_URL, vad)

    cfg = json.loads((WHISPER_OUT / "config.json").read_text())
    gen = json.loads((WHISPER_OUT / "generation_config.json").read_text())
    added = json.loads((WHISPER_OUT / "added_tokens.json").read_text())
    whisper = {
        "name": "whisper-large-v3-turbo",
        "numMel": cfg["num_mel_bins"],
        "decoderLayers": cfg["decoder_layers"],
        "heads": cfg["decoder_attention_heads"],
        "headDim": cfg["d_model"] // cfg["decoder_attention_heads"],
        "maxTargetPositions": cfg["max_target_positions"],
        "tokens": {
            "sot": added["<|startoftranscript|>"],
            "eot": added["<|endoftext|>"],
            "language": gen["lang_to_id"]["<|tr|>"],
            "transcribe": gen["task_to_id"]["transcribe"],
            "noTimestamps": gen["no_timestamps_token_id"],
            "noSpeech": added["<|nospeech|>"],
            "timestampBegin": added["<|0.00|>"],
        },
        "suppress": gen["suppress_tokens"],
        "beginSuppress": gen["begin_suppress_tokens"],
        "alignmentHeads": gen["alignment_heads"],
        "medianFilterWidth": cfg["median_filter_width"],
        "maxInitialTimestampIndex": gen["max_initial_timestamp_index"],
        "files": {f: (WHISPER_OUT / f).stat().st_size for f in [*WHISPER_FILES, "vocab.json", "silero_vad.onnx"]},
    }
    (WHISPER_OUT / "model.json").write_text(json.dumps(whisper, indent=2))
    print(f"whisper: {sum(whisper['files'].values()) / 1e6:.0f} MB")


MT_REPO = "Helsinki-NLP/opus-mt-tc-big-tr-en"
MT_OUT = ROOT / "public" / "models" / "opus-mt-tc-big-tr-en"
MT_FILES = ["encoder.int8.onnx", "decoder.int8.onnx", "spm.json"]


def prepare_mt(cache: Path) -> None:
    """Turkish -> English translation (Marian, CC-BY-4.0), exported here: the published ONNX conversions
    (Xenova/, onnx-community/) of this model put out repeated junk ("connectconnect...") at every precision."""
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from optimum.exporters.onnx import main_export

    if not (cache / "decoder_model_merged.onnx").exists():
        print("export", MT_REPO)
        main_export(MT_REPO, output=cache, task="text2text-generation-with-past")
    MT_OUT.mkdir(parents=True, exist_ok=True)
    # MatMul weights and the embedding tables to int8, per tensor (per channel was no better on our Turkish
    # sentences). EnableSubgraph reaches into the merged decoder's two branches (first step, with past):
    # without it the decoder stays at 875 MB.
    for src, dst in [("encoder_model.onnx", "encoder.int8.onnx"), ("decoder_model_merged.onnx", "decoder.int8.onnx")]:
        quantize_dynamic(
            str(cache / src),
            str(MT_OUT / dst),
            weight_type=QuantType.QInt8,
            op_types_to_quantize=["MatMul", "Gather"],
            extra_options={"EnableSubgraph": True},
        )

    # Text is cut into pieces with the source SentencePiece model, then each piece is looked up in the shared
    # vocabulary (encoder and decoder ids alike); pieces missing from it become <unk>, as in MarianTokenizer.
    spm = spm_vocab(cache / "source.spm", "nmt_nfkc")
    vocab = json.loads((cache / "vocab.json").read_text())
    ids = sorted(vocab.values())
    assert ids == list(range(len(ids))), "vocabulary ids are not 0..n-1"
    spm["vocab"] = [p for p, _ in sorted(vocab.items(), key=lambda kv: kv[1])]
    (MT_OUT / "spm.json").write_text(json.dumps(spm, ensure_ascii=False, separators=(",", ":")))

    cfg = json.loads((cache / "config.json").read_text())
    mt = {
        "name": "opus-mt-tc-big-tr-en",
        "decoderLayers": cfg["decoder_layers"],
        "heads": cfg["decoder_attention_heads"],
        "headDim": cfg["d_model"] // cfg["decoder_attention_heads"],
        "maxLength": cfg["max_position_embeddings"],
        "decoderStart": cfg["decoder_start_token_id"],
        "eos": cfg["eos_token_id"],
        "pad": cfg["pad_token_id"],
        "unk": vocab["<unk>"],
        "files": {f: (MT_OUT / f).stat().st_size for f in MT_FILES},
    }
    (MT_OUT / "model.json").write_text(json.dumps(mt, indent=2))
    print(f"translation: {sum(mt['files'].values()) / 1e6:.0f} MB")


EMA_URL = "https://ema-lightning-web.vercel.app/models"
EMA_OUT = ROOT / "public" / "models" / "ema-lightning"
# ONNX conversions of canberkkkkkk/ema-lightning (Apache-2.0) and normalizer-tr compiled to wasm, as served by
# ema-lightning-web. All fp32: on WebGPU the fp16 text graph and decoder go wrong.
# Not pinned: these come from the live ema-lightning-web demo, so a change to its models/ changes what a fresh
# download gets. The app itself loads the copies on R2, never this address.
EMA_FILES = ["text.onnx", "sound.onnx", "decoder.onnx", "normalizer.wasm"]


def prepare_ema() -> None:
    """EMA Lightning, the Turkish text-to-speech model for dubbing."""
    EMA_OUT.mkdir(parents=True, exist_ok=True)
    for f in [*EMA_FILES, "meta.json"]:
        p = EMA_OUT / f
        if not p.exists():
            print("download", f"{EMA_URL}/{f}")
            urllib.request.urlretrieve(f"{EMA_URL}/{f}", str(p) + ".part")
            os.replace(str(p) + ".part", p)
    ema = json.loads((EMA_OUT / "meta.json").read_text())
    ema["name"] = "ema-lightning"
    ema["files"] = {f: (EMA_OUT / f).stat().st_size for f in EMA_FILES}
    (EMA_OUT / "model.json").write_text(json.dumps(ema, ensure_ascii=False, indent=2))
    print(f"ema: {sum(ema['files'].values()) / 1e6:.0f} MB")


MINI_URL = (
    "https://huggingface.co/spaces/cloud0day3/antalia-mini/resolve/2c24b406fedada11bd731a2ec9f4535bfd354f03"
)
MINI_OUT = ROOT / "public" / "models" / "antalia-mini"
# Antalia-2 Mini (cloud0day3/antalia-mini, Apache-2.0) from its Space, pinned to the commit
# src/tts/antalia-mini/*.js were copied from. "mixed" precision, the release's default: fp32 acoustic
# graphs, the vocoder from the fp16 weights.
MINI_FILES = {
    "text.onnx": "models/text.onnx",
    "cond.onnx": "models/cond.onnx",
    "flow.onnx": "models/flow.onnx",
    "vocoder.fp16.onnx": "models/vocoder.fp16.onnx",
    "frontend-data.json.gz": "assets/frontend-data.json.gz",
}


def prepare_mini() -> None:
    """Antalia Mini, the second dubbing voice."""
    MINI_OUT.mkdir(parents=True, exist_ok=True)
    for f, src in [*MINI_FILES.items(), ("manifest.json", "models/manifest.json")]:
        p = MINI_OUT / f
        if not p.exists():
            print("download", f"{MINI_URL}/{src}")
            urllib.request.urlretrieve(f"{MINI_URL}/{src}", str(p) + ".part")
            os.replace(str(p) + ".part", p)
    mini = json.loads((MINI_OUT / "manifest.json").read_text())
    mini["name"] = "antalia-mini"
    # The manifest lists every precision's graphs; the app wants the sizes of the files it downloads.
    mini["files"] = {f: (MINI_OUT / f).stat().st_size for f in MINI_FILES}
    (MINI_OUT / "model.json").write_text(json.dumps(mini, ensure_ascii=False, indent=2))
    print(f"antalia mini: {sum(mini['files'].values()) / 1e6:.0f} MB")

AHENK_URL = (
    "https://huggingface.co/ozgurguler/ahenk-cep-tr/resolve/345c4cbb934815fa96ffd0d5061fd913237544bc/onnx"
)
AHENK_OUT = ROOT / "public" / "models" / "ahenk-cep"
# Ahenk Cep (ozgurguler/ahenk-cep-tr, CC BY 4.0), pinned. The fp16 graphs, as the model's web demo loads them.
AHENK_GRAPHS = ["text", "cond", "step", "decoder"]


def prepare_ahenk() -> None:
    """Ahenk Cep, the third dubbing voice."""
    AHENK_OUT.mkdir(parents=True, exist_ok=True)
    src = AHENK_OUT / "ahenk-cep.json"
    if not src.exists():
        print("download", f"{AHENK_URL}/ahenk-cep.json")
        urllib.request.urlretrieve(f"{AHENK_URL}/ahenk-cep.json", str(src) + ".part")
        os.replace(str(src) + ".part", src)
    ahenk = json.loads(src.read_text())
    graphs = [ahenk["files"][g]["f16"] for g in AHENK_GRAPHS]
    for g in graphs:
        p = AHENK_OUT / g["file"]
        if not p.exists():
            print("download", f"{AHENK_URL}/{g['file']}")
            urllib.request.urlretrieve(f"{AHENK_URL}/{g['file']}", str(p) + ".part")
            os.replace(str(p) + ".part", p)
        if hashlib.sha256(p.read_bytes()).hexdigest() != g["sha256"]:
            p.unlink()
            raise SystemExit(f"{p.name}: checksum mismatch, deleted; run again")
    # The manifest lists every precision's graphs with their checksums; the app wants the sizes of the files it downloads.
    ahenk["files"] = {g["file"]: (AHENK_OUT / g["file"]).stat().st_size for g in graphs}
    (AHENK_OUT / "model.json").write_text(json.dumps(ahenk, ensure_ascii=False, indent=2))
    print(f"ahenk cep: {sum(ahenk['files'].values()) / 1e6:.0f} MB")

DUYU_REPO = "KaanAydinli/Duyu-small"
DUYU_OUT = ROOT / "public" / "models" / "duyu-small"
DUYU_GRAPHS = ["encoder_pre.onnx", "encoder_pass.onnx", "encoder_post.onnx", "decoder.onnx"]


def prepare_duyu(cache: Path) -> None:
    """Duyu-small, the int8 graphs as published (they run on wasm)."""
    import sentencepiece as spm

    for f in [*(f"int8/{g}" for g in DUYU_GRAPHS), "engine.json", "fbank.npz", "passes.npz", "spm.model"]:
        p = cache / f
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            url = f"https://huggingface.co/{DUYU_REPO}/resolve/main/{f}"
            print("download", url)
            urllib.request.urlretrieve(url, str(p) + ".part")
            os.replace(str(p) + ".part", p)
    DUYU_OUT.mkdir(parents=True, exist_ok=True)
    for g in DUYU_GRAPHS:
        shutil.copy(cache / "int8" / g, DUYU_OUT / g)

    fb = np.load(cache / "fbank.npz")
    assert fb["window"].shape == (400,) and fb["mel"].shape == (257, 80)
    np.concatenate([fb["window"].ravel(), fb["mel"].ravel()]).astype("<f4").tofile(DUYU_OUT / "fbank.bin")
    sp = spm.SentencePieceProcessor(model_file=str(cache / "spm.model"))
    pieces = [sp.id_to_piece(i) for i in range(sp.get_piece_size())]
    (DUYU_OUT / "tokens.json").write_text(json.dumps(pieces, ensure_ascii=False, separators=(",", ":")))

    meta = json.loads((cache / "engine.json").read_text())
    passes = np.load(cache / "passes.npz")
    files = [*DUYU_GRAPHS, "fbank.bin", "tokens.json"]
    duyu = {
        "name": "Duyu-small",
        "pad": meta["pad"],
        "bos": meta["bos"],
        "eos": meta["eos"],
        "lang": meta["lang"],
        "style": meta["style"],
        "maxPositions": meta["max_positions"],
        "vocabSize": meta["vocab_size"],
        "dModel": meta["d_model"],
        "frameHz": meta["frame_hz"],
        "gates": [round(float(g), 8) for g in passes["gates"]],
        "passEmbed": [[round(float(v), 8) for v in row] for row in passes["pass_embed"]],
        "files": {f: (DUYU_OUT / f).stat().st_size for f in files},
    }
    (DUYU_OUT / "model.json").write_text(json.dumps(duyu, indent=1))
    print(f"duyu: {sum(duyu['files'].values()) / 1e6:.0f} MB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=ROOT / ".cache" / "seda-v0.1")
    ap.add_argument("--whisper-only", action="store_true", help="only (re)build the Whisper files")
    ap.add_argument("--tts-only", action="store_true", help="only download the dubbing voices")
    ap.add_argument("--mt-only", action="store_true", help="only (re)build the translation model")
    ap.add_argument("--ahenk-only", action="store_true", help="only download Ahenk Cep")
    ap.add_argument("--duyu-only", action="store_true", help="only (re)build Duyu-small")
    args = ap.parse_args()
    mt_cache = args.src.parent / "opus-mt-tc-big-tr-en"
    duyu_cache = args.src.parent / "duyu-small"
    if args.whisper_only:
        prepare_whisper()
        return
    if args.tts_only:
        prepare_ema()
        prepare_mini()
        prepare_ahenk()
        return
    if args.mt_only:
        prepare_mt(mt_cache)
        return
    if args.ahenk_only:
        prepare_ahenk()
        return
    if args.duyu_only:
        prepare_duyu(duyu_cache)
        return
    args.src.mkdir(parents=True, exist_ok=True)
    download(args.src)
    OUT.mkdir(parents=True, exist_ok=True)

    convert_matmul_integer(args.src / "encoder.int8.onnx", OUT / "encoder.webgpu.onnx")
    simplify_static(OUT / "encoder.webgpu.onnx")
    externalize_pad_mask(OUT / "encoder.webgpu.onnx")
    for f in ["decoder.onnx", "joiner.int8.onnx", "tokens.txt"]:
        shutil.copy(args.src / f, OUT / f)
    shutil.copy(args.src / "lm/rnnlm.int8.onnx", OUT / "rnnlm.int8.onnx")
    convert_fst(args.src / "lm/2gram.fst", OUT / "lodr.bin")
    write_config(args.src)
    prepare_punct(args.src.parent / "punct_cap_seg_47_language")
    prepare_whisper()
    prepare_duyu(duyu_cache)
    prepare_ema()
    prepare_mini()
    prepare_ahenk()
    prepare_mt(mt_cache)


if __name__ == "__main__":
    main()
