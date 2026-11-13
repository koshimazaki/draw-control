const vn = (e) => String(e ?? "").replace(/[|\r\n]+/g, " ").trim() || "-", Ct = (e) => e === null ? "-" : `$${e.toFixed(4)}`;
function Ia(e) {
  return `| ${[
    e.date,
    e.model,
    e.modelRan ?? "unknown",
    e.taskUUID,
    e.duration,
    e.resolution,
    e.inputs,
    Ct(e.estimateUsd),
    Ct(e.costUsd),
    e.seconds === null ? "-" : e.seconds.toFixed(1),
    e.output,
    e.status
  ].map(vn).join(" | ")} |
`;
}
const Ea = (e) => String(e.resolution ?? `${e.width ?? ""}x${e.height ?? ""}`);
function xn(e, t, a, n, i) {
  const { inputs: s, taskUUID: o, positivePrompt: r, ...d } = n?.task ?? t.task;
  return {
    id: e,
    label: t.modelName,
    provider: t.provider,
    model: t.modelId,
    modelName: t.modelName,
    modelRan: n?.modelRan ?? null,
    prompt: a.prompt,
    inputsSent: t.inputsSent,
    firstFrameVariant: t.firstFrameVariant,
    output: i ? { src: i, contentType: "video/mp4", remoteUrl: n?.videoURL } : null,
    costUsd: n?.costUsd ?? null,
    generationSeconds: n ? Math.round(n.generationSeconds * 10) / 10 : null,
    ...a.duration !== void 0 ? { durationSeconds: a.duration } : {},
    ...n ? { taskUUID: n.taskUUID } : {},
    ...a.routing ? { routing: { maxPrice: a.routing.maxPrice, requirements: a.routing.requirements } } : {},
    settings: d,
    status: n ? "ready" : "pending"
  };
}
const $n = "https://api.runware.ai/v1";
class ne extends Error {
  constructor(t, a) {
    super(
      a.length ? a.map((n) => `${n.code}: ${n.message}${n.parameter ? ` (${n.parameter})` : ""}`).join("; ") : `Runware API returned HTTP ${t}.`
    ), this.status = t, this.errors = a, this.name = "RunwareApiError";
  }
  status;
  errors;
}
const kn = /^[\x21-\x7e]{8,512}$/;
class Ke {
  getKey;
  fetchImpl;
  constructor(t) {
    this.getKey = t.getKey, this.fetchImpl = t.fetch ?? ((a, n) => globalThis.fetch(a, n));
  }
  /** Redacts the key from any text before it is shown. */
  redact(t) {
    const a = this.getKey();
    return a ? t.split(a).join("[key]") : t;
  }
  async post(t, a) {
    const n = this.getKey();
    if (!n) throw new Error("No Runware API key. Set RUNWARE_API_KEY, or paste it into the key panel.");
    if (!kn.test(n)) throw new Error("That does not look like a Runware API key.");
    const i = await this.fetchImpl($n, {
      method: "POST",
      headers: { Authorization: `Bearer ${n}`, "Content-Type": "application/json" },
      body: JSON.stringify(t),
      signal: a
    });
    let s;
    try {
      s = await i.json();
    } catch {
      throw new ne(i.status, []);
    }
    const o = s ?? {}, r = Array.isArray(o.data) ? o.data : [], d = Array.isArray(o.errors) ? o.errors.map((l) => ({
      code: String(l.code ?? "error"),
      message: this.redact(String(l.message ?? "")),
      ...l.parameter ? { parameter: String(l.parameter) } : {},
      ...l.taskUUID ? { taskUUID: String(l.taskUUID) } : {}
    })) : [];
    if (!i.ok && !r.length) throw new ne(i.status, d);
    return { data: r, errors: d };
  }
  /** Stores media (data URI, base64 or public URL) and returns its UUID and URL. */
  async upload(t, a) {
    const n = globalThis.crypto.randomUUID(), { data: i, errors: s } = await this.post([{ taskType: "mediaStorage", taskUUID: n, operation: "upload", media: t }], a), o = s.filter((d) => !d.taskUUID || d.taskUUID === n);
    if (o.length) throw new ne(400, o);
    const r = i.find((d) => d.taskUUID === n) ?? i[0];
    if (!r || typeof r.mediaUUID != "string") throw new Error("mediaStorage upload returned no mediaUUID.");
    return { mediaUUID: r.mediaUUID, mediaURL: String(r.mediaURL ?? "") };
  }
  /**
   * The account's current balance in USD. The same response lists the team and
   * the API keys; only the number is read and nothing else is kept or returned.
   */
  async balance(t) {
    const a = globalThis.crypto.randomUUID(), { data: n, errors: i } = await this.post([{ taskType: "accountManagement", taskUUID: a, operation: "getDetails" }], t), s = i.filter((d) => !d.taskUUID || d.taskUUID === a);
    if (s.length) throw new ne(400, s);
    const o = (n.find((d) => d.taskUUID === a) ?? n[0])?.balance, r = typeof o == "string" ? Number(o) : o;
    if (typeof r != "number" || !Number.isFinite(r)) throw new Error("Runware returned no balance.");
    return r;
  }
  /** Reads back the stored request for a task; used to learn which model the router chose. */
  async taskDetails(t, a) {
    const { data: n } = await this.post([{ taskType: "getTaskDetails", taskUUID: t }], a);
    return n[0];
  }
}
const Sn = [
  "firstFrame",
  "lastFrame",
  "keyframes",
  "referenceImages",
  "referenceVideos",
  "referenceAudios",
  "sourceVideo",
  "audioToVideo",
  "elements"
], gt = [
  "static",
  "push-in",
  "pull-out",
  "track-left",
  "track-right",
  "crane-up",
  "crane-down",
  "orbit",
  "handheld",
  "rack-focus"
], Vt = ["image", "video", "audio"], Ot = [
  "first-frame",
  "last-frame",
  "keyframe",
  "character",
  "product",
  "garment",
  "style",
  "setting",
  "motion",
  "source",
  "soundtrack"
], In = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
class W extends Error {
  constructor(t, a) {
    super(`${t}: ${a}`), this.path = t, this.name = "ShotError";
  }
  path;
}
const st = (e) => typeof e == "object" && e !== null && !Array.isArray(e);
function ee(e, t, a, n = !1) {
  if (!(n && e === void 0) && (typeof e != "string" || e.length > a || In.test(e)))
    throw new W(t, `must be plain text up to ${a} characters`);
}
function En(e, t = "shot") {
  if (!st(e)) throw new W(t, "must be an object");
  if (ee(e.subject, `${t}.subject`, 500), ee(e.action, `${t}.action`, 500), ee(e.environment, `${t}.environment`, 500, !0), ee(e.legend, `${t}.legend`, 300, !0), ee(e.focus, `${t}.focus`, 200, !0), ee(e.audio, `${t}.audio`, 500, !0), e.camera !== "guide" && !gt.includes(e.camera))
    throw new W(`${t}.camera`, `must be "guide" or one of ${gt.join(", ")}`);
  if (typeof e.duration != "number" || !(e.duration > 0 && e.duration <= 60)) throw new W(`${t}.duration`, "must be 1-60 seconds");
  if (!Array.isArray(e.references) || e.references.length > 20) throw new W(`${t}.references`, "must be an array of up to 20");
  if (e.references.forEach((a, n) => {
    const i = `${t}.references[${n}]`;
    if (!st(a) || typeof a.id != "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(a.id)) throw new W(`${i}.id`, "must be a short id");
    if (!Vt.includes(a.kind)) throw new W(`${i}.kind`, `must be one of ${Vt.join(", ")}`);
    if (!Ot.includes(a.role)) throw new W(`${i}.role`, `must be one of ${Ot.join(", ")}`);
    ee(a.keep, `${i}.keep`, 200, !0), ee(a.replaces, `${i}.replaces`, 200, !0);
  }), e.beats !== void 0) {
    if (!Array.isArray(e.beats) || e.beats.length > 20) throw new W(`${t}.beats`, "must be an array of up to 20");
    e.beats.forEach((a, n) => {
      if (!st(a) || typeof a.start != "number" || typeof a.end != "number" || !(a.end > a.start && a.start >= 0))
        throw new W(`${t}.beats[${n}]`, "must have start < end, in seconds");
      ee(a.text, `${t}.beats[${n}].text`, 300);
    });
  }
  return e;
}
function Pn(e) {
  const t = e.references.map((a) => `${a.role} ${a.kind}`).join(", ");
  return `${e.subject} ${e.action}${e.environment ? `, ${e.environment}` : ""}. Camera: ${e.camera === "guide" ? "from the guide" : e.camera}. ${e.duration} s${t ? `. References: ${t}` : ""}${e.audio ? `. Sound: ${e.audio}` : ""}.`;
}
function An(e) {
  return {
    model: e.model,
    ...e.notes.length ? { notes: e.notes.slice(0, 40) } : {},
    ...e.dropped.length ? { dropped: e.dropped.slice(0, 40).map((t) => `${t.ref}: ${t.reason}`) } : {}
  };
}
const Nt = 1, Pa = /^[a-z0-9][a-z0-9-]{0,63}$/, Dt = [
  "referenceVideo",
  "referenceImage",
  "referenceAudio",
  "frameImage",
  "audio",
  "video"
], Un = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
class y extends Error {
  constructor(t, a) {
    super(`${t}: ${a}`), this.path = t, this.name = "RecordError";
  }
  path;
}
const ie = (e) => typeof e == "object" && e !== null && !Array.isArray(e);
function B(e, t, a, n = 0) {
  if (typeof e != "string") throw new y(t, "must be a string");
  if (e.length < n || e.length > a)
    throw new y(t, `must be ${n}-${a} characters`);
  if (Un.test(e)) throw new y(t, "must be plain text");
  return e;
}
function Gt(e, t, a) {
  e !== void 0 && B(e, t, a);
}
function Bt(e, t) {
  if (e !== null && (typeof e != "number" || !Number.isFinite(e) || e < 0))
    throw new y(t, "must be a non-negative number or null");
}
function Kt(e, t) {
  if (!ie(e)) throw new y(t, "must be an object");
  B(e.src, `${t}.src`, 2048, 1);
  for (const a of ["width", "height", "fps", "seconds", "bytes"])
    if (e[a] !== void 0 && (typeof e[a] != "number" || !(e[a] >= 0)))
      throw new y(`${t}.${a}`, "must be a non-negative number");
}
function Tn(e, t = "guide") {
  if (!ie(e)) throw new y(t, "must be an object");
  if (e.schemaVersion !== 1) throw new y(`${t}.schemaVersion`, "must be 1");
  Kt(e.video, `${t}.video`);
  for (const a of ["audio", "firstFrame", "firstFrameStyled", "camera"])
    e[a] !== void 0 && Kt(e[a], `${t}.${a}`);
  if (e.beats !== void 0 && (!Array.isArray(e.beats) || e.beats.some((a) => typeof a != "number" || a < 0)))
    throw new y(`${t}.beats`, "must be non-negative seconds");
  return e.onsets !== void 0 && Aa(e.onsets, `${t}.onsets`), e.peaks !== void 0 && Pt(e.peaks, `${t}.peaks`), e;
}
function Pt(e, t) {
  if (!Array.isArray(e) || e.length > 2e4) throw new y(t, "must be an array");
  return e.forEach((a, n) => {
    if (!ie(a) || typeof a.seconds != "number" || !(a.seconds >= 0))
      throw new y(`${t}[${n}].seconds`, "must be non-negative seconds");
    if (typeof a.strength != "number" || !(a.strength >= 0 && a.strength <= 1))
      throw new y(`${t}[${n}].strength`, "must be 0-1");
  }), e;
}
function Aa(e, t) {
  if (!ie(e)) throw new y(t, "must be an object");
  for (const a of ["low", "mid", "high"]) Pt(e[a], `${t}.${a}`);
  return e;
}
function Rn(e, t) {
  if (!ie(e)) throw new y(t, "must be an object");
  if (typeof e.id != "string" || !Pa.test(e.id)) throw new y(`${t}.id`, "must be a slug");
  if (Gt(e.label, `${t}.label`, 120), B(e.provider, `${t}.provider`, 40, 1), B(e.model, `${t}.model`, 120, 1), e.modelRan !== null && B(e.modelRan, `${t}.modelRan`, 120, 1), B(e.prompt, `${t}.prompt`, 5e4), !Array.isArray(e.inputsSent)) throw new y(`${t}.inputsSent`, "must be an array");
  if (e.inputsSent.forEach((a, n) => {
    const i = `${t}.inputsSent[${n}]`;
    if (!ie(a) || !Dt.includes(a.role))
      throw new y(i, `role must be one of ${Dt.join(", ")}`);
    B(a.src, `${i}.src`, 2048, 1);
  }), !["A", "B", "C"].includes(e.firstFrameVariant))
    throw new y(`${t}.firstFrameVariant`, "must be A, B or C");
  if (e.output !== null) {
    if (!ie(e.output)) throw new y(`${t}.output`, "must be an object or null");
    B(e.output.src, `${t}.output.src`, 2048, 1);
  }
  if (Bt(e.costUsd, `${t}.costUsd`), Bt(e.generationSeconds, `${t}.generationSeconds`), Gt(e.note, `${t}.note`, 2e3), e.composed !== void 0) {
    if (!ie(e.composed)) throw new y(`${t}.composed`, "must be an object");
    B(e.composed.model, `${t}.composed.model`, 120, 1);
    for (const a of ["notes", "dropped"]) {
      const n = e.composed[a];
      if (n !== void 0) {
        if (!Array.isArray(n) || n.length > 40) throw new y(`${t}.composed.${a}`, "must be an array");
        n.forEach((i, s) => B(i, `${t}.composed.${a}[${s}]`, 1e3));
      }
    }
  }
  return e.shot !== void 0 && Ua(e.shot, `${t}.shot`), e;
}
function Ua(e, t) {
  try {
    En(e, t);
  } catch (a) {
    throw a instanceof W ? new y(a.path, a.message.slice(a.path.length + 2)) : a;
  }
}
function ge(e) {
  if (!ie(e)) throw new y("record", "must be an object");
  if (e.schemaVersion !== Nt)
    throw new y("schemaVersion", `must be ${Nt}`);
  if (typeof e.id != "string" || !Pa.test(e.id)) throw new y("id", "must be a slug");
  if (B(e.title, "title", 200, 1), e.guide !== void 0 && Tn(e.guide), e.shot !== void 0 && Ua(e.shot, "shot"), !Array.isArray(e.lanes) || e.lanes.length < 1 || e.lanes.length > 12)
    throw new y("lanes", "must hold 1-12 lanes");
  const t = e.lanes.map((n, i) => Rn(n, `lanes[${i}]`)), a = new Set(t.map((n) => n.id));
  if (a.size !== t.length) throw new y("lanes", "lane ids must be distinct");
  if (e.preferredLane !== void 0 && !a.has(e.preferredLane))
    throw new y("preferredLane", "must name a lane in this record");
  if (e.observations !== void 0) {
    if (!Array.isArray(e.observations)) throw new y("observations", "must be an array");
    e.observations.forEach((n, i) => B(n, `observations[${i}]`, 2e3));
  }
  return e;
}
const _t = ["mannequin", "block", "stick", "blob", "glider", "file", "rigged"], Mn = [
  "video",
  "audio",
  "firstFrame",
  "character",
  "motion",
  "recipe",
  "beats",
  "camera"
], Fn = /^\d+\.\d+\.\d+$/, Ln = ["schemaVersion", "video", "audio", "firstFrame", "firstFrameStyled", "beats", "recipe", "meta", "camera"], Le = (e) => typeof e == "object" && e !== null && !Array.isArray(e);
function Te(e, t, a) {
  if (typeof e != "string" || e.length < 1 || e.length > 255 || /[\\/]|^\.\.?$/.test(e))
    throw new y(t, "must be a file name inside the bundle");
  if (a && !a.test(e)) throw new y(t, `must match ${a}`);
  return e;
}
function zt(e, t) {
  if (!Array.isArray(e) || e.some((a) => typeof a != "number" || !(a >= 0)))
    throw new y(t, "must be non-negative seconds");
  return e;
}
function Ta(e, t = "bundle") {
  if (!Le(e)) throw new y(t, "must be an object");
  if (typeof e.schemaVersion != "string" || !Fn.test(e.schemaVersion))
    throw new y(`${t}.schemaVersion`, "must be x.y.z");
  for (const a of Object.keys(e))
    if (!Ln.includes(a)) throw new y(`${t}.${a}`, "is not a bundle key");
  Te(e.video, `${t}.video`, /\.mp4$/), Te(e.firstFrame, `${t}.firstFrame`, /\.png$/);
  for (const a of ["beats", "recipe", "meta"]) Te(e[a], `${t}.${a}`, /\.json$/);
  e.camera !== void 0 && Te(e.camera, `${t}.camera`, /\.json$/);
  for (const a of ["audio", "firstFrameStyled"]) e[a] !== void 0 && Te(e[a], `${t}.${a}`);
  return e;
}
function Ra(e, t = "beats") {
  if (!Le(e)) throw new y(t, "must be an object");
  if (typeof e.bpm != "number" || !(e.bpm >= 40 && e.bpm <= 240)) throw new y(`${t}.bpm`, "must be 40-240");
  if (typeof e.offsetSeconds != "number" || !(e.offsetSeconds >= 0))
    throw new y(`${t}.offsetSeconds`, "must be non-negative");
  if (!Number.isInteger(e.beatsPerBar) || e.beatsPerBar < 1)
    throw new y(`${t}.beatsPerBar`, "must be a positive integer");
  if (e.source !== "manual" && e.source !== "analysis") throw new y(`${t}.source`, "must be manual or analysis");
  return zt(e.beats, `${t}.beats`), zt(e.downbeats, `${t}.downbeats`), e.onsets !== void 0 && Aa(e.onsets, `${t}.onsets`), e.peaks !== void 0 && Pt(e.peaks, `${t}.peaks`), e;
}
function Ma(e, t = "meta") {
  if (!Le(e)) throw new y(t, "must be an object");
  for (const n of ["width", "height", "frames"])
    if (!Number.isInteger(e[n]) || e[n] < 1) throw new y(`${t}.${n}`, "must be a positive integer");
  if (e.fps !== 24) throw new y(`${t}.fps`, "must be 24");
  const a = e.character;
  if (!Le(a) || !_t.includes(a.kind) || typeof a.name != "string")
    throw new y(`${t}.character`, `kind must be one of ${_t.join(", ")}`);
  if (!Array.isArray(e.assets) || e.assets.length < 1) throw new y(`${t}.assets`, "must list at least one asset");
  return e.assets.forEach((n, i) => {
    if (!Le(n) || !Mn.includes(n.role)) throw new y(`${t}.assets[${i}].role`, "unknown role");
    if (typeof n.licence != "string" || n.licence.length < 1) throw new y(`${t}.assets[${i}].licence`, "is required");
  }), e;
}
function jn(e, t, a) {
  const n = Ta(e.manifest), i = Ra(e.beats), s = Ma(e.meta), o = t.endsWith("/") ? t : `${t}/`, r = (m) => `${o}${m}`, d = s.fps, l = {
    schemaVersion: 1,
    video: { src: r(n.video), contentType: "video/mp4", width: s.width, height: s.height, fps: d, seconds: s.durationSeconds },
    firstFrame: { src: r(n.firstFrame), contentType: "image/png", width: s.width, height: s.height },
    beats: i.beats,
    ...i.onsets ? { onsets: i.onsets } : {},
    ...i.peaks ? { peaks: i.peaks } : {},
    ...e.recipe ? { recipe: e.recipe } : {},
    meta: {
      licences: s.assets.map((m) => ({ asset: m.file ?? m.name, licence: m.licence })),
      bundleSchemaVersion: n.schemaVersion,
      character: s.character,
      generator: s.generator,
      bpm: i.bpm,
      downbeats: i.downbeats
    }
  };
  return n.audio && (l.audio = { src: r(n.audio) }), n.firstFrameStyled && (l.firstFrameStyled = { src: r(n.firstFrameStyled) }), n.camera && (l.camera = { src: r(n.camera), contentType: "application/json" }), l;
}
class K extends Error {
  constructor(t) {
    super(t), this.name = "GuideError";
  }
}
const Cn = {
  mp4: "video/mp4",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4"
}, Vn = 2 * 1048576, On = 300 * 1048576, Nn = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
function je(e) {
  return Cn[e.toLowerCase().split(".").pop() ?? ""];
}
function Dn(e) {
  let t = "";
  for (let a = 0; a < e.length; a += 32768) t += String.fromCharCode(...e.subarray(a, a + 32768));
  return btoa(t);
}
function Gn(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength);
  if (e.length > 24 && e[0] === 137 && e[1] === 80) return { width: t.getUint32(16), height: t.getUint32(20) };
  if (e.length > 30 && String.fromCharCode(...e.subarray(0, 4)) === "RIFF" && String.fromCharCode(...e.subarray(8, 12)) === "WEBP") {
    const a = String.fromCharCode(...e.subarray(12, 16));
    return a === "VP8 " ? { width: t.getUint16(26, !0) & 16383, height: t.getUint16(28, !0) & 16383 } : a === "VP8L" ? { width: 1 + ((e[22] & 63) << 8 | e[21]), height: 1 + ((e[24] & 15) << 10 | e[23] << 2 | (e[22] & 192) >> 6) } : a === "VP8X" ? { width: 1 + (e[24] | e[25] << 8 | e[26] << 16), height: 1 + (e[27] | e[28] << 8 | e[29] << 16) } : void 0;
  }
  if (e.length > 4 && e[0] === 255 && e[1] === 216) {
    let a = 2;
    for (; a + 9 < e.length; ) {
      if (e[a] !== 255) return;
      const n = e[a + 1], i = t.getUint16(a + 2);
      if (n >= 192 && n <= 207 && ![196, 200, 204].includes(n))
        return { height: t.getUint16(a + 5), width: t.getUint16(a + 7) };
      a += 2 + i;
    }
  }
}
async function Ge(e, t, a = {}, n = e.name) {
  const i = je(e.name);
  if (!i?.startsWith(t)) throw new K(`${e.name}: expected a ${t} file.`);
  if (e.size > On) throw new K(`${e.name} is over 300 MB.`);
  const s = await e.bytes(), o = t === "image" ? Gn(s) : void 0;
  return {
    name: e.name,
    contentType: i,
    ref: `data:${i};base64,${Dn(s)}`,
    displaySrc: n,
    info: { ...a, ...o, bytes: e.size }
  };
}
const Bn = ["image/png", "image/jpeg", "image/webp"];
async function Fa(e, t) {
  const a = je(e.name);
  if (!a || !Bn.includes(a))
    throw new K(`${e.name}: a reference image must be a PNG, JPEG or WebP file (the name ends in .png, .jpg, .jpeg or .webp).`);
  const n = await Ge(e, "image", {}, t ?? e.name);
  if (!n.info?.width || !n.info.height)
    throw new K(`${e.name}: its width and height could not be read, so the model's size limits cannot be checked. Re-save it as a PNG or JPEG.`);
  return n;
}
async function Oe(e, t) {
  if (!e) throw new K(`The bundle has no ${t}.`);
  if (e.size > Vn) throw new K(`${t} is over 2 MB.`);
  try {
    return JSON.parse(new TextDecoder().decode(await e.bytes()));
  } catch {
    throw new K(`${t} is not valid JSON.`);
  }
}
const Ne = (e, t) => typeof e == "string" && e.trim().length > 0 && e.length <= t && !Nn.test(e);
function La(e) {
  if (typeof e != "object" || e === null) return;
  const t = e;
  if (!Ne(t.subject, 500) || !(t.action === void 0 || t.action === "" || Ne(t.action, 500))) return;
  const a = { subject: t.subject.trim(), action: typeof t.action == "string" ? t.action.trim() : "" };
  return Ne(t.environment, 500) && (a.environment = t.environment.trim()), Ne(t.legend, 300) && (a.legend = t.legend.trim()), (t.camera === "guide" || gt.includes(t.camera)) && (a.camera = t.camera), a;
}
async function ja(e, t = {}) {
  const a = t.base ? t.base.endsWith("/") ? t.base : `${t.base}/` : "./", n = (b) => /^https?:\/\//.test(a) ? new URL(b, a).href : b, i = /* @__PURE__ */ new Map();
  for (const b of e) i.set(b.name.split(/[\\/]/).pop(), b);
  let s, o, r;
  try {
    s = Ta(await Oe(i.get("bundle.json"), "bundle.json")), o = Ma(await Oe(i.get(s.meta), s.meta)), r = Ra(await Oe(i.get(s.beats), s.beats));
  } catch (b) {
    throw b instanceof K ? b : new K(`The bundle does not match the guide-bundle schema: ${b.message}`);
  }
  const d = i.get(s.recipe), l = d ? await Oe(d, s.recipe) : void 0, m = (b) => {
    const x = i.get(b);
    if (!x) throw new K(`The bundle names ${b}, but that file is missing.`);
    return x;
  }, u = o.durationSeconds;
  if (typeof u != "number" || !(u > 0 && u <= 600)) throw new K("meta.json: durationSeconds must be 0-600 seconds.");
  const p = await Ge(m(s.video), "video", { width: o.width, height: o.height, seconds: u, fps: o.fps, hasAudio: o.audioInVideo === !0 }, n(s.video)), f = await Ge(m(s.firstFrame), "image", {}, n(s.firstFrame)), w = s.audio ? await Ge(m(s.audio), "audio", { seconds: u }, n(s.audio)) : void 0, h = jn({ manifest: s, beats: r, meta: o, ...l ? { recipe: l } : {} }, a), g = La(l?.shot);
  return { manifest: s, meta: o, beats: r, ...l ? { recipe: l } : {}, ...g ? { shot: g } : {}, video: p, audio: w, firstFrame: f, seconds: u, guide: h };
}
const we = {
  "first-frame": { noun: "the opening frame", keep: "its composition and pose" },
  "last-frame": { noun: "the closing frame", keep: "its composition and pose" },
  keyframe: { noun: "a keyframe", keep: "its pose" },
  character: { noun: "the character", keep: "face, build and outfit" },
  product: { noun: "the product", keep: "shape, materials and colours" },
  garment: { noun: "the garment", keep: "cut, fabric and colour" },
  style: { noun: "the look", keep: "palette, lighting and texture" },
  setting: { noun: "the setting", keep: "layout and light" },
  motion: { noun: "the motion guide", keep: "body motion, timing and camera move" },
  source: { noun: "the source clip", keep: "everything not named in the prompt" },
  soundtrack: { noun: "the soundtrack", keep: "its beat and timing" }
}, Kn = {
  static: "The camera stays still.",
  "push-in": "The camera moves slowly towards the subject.",
  "pull-out": "The camera moves slowly away from the subject.",
  "track-left": "The camera moves left alongside the subject.",
  "track-right": "The camera moves right alongside the subject.",
  "crane-up": "The camera rises.",
  "crane-down": "The camera lowers.",
  orbit: "The camera circles the subject.",
  handheld: "Handheld camera.",
  "rack-focus": "Focus shifts from the foreground to the subject."
};
function _n(e, t, a = "the subject") {
  const n = e.camera.vocabulary.find((i) => i.move === t && i.phrase);
  if (n?.phrase) return { text: n.phrase.replaceAll("{subject}", a) };
  if (e.camera.kind === "parameter") {
    const i = e.camera.values.find((s) => s.move === t);
    if (i) return { text: i.meaning };
  }
  return { text: Kn[t], note: `"${t}" is not in ${e.name}'s guide vocabulary; plain words are used.` };
}
const Q = (e) => {
  const t = e.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const a = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(a) ? a : `${a}.`;
}, ye = (e, t) => t.references.find((a) => a.id === e.ref)?.keep ?? we[e.role].keep, N = (e, t = " ") => e.filter(Boolean).join(t), We = (e, t = Q(`${e.subject} ${e.action}`)) => N([t, e.environment ? Q(e.environment) : null]), He = (e) => e.legend ? Q(e.legend) : null, zn = (e) => `${e.start}–${e.end} s`;
function Wn(e, t, a, n) {
  const i = a.find((d) => d.input === "referenceVideos" && d.role === "motion" && d.address), s = [];
  if (i) {
    const d = t.references.find((l) => l.id === i.ref)?.keep;
    s.push(`Reference only the ${d ?? "motion, camera path and pacing"} of ${i.address}.`);
  }
  for (const d of a) {
    if (!d.address || d === i) continue;
    const l = t.references.find((m) => m.id === d.ref);
    d.input === "firstFrame" ? s.push(`${d.address} is the first frame.`) : d.input === "lastFrame" ? s.push(`${d.address} is the last frame.`) : i && l?.replaces ? s.push(`Replace ${l.replaces} with ${we[d.role].noun} in ${d.address}; keep ${ye(d, t)}.`) : s.push(`${d.address} defines ${we[d.role].noun}; keep ${ye(d, t)}.`);
  }
  const o = t.beats?.length ? t.beats.map((d) => `${zn(d)}: ${Q(d.text)}`).join(`
`) : null, r = t.audio ? `Audio: ${Q(t.audio)} No subtitles.` : null;
  return N([N([...s, He(t)]), N([We(t), n.text]), o, r], `

`);
}
function Hn(e, t, a, n) {
  const i = a.filter((d) => d.address && d.input !== "referenceAudios").map((d) => d.role === "motion" ? `${d.address} is ${we.motion.noun}: follow its ${ye(d, t)}.` : `${d.address} is ${we[d.role].noun}; keep ${ye(d, t)}.`), s = a.find((d) => d.input === "referenceAudios"), o = t.audio || s ? N(["Audio:", t.audio ? Q(t.audio) : null, s?.address ? `Sync the motion to ${s.address}.` : null]) : null, r = t.beats?.length ? t.beats.map((d) => `[${d.start}-${d.end}s] ${Q(d.text)}`).join(`
`) : null;
  return N([n.text, N([...i, He(t)]), We(t), r, o], `

`);
}
function Xn(e, t, a, n) {
  const i = a.find((l) => l.role === "motion" && l.address), s = a.filter((l) => l.address && l.input !== "referenceAudios").map((l) => l === i ? `${l.address} is the motion reference: follow its ${ye(l, t)}.` : `${l.address} is ${we[l.role].noun}; keep ${ye(l, t)}.`), o = We(t, i ? Q(`${t.subject}, moving as in ${i.address}`) : void 0), r = a.some((l) => l.input === "referenceAudios"), d = t.audio || r ? N(["Sound:", t.audio ? Q(t.audio) : null, r ? "Follow the reference audio." : null]) : null;
  return N([N([...s, He(t)]), N([o, n.text]), d], `

`);
}
function Wt(e, t, a, n) {
  const i = e.id.startsWith("flux") ? a.map(
    (o) => o.input === "firstFrame" ? "Use this image as the first frame." : o.input === "lastFrame" ? "Use this image as the last frame." : o.input === "keyframes" ? "Use these images as keyframes, in order." : null
  ) : [], s = t.audio ? `Audio: ${Q(t.audio)}` : null;
  return N([...new Set(i)], " ") + (i.some(Boolean) ? " " : "") + N([We(t), He(t), n.text, s]);
}
function Jn(e, t, a, n) {
  switch (e.prompting.addressing.style) {
    case "tags":
      return Wn(e, t, a, n);
    case "at-mentions":
      return Hn(e, t, a, n);
    case "plain-words":
      return e.prompting.addressing.tokens.length ? Xn(e, t, a, n) : Wt(e, t, a, n);
    default:
      return Wt(e, t, a, n);
  }
}
const At = "https://runware.ai/docs/models", ke = (e) => `${At}/${e}`, Se = (e) => `${At}/${e}/schema.json`, Ce = (e, t) => `${At}/${e}/guides/${t}`, D = 1048576;
function V(e) {
  return {
    secondsEach: null,
    secondsTotalMax: null,
    sidePx: null,
    maxAreaPx: null,
    fps: null,
    maxBytesEach: null,
    aspect: null,
    ...e
  };
}
const $ = (e, t) => ({ min: e, max: t });
function S(e, t, a, n = null, i) {
  return { supported: !0, field: e, maxCount: t, limits: n, source: a, ...i ? { note: i } : {} };
}
function R(e, t) {
  return { supported: !1, field: null, maxCount: null, limits: null, source: e, ...t ? { note: t } : {} };
}
const Xe = "bfl-flux-3-video", Re = ke(Xe), oe = Se(Xe), A = (e) => Ce(Xe, e), C = (e, t, a) => ({ label: e, width: t, height: a }), Yn = {
  id: "flux-3-video",
  name: "FLUX 3 Video",
  lab: "Black Forest Labs",
  air: "bfl:flux@3-video",
  slug: Xe,
  verifiedOn: "2026-11-10",
  sources: {
    model: Re,
    schema: oe,
    guides: [
      { title: "Prompting", url: A("prompting") },
      { title: "Keyframes", url: A("keyframes") },
      { title: "Multi-shot sequences", url: A("multi-shot-sequences") },
      { title: "Audio and speech", url: A("audio-and-speech") },
      { title: "Video continuation", url: A("video-continuation") }
    ]
  },
  inputs: {
    firstFrame: S("inputs.frameImages", 1, A("keyframes")),
    lastFrame: S("inputs.frameImages", 1, A("keyframes")),
    keyframes: S("inputs.frameImages", 10, Re, null, "Placed by frame index (24 fps), timestamp, or first/last; unplaced images are spread evenly. Guidance, not a pixel-exact pin."),
    referenceImages: R(oe),
    referenceVideos: R(oe),
    referenceAudios: R(oe),
    sourceVideo: S("inputs.video", 1, A("video-continuation"), V({ secondsEach: $(null, 15), maxBytesEach: 50 * D }), "Extension only: the clip is continued, not used as a motion reference."),
    audioToVideo: R(oe, "No audio input; speech is a quoted line with a visible speaker."),
    elements: R(oe)
  },
  combinations: [
    {
      id: "frames-or-video",
      text: "frameImages cannot be combined with a source video.",
      when: ["sourceVideo"],
      forbidsInputs: ["firstFrame", "lastFrame", "keyframes"],
      source: oe
    },
    {
      id: "keyframes-need-duration",
      text: "Three or more unplaced frame images need a numeric duration; with any image or video input, safetyTolerance is at most 2.",
      when: ["keyframes"],
      forbidsParams: ["duration:auto"],
      source: Re
    }
  ],
  output: {
    durations: { kind: "range", min: 5, max: 20, auto: !0 },
    defaultDuration: "auto",
    resolutionField: "both",
    resolutions: ["720p", "1080p"],
    sizes: [
      C("720p (~21:9)", 1440, 608),
      C("720p (2:1)", 1344, 672),
      C("720p (~16:9)", 1280, 704),
      C("720p (~4:3)", 1088, 800),
      C("720p (1:1)", 960, 960),
      C("720p (~3:4)", 800, 1088),
      C("720p (~9:16)", 704, 1280),
      C("1080p (~21:9)", 2176, 928),
      C("1080p (~2:1)", 2016, 1024),
      C("1080p (~16:9)", 1920, 1088),
      C("1080p (~4:3)", 1632, 1216),
      C("1080p (1:1)", 1440, 1440),
      C("1080p (~3:4)", 1216, 1632),
      C("1080p (~9:16)", 1088, 1920)
    ],
    fps: [24],
    frameCountRule: "duration × 24 frames; numeric keyframe indices count real frames at 24 fps (keyframes guide).",
    audio: { generates: !0, toggle: "settings.audio" },
    source: oe
  },
  prompting: {
    minChars: null,
    maxChars: null,
    addressing: {
      style: "plain-words",
      tokens: [],
      numbering: 'Frames are named by position in words: "use this image as the first frame" (or "as the last frame"); a continuation opens with "continue the reference video from its final frames".',
      source: A("keyframes")
    },
    rules: [
      { text: "Write plain declarative prose, as to a colleague; keyword lists do worse.", source: A("prompting") },
      { text: "Name five to ten beats rather than piling on adjectives; keep to a few hundred words.", source: A("prompting") },
      { text: "Give each beat about five to seven seconds, and pin the duration once the beats are known.", source: A("prompting") },
      { text: "Always give a camera direction; without one the camera drifts.", source: A("prompting") },
      { text: 'Name each audio layer in order of prominence; add "no on-screen text" whenever speech is quoted.', source: A("audio-and-speech") }
    ],
    seed: { supported: !1, max: null, source: Re },
    negativePrompt: !1
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "camera locked", source: A("prompting"), move: "static", phrase: "The camera holds locked at eye level." },
      { term: "camera pushes slowly forward", source: A("prompting"), move: "push-in", phrase: "The camera pushes slowly forward from wide to close." },
      { term: "camera pulls slowly back", source: A("prompting"), move: "pull-out", phrase: "The camera pulls slowly back from close to wide, revealing the setting." },
      { term: "tracking shot alongside the subject", source: A("prompting"), move: "track-left", phrase: "Tracking shot moving left alongside the subject." },
      { term: "tracking shot alongside the subject", source: A("prompting"), move: "track-right", phrase: "Tracking shot moving right alongside the subject." },
      { term: "camera orbits smoothly", source: A("prompting"), move: "orbit", phrase: "The camera orbits smoothly around the subject, keeping it centred." },
      { term: "handheld tracking shot", source: A("prompting"), move: "handheld", phrase: "Handheld camera following the subject." },
      { term: "pan / tilt", source: A("prompting") },
      { term: "lens: 24mm / 35mm / 70mm / anamorphic", source: A("prompting") },
      { term: "one continuous unbroken shot", source: A("multi-shot-sequences") }
    ]
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.04, tier: "720p", mode: "draft", label: "T2V & I2V. Draft · 720p" },
      { usdPerSecond: 0.06, tier: "720p", mode: "draft-video-input", label: "V2V · Draft · 720p" },
      { usdPerSecond: 0.17, tier: "720p", mode: "no-video-input", label: "T2V & I2V. 720p" },
      { usdPerSecond: 0.29, tier: "1080p", mode: "no-video-input", label: "T2V & I2V · 1080p" },
      { usdPerSecond: 0.43, tier: "720p", mode: "video-input", label: "V2V · 720p" },
      { usdPerSecond: 0.54, tier: "1080p", mode: "video-input", label: "V2V · 1080p" }
    ],
    surcharges: [],
    source: Re
  },
  notes: [
    "fps: no fps field; the keyframes guide states 24 fps.",
    "Crane and rack focus: not stated in the guides' camera vocabulary.",
    "Seed: no request field; the response returns one.",
    "The frame field lists only first/last as allowed values, yet the guides use numeric indices; the guide's index 240 on a 10 s clip is one past the last frame.",
    "Prompt length: not stated in the schema or on the model page (no minLength or maxLength); the guides say 10,000 characters.",
    "Draft mode applies to text-to-video only."
  ]
}, Je = "klingai-video-4-0", Ht = ke(Je), Z = Se(Je), I = (e) => Ce(Je, e), fe = V({ sidePx: $(300, null), maxBytesEach: 30 * D, aspect: $(0.4, 2.5) }), he = {
  id: "kling-4",
  name: "Kling VIDEO 4.0",
  lab: "Kling AI",
  air: "klingai:kling-video@4.0",
  slug: Je,
  verifiedOn: "2026-11-10",
  sources: {
    model: Ht,
    schema: Z,
    guides: [
      { title: "Prompting", url: I("prompting") },
      { title: "Reference images", url: I("reference-images") },
      { title: "Reference videos", url: I("reference-videos") },
      { title: "Keyframes", url: I("keyframes") },
      { title: "Elements", url: I("elements") },
      { title: "Editing video", url: I("editing-video") },
      { title: "Long takes and multi-shot", url: I("long-takes-and-multi-shot") },
      { title: "Dialogue and on-screen text", url: I("dialogue-and-on-screen-text") }
    ]
  },
  inputs: {
    firstFrame: S("inputs.frameImages", 1, Z, fe),
    lastFrame: S("inputs.frameImages", 1, Z, fe),
    keyframes: S(
      "inputs.frameImages",
      10,
      I("keyframes"),
      fe,
      "3-10 frames (x-modes multiple-frames); only first and last are pinned, the rest are spaced evenly in array order."
    ),
    referenceImages: S("inputs.referenceImages", 10, Z, fe),
    referenceVideos: S(
      "inputs.referenceVideos",
      5,
      Z,
      V({
        secondsEach: $(3, 30),
        secondsTotalMax: 30,
        sidePx: $(700, 4553),
        maxAreaPx: 8294400,
        fps: $(24, 60),
        maxBytesEach: 300 * D,
        aspect: $(0.4, 2.5)
      })
    ),
    referenceAudios: R(Z, "No audio input in the schema."),
    sourceVideo: S(
      "inputs.video",
      1,
      I("editing-video"),
      V({ secondsEach: $(3, 30), sidePx: $(700, 4553), maxAreaPx: 8294400, fps: $(24, 60), maxBytesEach: 300 * D, aspect: $(0.4, 2.5) }),
      "Prompt-based edit of the source clip."
    ),
    audioToVideo: R(Z),
    elements: S(
      "inputs.elements",
      7,
      I("elements"),
      null,
      "At most three built from video; a video element is one 3-8 s clip; voices only beside images."
    )
  },
  combinations: [
    {
      id: "image-cap",
      text: "Frame images and reference images share a cap of ten.",
      when: [],
      sharedMax: { inputs: ["firstFrame", "lastFrame", "keyframes", "referenceImages"], max: 10 },
      source: I("reference-images")
    },
    {
      id: "video-cap",
      text: "Source video, reference videos and element videos share a cap of five files and 30 s in total.",
      when: [],
      sharedMax: { inputs: ["sourceVideo", "referenceVideos"], max: 5 },
      source: Z
    }
  ],
  output: {
    durations: { kind: "range", min: 3, max: 30, auto: !1 },
    defaultDuration: 10,
    resolutionField: "both",
    resolutions: ["720p", "1080p"],
    sizes: [
      { label: "720p (16:9)", width: 1280, height: 720 },
      { label: "720p (1:1)", width: 940, height: 940 },
      { label: "720p (9:16)", width: 720, height: 1280 },
      { label: "720p (~21:9)", width: 1460, height: 624 },
      { label: "1080p (16:9)", width: 1920, height: 1080 },
      { label: "1080p (1:1)", width: 1440, height: 1440 },
      { label: "1080p (9:16)", width: 1080, height: 1920 },
      { label: "1080p (~21:9)", width: 2200, height: 940 }
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: !0, toggle: null },
    source: Z
  },
  prompting: {
    minChars: 1,
    maxChars: 26e3,
    addressing: {
      style: "tags",
      tokens: [
        { input: "image", pattern: "<<<image_{n}>>>" },
        { input: "video", pattern: "<<<video_{n}>>>" },
        { input: "element", pattern: "<<<element_{n}>>>" }
      ],
      numbering: "Images are numbered across frameImages then referenceImages; videos across video then referenceVideos; elements in array order, separately from images.",
      source: Z
    },
    rules: [
      { text: "Open with one sentence per input saying what it defines and what to keep from it.", source: I("reference-images") },
      { text: 'Name what to copy from a reference video without describing it again; add "only" to keep the rest out.', source: I("reference-videos") },
      { text: "Trade mood adjectives for things the camera can see: light direction, materials, focus.", source: I("prompting") },
      { text: "Long briefs run in a fixed order: settings, then timed beats, then an audio section.", source: I("prompting") },
      { text: "Write positively; the only negatives worth writing are no subtitles and no background music.", source: I("prompting") }
    ],
    seed: { supported: !1, max: null, source: I("prompting") },
    negativePrompt: !1
  },
  camera: {
    kind: "prompt-only",
    // Runware's "Directing the camera" rule: name the move, the height, the speed and what the shot
    // ends on, tied to something in the frame. "Crane" is not in the vocabulary; "rises and tilts down" is.
    vocabulary: [
      { term: "static camera / locked-off", source: I("prompting"), move: "static", phrase: "Static, locked-off camera at eye level, holding on {subject} for the whole shot." },
      { term: "push-in", source: I("prompting"), move: "push-in", phrase: "Slow push-in at eye level, ending on a close-up of {subject}." },
      { term: "pull-out", source: I("prompting"), move: "pull-out", phrase: "Slow pull-out at eye level, ending on a wide shot with {subject} small in the frame." },
      { term: "tracking shot", source: I("prompting"), move: "track-left", phrase: "Tracking shot at waist height, moving left at walking pace alongside {subject}, ending with {subject} centred." },
      { term: "tracking shot", source: I("prompting"), move: "track-right", phrase: "Tracking shot at waist height, moving right at walking pace alongside {subject}, ending with {subject} centred." },
      { term: "rises and tilts down", source: I("reference-videos"), move: "crane-up", phrase: "The camera slowly rises and tilts down, ending on a high view looking down at {subject}." },
      { term: "orbit", source: I("prompting"), move: "orbit", phrase: "Slow orbit around {subject} at eye level, ending facing {subject}." },
      { term: "light handheld energy", source: I("prompting"), move: "handheld", phrase: "Light handheld energy at eye level, following {subject} and ending on {subject}." },
      { term: "pan", source: I("prompting") },
      { term: "lateral dolly", source: I("dialogue-and-on-screen-text") },
      { term: "one continuous gimbal shot with no cuts", source: I("long-takes-and-multi-shot") },
      { term: 'borrowing a camera path: "Reference only the camera path and pacing of <<<video_1>>>"', source: I("reference-videos") },
      { term: 'timed beats, e.g. "0–3 s: … 3–7 s: …"', source: I("prompting") }
    ]
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.157, tier: "720p", mode: "no-video-input", label: "720p · No video input" },
      { usdPerSecond: 0.235, tier: "1080p", mode: "no-video-input", label: "1080p · No video input" },
      { usdPerSecond: 0.188, tier: "720p", mode: "video-input", label: "720p · Video input" },
      { usdPerSecond: 0.282, tier: "1080p", mode: "video-input", label: "1080p · Video input" }
    ],
    surcharges: [],
    source: Ht
  },
  notes: [
    "Output fps: not stated (the schema says frames = duration × fps, without the fps).",
    "Frame-count rule: not stated.",
    "Seed: the prompting guide says there is no seed, yet the response returns one; no seed request field.",
    "Audio is always generated; the guide says there is no parameter to turn it off.",
    `Crane down and rack focus: not stated in the guides' camera vocabulary ("crane" is not used; the documented wording is "rises and tilts down").`,
    "No camera field: the schema has no camera parameter; the camera is prompt text or a reference video's camera path.",
    "Element `images` is called optional on the model page but required with frontalImage by its own rule.",
    "Resolution preset only with an input; without inputs, width and height are required (schema allOf)."
  ]
}, Ut = "klingai-video-4-0-flash", Xt = ke(Ut), G = Se(Ut), ae = {
  ...he,
  id: "kling-4-flash",
  name: "Kling VIDEO 4.0 Flash",
  air: "klingai:kling-video@4.0-flash",
  slug: Ut,
  sources: { model: Xt, schema: G, guides: he.sources.guides },
  inputs: {
    ...he.inputs,
    firstFrame: S("inputs.frameImages", 1, G, fe, "This model only supports the first frame."),
    lastFrame: R(G, "First frame only."),
    keyframes: R(G, "First frame only."),
    referenceImages: S("inputs.referenceImages", 10, G, fe),
    referenceVideos: S(
      "inputs.referenceVideos",
      5,
      G,
      V({
        secondsEach: $(3, 20),
        secondsTotalMax: 20,
        sidePx: $(700, 4553),
        maxAreaPx: 8294400,
        fps: $(24, 60),
        maxBytesEach: 300 * D,
        aspect: $(0.4, 2.5)
      })
    ),
    sourceVideo: S(
      "inputs.video",
      1,
      G,
      V({ secondsEach: $(3, 20), sidePx: $(700, 4553), maxAreaPx: 8294400, fps: $(24, 60), maxBytesEach: 300 * D, aspect: $(0.4, 2.5) }),
      "Prompt-based edit of the source clip."
    ),
    elements: S("inputs.elements", 7, G, null, "Voices cannot be used with settings.preserveAudio.")
  },
  combinations: [
    {
      id: "image-cap",
      text: "Frame images and reference images share a cap of ten.",
      when: [],
      sharedMax: { inputs: ["firstFrame", "referenceImages"], max: 10 },
      source: G
    },
    {
      id: "video-cap",
      text: "Source video, reference videos and element videos share a cap of five files and 20 s in total.",
      when: [],
      sharedMax: { inputs: ["sourceVideo", "referenceVideos"], max: 5 },
      source: G
    }
  ],
  output: {
    durations: { kind: "range", min: 3, max: 20, auto: !1 },
    defaultDuration: 10,
    resolutionField: "width-height",
    resolutions: ["720p"],
    sizes: [
      { label: "720p (16:9)", width: 1280, height: 720 },
      { label: "720p (1:1)", width: 960, height: 960 },
      { label: "720p (9:16)", width: 720, height: 1280 },
      { label: "720p (~21:9)", width: 1464, height: 628 }
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: !0, toggle: null },
    source: G
  },
  prompting: {
    ...he.prompting,
    addressing: { ...he.prompting.addressing, source: G }
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.094, tier: "720p", mode: "no-video-input", label: "720p · No video input" },
      { usdPerSecond: 0.126, tier: "720p", mode: "video-input", label: "720p · Video input" }
    ],
    surcharges: [],
    source: Xt,
    note: "The model page shows two figures per rate ($0.0799 / $0.094, $0.107 / $0.126) without saying which applies; the schema's x-pricing gives the higher, used here."
  },
  notes: [
    "No Flash guides: prompt rules and camera vocabulary are from the Kling VIDEO 4.0 guides (same tag syntax per the schema).",
    "No resolution parameter: 720p only, as width/height pairs; with inputs the size follows the input.",
    "settings.preserveAudio keeps the input video's audio instead of generating new sound; it needs a video or reference video.",
    "Output fps: not stated. Frame-count rule: not stated.",
    "Seed: no request field; the response returns one."
  ]
}, Ca = "lightricks-ltx-2-5-pro", Zn = "lightricks-ltx-2-5-fast", M = (e) => Ce(Ca, e), Va = [
  { label: "720p (16:9)", width: 1280, height: 720 },
  { label: "720p (9:16)", width: 720, height: 1280 },
  { label: "1080p (16:9)", width: 1920, height: 1080 },
  { label: "1080p (9:16)", width: 1080, height: 1920 }
], Oa = "No 8k+1 frame rule and no divisibility rule in the API or docs: durations, fps and width/height are fixed lists, so any frame padding is hidden server-side.";
function Na(e, t) {
  const a = ke(e), n = Se(e);
  return {
    id: "ltx-2.5",
    name: "LTX-2.5 Pro",
    lab: "Lightricks",
    air: "lightricks:ltx@2.5-pro",
    slug: e,
    verifiedOn: "2026-11-10",
    sources: {
      model: a,
      schema: n,
      guides: [
        { title: "Prompting", url: M("prompting") },
        { title: "Camera movement", url: M("camera-movement") },
        { title: "First and last frame", url: M("first-and-last-frame") },
        { title: "Audio-driven", url: M("audio-driven") },
        { title: "Native audio", url: M("native-audio") },
        { title: "Multi-shot", url: M("multi-shot") }
      ]
    },
    inputs: {
      firstFrame: S("inputs.frameImages", 1, M("first-and-last-frame")),
      lastFrame: S("inputs.frameImages", 1, M("first-and-last-frame")),
      keyframes: R(n, "frameImages holds at most two items (first and last)."),
      referenceImages: S("inputs.referenceImages", 1, n, null, "Only in audio-driven mode, exactly one."),
      referenceVideos: R(n),
      referenceAudios: R(n),
      sourceVideo: R(n, "Capabilities list Edit/Extend on Pro, but the schema has no source-video field."),
      audioToVideo: S("inputs.audio", 1, M("audio-driven"), V({ secondsEach: $(2, t) }), "The clip runs as long as the audio."),
      elements: R(n)
    },
    combinations: [
      {
        id: "audio-mode",
        text: "With audio: no frameImages, no duration, no cameraMovement; exactly one reference image; size 1920×1080 or 1080×1920.",
        when: ["audioToVideo"],
        forbidsInputs: ["firstFrame", "lastFrame"],
        forbidsParams: ["duration", "settings.cameraMovement"],
        requiresExactly: { input: "referenceImages", count: 1 },
        source: a
      },
      {
        id: "reference-needs-audio",
        text: "A reference image is accepted only beside audio.",
        when: ["referenceImages"],
        requiresOneOf: ["audioToVideo"],
        source: n
      }
    ],
    output: {
      durations: { kind: "list", values: [6, 8, 10], auto: !0 },
      defaultDuration: 6,
      resolutionField: "width-height",
      resolutions: ["720p", "1080p"],
      sizes: Va,
      fps: [24, 25, 50],
      frameCountRule: null,
      audio: { generates: !0, toggle: "settings.audio" },
      source: n
    },
    prompting: {
      minChars: 2,
      maxChars: 5e3,
      addressing: {
        style: "none",
        tokens: [],
        numbering: "Inputs are not named in the prompt: the image sets the look and the prompt says what happens; with audio, describe the performance, not the words.",
        source: M("first-and-last-frame")
      },
      rules: [
        { text: "Cover six layers: shot, scene, action, character, camera, audio.", source: M("prompting") },
        { text: "Write one flowing paragraph in the present tense, not a list.", source: M("prompting") },
        { text: "Keep camera and subject motion in separate clauses, with one main action arc.", source: M("prompting") },
        { text: "With a cameraMovement preset set, leave the move out of the prompt.", source: M("camera-movement") },
        { text: "The tighter the shot, the more concrete the nouns.", source: M("prompting") }
      ],
      seed: { supported: !1, max: null, source: a },
      negativePrompt: !1
    },
    camera: {
      kind: "parameter",
      field: "settings.cameraMovement",
      values: [
        { value: "static", meaning: "Fixed camera with no movement.", move: "static" },
        { value: "dolly_in", meaning: "Camera moves toward the subject.", move: "push-in" },
        { value: "dolly_out", meaning: "Camera moves away from the subject.", move: "pull-out" },
        { value: "dolly_left", meaning: "Camera tracks to the left.", move: "track-left" },
        { value: "dolly_right", meaning: "Camera tracks to the right.", move: "track-right" },
        { value: "jib_up", meaning: "Camera rises on a jib.", move: "crane-up" },
        { value: "jib_down", meaning: "Camera lowers on a jib.", move: "crane-down" },
        { value: "focus_shift", meaning: "Focus racks between subjects.", move: "rack-focus" }
      ],
      forbiddenWith: ["audioToVideo"],
      vocabulary: [
        { term: "orbit", source: M("camera-movement"), move: "orbit", phrase: "The camera orbits slowly around the subject and ends facing it." },
        { term: "handheld", source: M("camera-movement"), move: "handheld", phrase: "Handheld camera, following the subject closely." },
        { term: "push in, pull back, track, tilt, pan, over-the-shoulder, crane", source: M("camera-movement") },
        { term: "say where a described move ends", source: M("camera-movement") }
      ],
      source: n
    },
    pricing: {
      rates: [
        { usdPerSecond: 0.12, tier: "720p", mode: "any", label: "720p" },
        { usdPerSecond: 0.17, tier: "1080p", mode: "any", label: "1080p" }
      ],
      surcharges: [],
      source: a
    },
    notes: [
      Oa,
      "Frame count = duration × fps (e.g. 6 s at 24 fps is 144 frames, not 8k+1).",
      "Seed: no request field; the response returns one.",
      "settings.audio has no stated default.",
      "Audio input: the schema says 2-10 s on Pro; the audio-driven guide says 2 to 20 s.",
      "The model description says up to 4K; the Pro schema allows 1080p at most."
    ]
  };
}
const Qn = Na(Ca, 10), ce = Na(Zn, 20), qn = {
  ...ce,
  id: "ltx-2.5-fast",
  name: "LTX-2.5 Fast",
  air: "lightricks:ltx@2.5-fast",
  inputs: { ...ce.inputs, sourceVideo: R(ce.sources.schema) },
  combinations: [
    ...ce.combinations,
    {
      id: "long-clip-size",
      text: "Clips over 10 s: no 48/50 fps, no explicit width/height and no 2K/4K (the default 1920×1080 applies).",
      when: [],
      source: ce.sources.schema
    }
  ],
  output: {
    ...ce.output,
    durations: { kind: "list", values: [6, 8, 10, 12, 14, 16, 18, 20], auto: !0 },
    resolutions: ["720p", "1080p", "2K", "4K"],
    sizes: [
      ...Va,
      { label: "2K (16:9)", width: 2560, height: 1440 },
      { label: "2K (9:16)", width: 1440, height: 2560 },
      { label: "4K (16:9)", width: 3840, height: 2160 },
      { label: "4K (9:16)", width: 2160, height: 3840 }
    ],
    fps: [24, 25, 48, 50]
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.09, tier: "720p", mode: "any", label: "720p" },
      { usdPerSecond: 0.13, tier: "1080p", mode: "any", label: "1080p" },
      { usdPerSecond: 0.19, tier: "2K", mode: "any", label: "2K" },
      { usdPerSecond: 0.3, tier: "4K", mode: "any", label: "4K" }
    ],
    surcharges: [],
    source: ce.sources.model
  },
  notes: [
    Oa,
    "No Fast guides: prompting and camera rules are from the LTX-2.5 Pro guides, which say Fast shares the prompt structure.",
    "When width or height is sent, or fps is 48/50, duration must be at most 10 s; the page's own 12 s example at 1280×720 breaks this.",
    "Seed: no request field; the response returns one.",
    "settings.audio has no stated default."
  ]
}, Ye = "minimax-h3", Me = ke(Ye), _ = Se(Ye), T = (e) => Ce(Ye, e), ot = V({ sidePx: $(256, 5760), maxBytesEach: 30 * D, aspect: $(0.4, 2.5) }), Jt = V({ secondsEach: $(2, 15), secondsTotalMax: 15, maxBytesEach: 15 * D }), ei = {
  id: "h3",
  name: "MiniMax H3",
  lab: "MiniMax",
  air: "minimax:h3@0",
  slug: Ye,
  verifiedOn: "2026-11-10",
  sources: {
    model: Me,
    schema: _,
    guides: [
      { title: "Generating video", url: T("generating-video") },
      { title: "Reference-driven consistency", url: T("reference-driven-consistency") },
      { title: "Motion, camera and performance", url: T("motion-camera-performance") },
      { title: "First and last frame", url: T("first-and-last-frame") },
      { title: "Editing video", url: T("editing-video") },
      { title: "Sound and voice", url: T("sound-and-voice") }
    ]
  },
  inputs: {
    firstFrame: S("inputs.frameImages", 1, T("first-and-last-frame"), ot),
    lastFrame: S("inputs.frameImages", 1, T("first-and-last-frame"), ot),
    keyframes: R(_, "frameImages holds at most two items (first and last)."),
    referenceImages: S("inputs.referenceImages", 9, _, ot, "The guide advises two well-described images over nine loose ones."),
    referenceVideos: S(
      "inputs.referenceVideos",
      3,
      _,
      V({
        secondsEach: $(2, 15),
        secondsTotalMax: 15,
        sidePx: $(256, 5760),
        fps: $(23.976, 60),
        maxBytesEach: 50 * D,
        aspect: $(0.4, 2.5)
      }),
      "Reference videos and reference audios share the 15 s total. Edits also go through this field."
    ),
    referenceAudios: S("inputs.referenceAudios", 3, _, Jt, "Needs a reference image or video beside it."),
    sourceVideo: R(_, "No inputs.video; the editing guide passes the clip to edit as a reference video."),
    audioToVideo: S("inputs.referenceAudios", 3, _, Jt, "Through reference audio, beside an image or video reference."),
    elements: R(_)
  },
  combinations: [
    {
      id: "frames-alone",
      text: "frameImages cannot be used with reference images, videos or audios.",
      when: ["firstFrame"],
      forbidsInputs: ["referenceImages", "referenceVideos", "referenceAudios"],
      source: Me
    },
    {
      id: "audio-needs-visual",
      text: "Reference audio needs a reference image or a reference video beside it.",
      when: ["referenceAudios"],
      requiresOneOf: ["referenceImages", "referenceVideos"],
      source: Me
    },
    {
      id: "reference-cap",
      text: "Reference images, videos and audios share a cap of twelve files and 64 MB.",
      when: [],
      sharedMax: { inputs: ["referenceImages", "referenceVideos", "referenceAudios"], max: 12 },
      source: _
    }
  ],
  output: {
    durations: { kind: "range", min: 4, max: 15, auto: !1 },
    defaultDuration: 5,
    resolutionField: "both",
    resolutions: ["768p", "1440p"],
    sizes: [
      { label: "768p (~16:9)", width: 1344, height: 768 },
      { label: "768p (4:3)", width: 1024, height: 768 },
      { label: "768p (1:1)", width: 768, height: 768 },
      { label: "768p (3:4)", width: 768, height: 1024 },
      { label: "768p (~9:16)", width: 768, height: 1344 },
      { label: "768p (~21:9)", width: 1536, height: 672 },
      { label: "1440p (16:9)", width: 2560, height: 1440 },
      { label: "1440p (4:3)", width: 1920, height: 1440 },
      { label: "1440p (1:1)", width: 1440, height: 1440 },
      { label: "1440p (3:4)", width: 1440, height: 1920 },
      { label: "1440p (9:16)", width: 1440, height: 2560 },
      { label: "1440p (~21:9)", width: 2944, height: 1248 }
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: !0, toggle: null },
    source: _
  },
  prompting: {
    minChars: 2,
    maxChars: 7e3,
    addressing: {
      style: "plain-words",
      tokens: [
        { input: "image", pattern: "Image {n}" },
        { input: "video", pattern: "Video {n}" }
      ],
      numbering: 'Plain words by array position, from one; images and videos each start at one. How to name a reference audio is not stated (examples say "the reference audio").',
      source: T("reference-driven-consistency")
    },
    rules: [
      { text: "Give each reference a role by its number and say which features to keep.", source: T("reference-driven-consistency") },
      { text: "For motion transfer, name the reference and describe the subject, not the move.", source: T("motion-camera-performance") },
      { text: "Write like a cinematographer: camera move, lens, light, pace.", source: T("generating-video") },
      { text: "Describe the picture first, then close with a Sound: clause tied to moments with as, when, then.", source: T("sound-and-voice") },
      { text: "With anchor frames, prompt only the motion and the sound.", source: T("first-and-last-frame") }
    ],
    seed: { supported: !0, max: 4294967295, source: _ },
    negativePrompt: !1
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "locked tripod", source: Me, move: "static", phrase: "Locked tripod; the camera does not move." },
      { term: "push-in", source: T("generating-video"), move: "push-in", phrase: "Slow cinematic push-in on the subject." },
      { term: "tracking shot", source: T("generating-video"), move: "track-left", phrase: "Slow tracking shot moving left alongside the subject." },
      { term: "tracking shot", source: T("generating-video"), move: "track-right", phrase: "Slow tracking shot moving right alongside the subject." },
      { term: "orbit", source: T("motion-camera-performance"), move: "orbit", phrase: "Smooth cinematic orbit around the subject." },
      { term: "handheld drift", source: T("first-and-last-frame"), move: "handheld", phrase: "Gentle handheld drift." },
      { term: "low-angle dolly-in", source: T("generating-video") },
      { term: "pan", source: T("sound-and-voice") },
      { term: "lens focal length (85mm, 50mm)", source: T("sound-and-voice") }
    ]
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.08, tier: "768p", mode: "any", label: "768p" },
      { usdPerSecond: 0.13, tier: "1440p", mode: "any", label: "2K" }
    ],
    surcharges: [
      { label: "uploaded video", usd: 0.13, per: "input-video-second" },
      { label: "each image beyond the first five", usd: 0.04, per: "image-beyond-five" }
    ],
    source: Me
  },
  notes: [
    "Output fps: not stated. Frame-count rule: not stated.",
    'Pricing labels the higher rate "2K"; the resolution enum says 1440p. That 2K means 1440p is not stated.',
    "Pull-out, crane and rack focus: not stated in the guides' camera vocabulary.",
    "Audio is always generated; there is no audio switch. settings.promptExpansion rewrites prompts and affects reproducibility.",
    "Guides say 2K only and 5-15 s; the schema adds 768p and a 4 s minimum. The schema is followed.",
    "Prompt limit: the guide says 2,000 characters, the schema 7000.",
    "The model description claims continuation; there is no extension field or guide."
  ]
}, Ze = "bytedance-seedance-2-5", rt = ke(Ze), re = Se(Ze), E = (e) => Ce(Ze, e), dt = V({ sidePx: $(300, 6e3), maxBytesEach: 30 * D, aspect: $(0.4, 2.5) }), ti = V({ secondsEach: $(2, 30), secondsTotalMax: 30, sidePx: $(300, 6e3), maxBytesEach: 200 * D, aspect: $(0.4, 2.5) }), Yt = V({ secondsEach: $(2, 30), secondsTotalMax: 30, maxBytesEach: 15 * D }), ct = (e, t) => t.map(([a, n, i]) => ({ label: `${e} (${a})`, width: n, height: i })), ai = {
  id: "seedance-2.5",
  name: "Seedance 2.5",
  lab: "ByteDance",
  air: "bytedance:seedance@2.5",
  slug: Ze,
  verifiedOn: "2026-11-10",
  sources: {
    model: rt,
    schema: re,
    guides: [
      { title: "Prompting", url: E("prompting") },
      { title: "Image to video", url: E("image-to-video") },
      { title: "Motion control", url: E("motion-control") },
      { title: "Multi-reference production", url: E("multi-reference-production") },
      { title: "Editing", url: E("editing") },
      { title: "Long-form narrative", url: E("long-form-narrative") },
      { title: "Multilingual", url: E("multilingual") }
    ]
  },
  inputs: {
    firstFrame: S("inputs.frameImages", 1, E("image-to-video"), dt),
    lastFrame: S("inputs.frameImages", 1, E("image-to-video"), dt, "Only beside a first frame; a last frame alone is rejected."),
    keyframes: R(re, "frameImages holds at most two items (first and last)."),
    referenceImages: S("inputs.referenceImages", 30, re, dt, "The guide calls 1-8 the stable band."),
    referenceVideos: S("inputs.referenceVideos", 10, re, ti, "The guide calls 1-5 the stable band, each about 5-10 s."),
    referenceAudios: S("inputs.referenceAudios", 10, re, Yt, "Audio can be used on its own."),
    sourceVideo: S(
      "inputs.video",
      1,
      E("editing"),
      V({ secondsEach: $(2, 30), sidePx: $(300, 6e3), maxBytesEach: 200 * D, aspect: $(0.4, 2.5) }),
      "Edit or extend; settings.operation picks, or the prompt decides."
    ),
    audioToVideo: S("inputs.referenceAudios", 10, rt, Yt, "Audio-to-video runs through reference audio; there is no separate driving-audio field."),
    elements: R(re)
  },
  combinations: [
    {
      id: "frames-alone",
      text: "frameImages cannot be combined with reference images, reference videos or a source video.",
      when: ["firstFrame"],
      forbidsInputs: ["referenceImages", "referenceVideos", "sourceVideo"],
      source: E("image-to-video")
    },
    {
      id: "last-needs-first",
      text: "A last frame needs a first frame.",
      when: ["lastFrame"],
      requiresOneOf: ["firstFrame"],
      source: E("image-to-video")
    },
    {
      id: "edit-auto-duration",
      text: "An edit (settings.operation edit) takes duration auto; an integer is rejected. width/height are not allowed beside a source video.",
      when: ["sourceVideo"],
      forbidsParams: ["width", "height"],
      source: E("editing")
    }
  ],
  output: {
    durations: { kind: "range", min: 4, max: 30, auto: !0 },
    defaultDuration: 5,
    resolutionField: "both",
    resolutions: ["480p", "720p", "1080p"],
    sizes: [
      ...ct("480p", [["~16:9", 854, 480], ["~4:3", 752, 560], ["1:1", 640, 640], ["~3:4", 560, 752], ["~9:16", 480, 854], ["~21:9", 992, 432]]),
      ...ct("720p", [["16:9", 1280, 720], ["4:3", 1112, 834], ["1:1", 960, 960], ["3:4", 834, 1112], ["9:16", 720, 1280], ["21:9", 1470, 630]]),
      ...ct("1080p", [["16:9", 1920, 1080], ["4:3", 1664, 1248], ["1:1", 1440, 1440], ["3:4", 1248, 1664], ["9:16", 1080, 1920], ["~21:9", 2206, 946]])
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: !0, toggle: "settings.audio" },
    source: re
  },
  prompting: {
    minChars: 2,
    maxChars: 5e4,
    addressing: {
      style: "at-mentions",
      tokens: [
        { input: "image", pattern: "@Image{n}" },
        { input: "video", pattern: "@Video{n}" },
        { input: "audio", pattern: "@Audio{n}" }
      ],
      numbering: "By array position, from one, counted separately per array; an edit source in inputs.video is @Video1.",
      source: E("multi-reference-production")
    },
    rules: [
      { text: "Keep five concerns apart: shot, subject, action, light, audio.", source: E("prompting") },
      { text: "Open with the camera clause so motion goes to the camera, not idle subject animation.", source: E("prompting") },
      { text: "Give camera and subject separate clauses, with one main action arc per clip.", source: E("prompting") },
      { text: "Pace beats with time windows such as [0-3s].", source: E("prompting") },
      { text: "Bind each tag to a role, then use the role name; put audio and negatives at the end.", source: E("multi-reference-production") }
    ],
    seed: { supported: !0, max: 2147483647, source: re },
    negativePrompt: !1
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "static / locked-off", source: E("prompting"), move: "static", phrase: "Static, locked-off camera." },
      { term: "dolly-in / push-in", source: E("prompting"), move: "push-in", phrase: "Slow dolly-in towards the subject." },
      { term: "dolly-out / pull-back", source: E("prompting"), move: "pull-out", phrase: "Slow dolly-out, pulling back to reveal the setting." },
      { term: "tracking shot", source: E("prompting"), move: "track-left", phrase: "Tracking shot moving left with the subject." },
      { term: "tracking shot", source: E("prompting"), move: "track-right", phrase: "Tracking shot moving right with the subject." },
      { term: "crane / boom", source: E("prompting"), move: "crane-up", phrase: "Crane up, rising above the subject." },
      { term: "crane / boom", source: E("prompting"), move: "crane-down", phrase: "Crane down, lowering towards the subject." },
      { term: "orbit / arc", source: E("prompting"), move: "orbit", phrase: "Slow orbit around the subject." },
      { term: "handheld", source: E("prompting"), move: "handheld", phrase: "Handheld camera with subtle organic shake." },
      { term: "dolly zoom / Vertigo", source: E("prompting") },
      { term: "one-shot, FPV, bullet time, speed ramp", source: E("prompting") }
    ]
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.1025, tier: "480p", mode: "no-video-input", label: "Text/Image to Video · 480p" },
      { usdPerSecond: 0.2304, tier: "720p", mode: "no-video-input", label: "Text/Image to Video · 720p" },
      { usdPerSecond: 0.61354, tier: "1080p", mode: "no-video-input", label: "Text/Image to Video · 1080p" },
      { usdPerSecond: 0.1313, tier: "480p", mode: "video-input", label: "Video-to-Video · 480p" },
      { usdPerSecond: 0.2953, tier: "720p", mode: "video-input", label: "Video-to-Video · 720p" },
      { usdPerSecond: 0.73415, tier: "1080p", mode: "video-input", label: "Video-to-Video · 1080p" }
    ],
    surcharges: [],
    source: rt,
    note: "Which inputs bill at the Video-to-Video rate (a source video, reference videos, or both) is not stated."
  },
  notes: [
    "Output fps: not stated. Frame-count rule: not stated.",
    "Rack focus: not stated in the guide's camera vocabulary.",
    "The prompting guide says there is no 1080p output; the schema and model page offer 1080p. The schema is followed.",
    "Prompt limit: the guide says 10,000 characters, the schema 50,000.",
    "Seed maximum is 2^31-1 while the text says random seeds use the unsigned 32-bit range."
  ]
}, _e = [
  he,
  ae,
  ai,
  ei,
  Qn,
  qn,
  Yn
];
function Da(e) {
  const t = _e.find((a) => a.id === e || a.air === e || a.slug === e);
  if (!t) throw new Error(`No spec for "${e}". Known: ${_e.map((a) => a.id).join(", ")}.`);
  return t;
}
const ni = {
  "first-frame": "firstFrame",
  "last-frame": "lastFrame",
  keyframe: "keyframes"
}, Zt = ["firstFrame", "lastFrame", "keyframes"];
function ii(e, t) {
  return t.kind === "image" ? ni[t.role] ?? "referenceImages" : t.kind === "video" ? t.role === "source" ? "sourceVideo" : "referenceVideos" : e.inputs.referenceAudios.supported || !e.inputs.audioToVideo.supported ? "referenceAudios" : "audioToVideo";
}
function si(e, t, a) {
  const n = [], i = [];
  let s = [];
  const o = (u, p) => {
    s = s.filter((f) => f !== u), n.push({ ref: u.ref.id, role: u.ref.role, wanted: u.convertedFrom ?? u.input, reason: p });
  }, r = (u) => s.some((p) => p.input === u), d = (u) => s.filter((p) => p.input === u).length, l = (u, p) => {
    u.convertedFrom || (u.convertedFrom = u.input), u.input = "referenceImages", i.push(`${u.ref.id}: sent as a reference image because ${p}`);
  };
  for (const u of t.references) {
    const p = ii(e, u), f = { ref: u, input: p };
    if (!e.inputs[p].supported) {
      n.push({ ref: u.id, role: u.role, wanted: p, reason: `${e.name} takes no ${Qt(p)}.` });
      continue;
    }
    const w = e.inputs[p].maxCount;
    if (w !== null && d(p) >= w) {
      n.push({ ref: u.id, role: u.role, wanted: p, reason: `${e.name} takes at most ${w} ${Qt(p)}.` });
      continue;
    }
    s.push(f);
  }
  const m = e.camera.kind === "parameter" ? e.camera.field : null;
  for (let u = 0; u < 4; u++)
    for (const p of e.combinations) {
      if (p.when.length === 0 || !p.when.every(r)) continue;
      const f = s.filter((h) => p.when.includes(h.input));
      if (m && p.forbidsParams?.includes(m) && (a.prefer ?? "camera-parameter") === "camera-parameter" && Ga(e, t.camera)) {
        for (const h of f) o(h, `${p.text} The camera parameter was kept.`);
        continue;
      }
      const w = s.filter((h) => p.forbidsInputs?.includes(h.input));
      if (w.length) {
        const h = e.inputs.referenceImages.supported;
        if (h && f.every((g) => Zt.includes(g.input)) && !w.every((g) => g.input === "referenceImages" && !g.convertedFrom))
          for (const g of f) l(g, `${e.name} does not take a frame beside references (${p.id}).`);
        else if (h && !p.forbidsInputs?.includes("referenceImages") && w.every((g) => Zt.includes(g.input)))
          for (const g of w) l(g, `frame images are not allowed here (${p.id}).`);
        else
          for (const g of w) o(g, p.text);
      }
      if (p.requiresExactly) {
        const { input: h, count: g } = p.requiresExactly;
        for (const b of s.filter((x) => x.input === h).slice(g)) o(b, p.text);
        if (d(h) < g) for (const b of s.filter((x) => p.when.includes(x.input))) o(b, p.text);
      }
      if (p.requiresOneOf && !p.requiresOneOf.some(r))
        for (const h of s.filter((g) => p.when.includes(g.input))) o(h, p.text);
    }
  for (const u of e.combinations) {
    if (!u.sharedMax) continue;
    const p = s.filter((f) => u.sharedMax.inputs.includes(f.input));
    for (const f of p.slice(u.sharedMax.max)) o(f, u.text);
  }
  return { slots: s, dropped: n, notes: i };
}
function Ga(e, t) {
  return e.camera.kind === "parameter" ? e.camera.values.find((a) => a.move === t)?.value : void 0;
}
const oi = {
  firstFrame: "first frame",
  lastFrame: "last frame",
  keyframes: "keyframes",
  referenceImages: "reference images",
  referenceVideos: "reference video",
  referenceAudios: "reference audio",
  sourceVideo: "source video",
  audioToVideo: "driving audio",
  elements: "elements"
}, Qt = (e) => oi[e];
function ri(e, t) {
  const a = /* @__PURE__ */ new Map(), { style: n, tokens: i } = e.prompting.addressing, s = (d) => i.find((l) => l.input === d)?.pattern, o = (d) => d.flatMap((l) => t.filter((m) => m.input === l)), r = (d, l) => {
    const m = s(l);
    d.forEach((u, p) => a.set(u, m ? m.replace("{n}", String(p + 1)) : null));
  };
  for (const d of t) a.set(d, null);
  return n === "tags" ? (r(o(["firstFrame", "lastFrame", "keyframes", "referenceImages"]), "image"), r(o(["sourceVideo", "referenceVideos"]), "video")) : (n === "at-mentions" || n === "plain-words") && (r(o(["referenceImages"]), "image"), r(o(["referenceVideos"]), "video"), r(o(["referenceAudios"]), "audio")), a;
}
function di(e, t, a) {
  const n = e.output.durations;
  let i;
  return n.kind === "range" ? i = Math.min(n.max, Math.max(n.min, Math.round(t))) : i = n.values.reduce((s, o) => Math.abs(o - t) < Math.abs(s - t) ? o : s), i !== t && a.push(`Duration ${t} s is not offered; ${i} s is sent.`), i;
}
function ci(e, t, a = {}) {
  const n = typeof e == "string" ? Da(e) : e, { slots: i, dropped: s, notes: o } = si(n, t, a), r = ri(n, i), d = i.map((b) => ({
    ref: b.ref.id,
    role: b.ref.role,
    input: b.input,
    field: n.inputs[b.input].field,
    address: r.get(b) ?? null,
    ...b.convertedFrom ? { convertedFrom: b.convertedFrom } : {}
  })), l = {}, m = Ga(n, t.camera), u = n.camera.kind === "parameter" ? n.camera.forbiddenWith.some((b) => d.some((x) => x.input === b)) : !0, p = d.some((b) => b.input === "referenceVideos" && b.role === "motion");
  let f;
  if (t.camera === "guide") {
    const b = d.find((x) => x.input === "referenceVideos" && x.role === "motion");
    if (b) {
      const x = n.prompting.addressing.style === "at-mentions" && b.address ? `Camera: follow the camera move of ${b.address}.` : null;
      o.push("The camera comes from the guide video: its camera path and pacing, named in the guide reference; no camera move is written."), f = { move: "guide", mode: "guide-video", text: x };
    } else
      o.push("No guide video reaches this model, so no camera move is written; set shot.camera to choose one."), f = { move: "guide", mode: "prompt", text: null };
  } else if (n.camera.kind === "parameter" && m && !u)
    l[n.camera.field] = m, f = { move: t.camera, mode: "parameter", field: n.camera.field, value: m, text: null };
  else {
    const b = _n(n, t.camera, t.focus);
    b.note && o.push(b.note), n.camera.kind === "parameter" && !m && o.push(`${n.camera.field} has no value for "${t.camera}"; the move is written into the prompt.`), n.camera.kind === "parameter" && m && u && o.push(`${n.camera.field} is not allowed beside these inputs; the move is written into the prompt.`);
    const x = p && n.prompting.addressing.style === "tags";
    x && o.push("The guide video carries the camera path; the prompt references it instead of describing the move."), f = { move: t.camera, mode: p ? "guide-video" : "prompt", text: x ? null : b.text };
  }
  const w = d.some((b) => b.input === "audioToVideo"), h = di(n, t.duration, o);
  w ? o.push("Audio-driven: no duration is sent; the clip runs as long as the audio.") : l.duration = h;
  const g = Jn(n, t, d, f);
  return n.prompting.maxChars !== null && g.length > n.prompting.maxChars && o.push(`The prompt is ${g.length} characters; ${n.name} takes ${n.prompting.maxChars}.`), {
    model: n.id,
    name: n.name,
    prompt: g,
    params: l,
    camera: f,
    used: d,
    dropped: s,
    cannotTake: Sn.filter((b) => !n.inputs[b].supported),
    duration: { requested: t.duration, sent: h },
    notes: o
  };
}
class Ba extends Error {
  constructor(t) {
    super(t), this.name = "FitError";
  }
}
function Fe(e, t, a, n) {
  const i = [], s = a.info;
  if (!s) return i;
  const { width: o, height: r, seconds: d, fps: l, bytes: m } = s, u = /image/.test(t);
  return n.minSide && o && r && (o < n.minSide || r < n.minSide) && i.push(
    `${e} needs ${t} at least ${n.minSide} px on each side; ${a.name} is ${o}×${r}. ` + (u ? `Use a larger image: export or resize it so its shorter side is at least ${n.minSide} px (1024 px is a safe size).` : `Scale it first, e.g. ffmpeg -i in.mp4 -vf scale=-2:${n.minSide <= 720 ? 720 : n.minSide} -c:a copy out.mp4`)
  ), n.maxSide && o && r && (o > n.maxSide || r > n.maxSide) && i.push(`${e} takes ${t} up to ${n.maxSide} px a side; ${a.name} is ${o}×${r}.${u ? ` Resize it so its longer side is ${n.maxSide} px or less.` : ""}`), n.minRatio && o && r && (o / r < n.minRatio || o / r > (n.maxRatio ?? 1 / 0)) && i.push(
    `${e} takes ${t} with aspect ${n.minRatio}-${n.maxRatio}; ${a.name} is ${(o / r).toFixed(2)}.${u ? " Crop it closer to square: no side more than 2.5 times the other." : ""}`
  ), d !== void 0 && n.minSeconds !== void 0 && d < n.minSeconds && i.push(`${e} needs ${t} of at least ${n.minSeconds} s; ${a.name} is ${d.toFixed(2)} s.`), d !== void 0 && n.maxSeconds !== void 0 && d > n.maxSeconds && i.push(`${e} takes ${t} up to ${n.maxSeconds} s; ${a.name} is ${d.toFixed(2)} s. Trim it first.`), l && n.minFps && (l < n.minFps || l > (n.maxFps ?? 1 / 0)) && i.push(`${e} takes ${t} at ${n.minFps}-${n.maxFps} fps; ${a.name} is ${l} fps.`), m && n.maxBytes && m > n.maxBytes && i.push(
    `${e} takes ${t} up to ${Math.round(n.maxBytes / 1048576)} MB; ${a.name} is ${(m / 1048576).toFixed(1)} MB.${u ? " Save it as a JPEG or at a smaller size." : ""}`
  ), i;
}
const qt = (e) => e.reduce((t, a) => t === void 0 || a.info?.seconds === void 0 ? void 0 : t + a.info.seconds, 0);
function Ka(e, t, a, n, i = !1) {
  const s = t.sharedSeconds?.max, o = qt(a), r = qt(n);
  if (s === void 0 || !n.length || o === void 0 || r === void 0 || o + r <= s) return { drop: !1 };
  const d = (l) => `${Math.round(l * 100) / 100} s`;
  return i ? {
    drop: !1,
    problem: `${e} takes reference video and audio up to ${s} s together; got ${d(o)} of video and ${d(r)} of audio, and the audio is required. Use a guide of ${d(Math.max(0, s - r))} or less, or allow the lane to run without the separate audio.`
  } : {
    drop: !0,
    note: `Music not sent to ${e}: video and audio together may not exceed ${s} s; timing comes from the guide video (${d(o)} of video, ${d(r)} of audio).`
  };
}
function li(e, t) {
  const a = t.modelName, n = { referenceVideos: [], referenceAudios: [], referenceImages: [], frameImages: [], notes: [] }, i = [], { guideVideo: s, firstFrame: o, character: r, environment: d, audio: l, keyframes: m = [] } = t, u = (p) => i.push(p);
  if (e.approach === "reference-video" || e.approach === "router") {
    !s && e.approach === "reference-video" && u(`${a} is a reference-video lane; pass the guide clip.`), s && (!e.referenceVideos && e.approach === "reference-video" ? u(`${a} takes no reference video.`) : (e.referenceVideos && i.push(...Fe(a, "reference videos", s, e.referenceVideos)), n.referenceVideos.push(s))), r && (e.referenceImages ? (i.push(...Fe(a, "reference images", r, e.referenceImages)), n.referenceImages.push(r)) : u(`${a} takes no reference image for the character.`)), d && (e.referenceImages ? (i.push(...Fe(a, "reference images", d, e.referenceImages)), n.referenceImages.push(d)) : u(`${a} takes no reference image for the environment.`)), o && (e.startFrameWithReferences && e.frameImages ? n.frameImages.push({ media: o, frame: "first" }) : e.referenceImages ? (n.referenceImages.push(o), n.notes.push(
      `${a} refuses a start frame beside reference videos, so the first frame goes in as an image reference.`
    )) : u(`${a} cannot take the first frame with a reference video.`)), l && (e.referenceAudios ? (i.push(...Fe(a, "reference audio", l, e.referenceAudios)), n.referenceAudios.push(l)) : u(`${a} takes no reference audio; drop --audio for this lane.`));
    const p = Ka(a, e, n.referenceVideos, n.referenceAudios, t.requireAudio);
    p.problem && u(p.problem), p.drop && (n.referenceAudios = [], n.notes.push(p.note)), m.length && u(`${a} is fed the whole clip; keyframes belong to the FLUX 3 Video lane.`);
  } else if (e.approach === "audio-first-frame")
    r && u(`${a} takes no character reference beside a guide; pass the still as --first-frame instead.`), d && u(`${a} takes one image only; pass the environment still as --first-frame instead.`), s && u(`${a} takes no reference video. Pass --audio and --first-frame instead of --guide.`), m.length && u(`${a} takes a first frame (and optionally a last), not keyframes.`), l ? e.drivingAudio ? (o || u(`${a} needs a reference image beside the audio; pass --first-frame.`), i.push(...Fe(a, "audio", l, e.drivingAudio)), n.drivingAudio = l, o && (n.referenceImages.push(o), n.notes.push(
      `${a} with audio takes the still as inputs.referenceImages (its schema forbids frameImages beside audio); the clip length follows the audio.`
    ))) : u(`${a} takes no audio input.`) : o ? n.frameImages.push({ media: o, frame: "first" }) : u(`${a} needs --first-frame (and --audio for the audio-driven mode).`);
  else {
    s && u(`${a} uses its video input only to extend a clip; send keyframes or a first frame instead.`), l && u(`${a} takes no audio input.`), (r || d) && u(`${a} takes no reference images; pass the still as --first-frame instead.`), o && n.frameImages.push({ media: o, frame: "first" });
    for (const p of m)
      typeof p.frame == "number" && !e.frameImages?.indexPositions && u(`${a} only places frames first or last.`), n.frameImages.push(p);
    n.frameImages.length || u(`${a} needs --first-frame or keyframes.`);
  }
  if (e.frameImages && n.frameImages.length > e.frameImages.max && u(`${a} takes at most ${e.frameImages.max} frame images; got ${n.frameImages.length}.`), e.referenceImages && n.referenceImages.length > e.referenceImages.max && u(`${a} takes at most ${e.referenceImages.max} reference images.`), i.length) throw new Ba(i.join(`
`));
  return n;
}
const Ie = (e) => `https://runware.ai/docs/models/${e}/schema.json`, le = { max: 10, minSide: 300, maxBytes: 31457280, minRatio: 0.4, maxRatio: 2.5 }, Be = {
  key: "kling-4",
  air: "klingai:kling-video@4.0",
  slug: "klingai-video-4-0",
  name: "Kling VIDEO 4.0",
  caps: {
    approach: "reference-video",
    // x-constraints: each 700-4553 px, 24-60 fps, 3-30 s, <=300 MB; total <=30 s; <=5 videos.
    referenceVideos: {
      max: 5,
      minSeconds: 3,
      maxSeconds: 30,
      totalMaxSeconds: 30,
      minSide: 700,
      maxSide: 4553,
      minFps: 24,
      maxFps: 60,
      maxBytes: 314572800,
      minRatio: 0.4,
      maxRatio: 2.5
    },
    referenceImages: le,
    frameImages: { ...le, indexPositions: !1 },
    // x-modes lists first-frame+reference-videos.
    startFrameWithReferences: !0
  },
  prompt: { min: 1, max: 26e3, tokens: "<<<video_1>>>, <<<image_1>>> (images numbered across frameImages then referenceImages)" },
  duration: { kind: "range", min: 3, max: 30, auto: !1 },
  resolutions: ["720p", "1080p"],
  defaultResolution: "720p",
  rates: [
    { usdPerSecond: 0.157, label: "720p · No video input", resolution: "720p", videoInput: !1 },
    { usdPerSecond: 0.235, label: "1080p · No video input", resolution: "1080p", videoInput: !1 },
    { usdPerSecond: 0.188, label: "720p · Video input", resolution: "720p", videoInput: !0 },
    { usdPerSecond: 0.282, label: "1080p · Video input", resolution: "1080p", videoInput: !0 }
  ],
  schemaUrl: Ie("klingai-video-4-0")
}, lt = ae.inputs.referenceVideos.limits, ui = {
  ...Be,
  key: ae.id,
  air: ae.air,
  slug: ae.slug,
  name: ae.name,
  caps: {
    ...Be.caps,
    referenceVideos: {
      ...Be.caps.referenceVideos,
      minSeconds: lt.secondsEach.min,
      maxSeconds: lt.secondsEach.max,
      totalMaxSeconds: lt.secondsTotalMax
    },
    frameImages: { ...le, max: ae.inputs.firstFrame.maxCount, indexPositions: !1 }
  },
  duration: { kind: "range", min: 3, max: 20, auto: !1 },
  resolutions: void 0,
  defaultResolution: "720p",
  rates: ae.pricing.rates.map((e) => ({
    usdPerSecond: e.usdPerSecond,
    label: e.label,
    resolution: e.tier,
    videoInput: e.mode === "video-input"
  })),
  schemaUrl: ae.sources.schema
}, mi = {
  key: "seedance-2.5",
  air: "bytedance:seedance@2.5",
  slug: "bytedance-seedance-2-5",
  name: "Seedance 2.5",
  caps: {
    approach: "reference-video",
    referenceVideos: {
      max: 10,
      minSeconds: 2,
      maxSeconds: 30,
      totalMaxSeconds: 30,
      minSide: 300,
      maxSide: 6e3,
      maxBytes: 209715200,
      minRatio: 0.4,
      maxRatio: 2.5
    },
    referenceAudios: { max: 10, minSeconds: 2, maxSeconds: 30, totalMaxSeconds: 30, maxBytes: 15728640 },
    referenceImages: { ...le, max: 30, maxSide: 6e3 },
    frameImages: { ...le, max: 2, maxSide: 6e3, indexPositions: !1 },
    // allOf: frameImages is forbidden beside referenceImages, referenceVideos or video.
    startFrameWithReferences: !1
  },
  prompt: { min: 2, max: 5e4, tokens: "@Video1, @Image1, @Audio1 (array order, from one)" },
  duration: { kind: "range", min: 4, max: 30, auto: !0 },
  resolutions: ["480p", "720p", "1080p"],
  defaultResolution: "720p",
  rates: [
    { usdPerSecond: 0.1025, label: "Text/Image to Video · 480p", resolution: "480p", videoInput: !1 },
    { usdPerSecond: 0.2304, label: "Text/Image to Video · 720p", resolution: "720p", videoInput: !1 },
    { usdPerSecond: 0.61354, label: "Text/Image to Video · 1080p", resolution: "1080p", videoInput: !1 },
    { usdPerSecond: 0.1313, label: "Video-to-Video · 480p", resolution: "480p", videoInput: !0 },
    { usdPerSecond: 0.2953, label: "Video-to-Video · 720p", resolution: "720p", videoInput: !0 },
    { usdPerSecond: 0.73415, label: "Video-to-Video · 1080p", resolution: "1080p", videoInput: !0 }
  ],
  schemaUrl: Ie("bytedance-seedance-2-5")
}, pi = {
  key: "h3",
  air: "minimax:h3@0",
  slug: "minimax-h3",
  name: "MiniMax H3",
  caps: {
    approach: "reference-video",
    // x-constraints: each 2-15 s, total 15 s, 256-5760 px, >=23.976 fps, <=50 MB.
    referenceVideos: {
      max: 3,
      minSeconds: 2,
      maxSeconds: 15,
      totalMaxSeconds: 15,
      minSide: 256,
      maxSide: 5760,
      minFps: 23.976,
      maxFps: 60,
      maxBytes: 52428800,
      minRatio: 0.4,
      maxRatio: 2.5
    },
    referenceAudios: { max: 3, minSeconds: 2, maxSeconds: 15, totalMaxSeconds: 15, maxBytes: 15728640 },
    referenceImages: { ...le, max: 9, minSide: 256, maxSide: 5760 },
    frameImages: { ...le, max: 2, minSide: 256, maxSide: 5760, indexPositions: !1 },
    // allOf: frameImages is forbidden beside any reference input.
    startFrameWithReferences: !1,
    // x-constraints: duration over inputs.referenceVideos + inputs.referenceAudios, maximum 15, no per-item scope.
    sharedSeconds: { max: 15 }
  },
  prompt: { min: 2, max: 7e3 },
  duration: { kind: "range", min: 4, max: 15, auto: !1 },
  resolutions: ["768p", "1440p"],
  defaultResolution: "768p",
  rates: [
    { usdPerSecond: 0.08, label: "768p", resolution: "768p" },
    { usdPerSecond: 0.13, label: "2K", resolution: "1440p" }
  ],
  inputVideoUsdPerSecond: 0.13,
  schemaUrl: Ie("minimax-h3")
}, hi = ["dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "static", "focus_shift"], bt = {
  key: "ltx-2.5",
  air: "lightricks:ltx@2.5-pro",
  slug: "lightricks-ltx-2-5-pro",
  name: "LTX-2.5 Pro",
  caps: {
    approach: "audio-first-frame",
    referenceImages: { max: 1 },
    frameImages: { max: 2, indexPositions: !1 },
    startFrameWithReferences: !1,
    // x-constraints: audio 2-10 s on Pro.
    drivingAudio: { max: 1, minSeconds: 2, maxSeconds: 10 }
  },
  prompt: { min: 2, max: 5e3 },
  duration: { kind: "enum", values: [6, 8, 10], auto: !0 },
  sizes: { "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 } },
  defaultResolution: "720p",
  cameraMovements: hi,
  rates: [
    { usdPerSecond: 0.12, label: "720p", resolution: "720p" },
    { usdPerSecond: 0.17, label: "1080p", resolution: "1080p" }
  ],
  schemaUrl: Ie("lightricks-ltx-2-5-pro")
}, fi = {
  ...bt,
  key: "ltx-2.5-fast",
  air: "lightricks:ltx@2.5-fast",
  slug: "lightricks-ltx-2-5-fast",
  name: "LTX-2.5 Fast",
  caps: { ...bt.caps, drivingAudio: { max: 1, minSeconds: 2, maxSeconds: 20 } },
  duration: { kind: "enum", values: [6, 8, 10, 12, 14, 16, 18, 20], auto: !0 },
  rates: [
    { usdPerSecond: 0.09, label: "720p", resolution: "720p" },
    { usdPerSecond: 0.13, label: "1080p", resolution: "1080p" }
  ],
  schemaUrl: Ie("lightricks-ltx-2-5-fast")
}, gi = {
  key: "flux-3-video",
  air: "bfl:flux@3-video",
  slug: "bfl-flux-3-video",
  name: "FLUX 3 Video",
  caps: {
    approach: "keyframes",
    frameImages: { max: 10, indexPositions: !0 },
    startFrameWithReferences: !1
  },
  // The schema states no prompt limit (the guides say 10,000 characters).
  prompt: { min: 1, max: 1 / 0 },
  duration: { kind: "range", min: 5, max: 20, auto: !0 },
  resolutions: ["720p", "1080p"],
  defaultResolution: "720p",
  rates: [
    { usdPerSecond: 0.17, label: "T2V & I2V. 720p", resolution: "720p" },
    { usdPerSecond: 0.29, label: "T2V & I2V · 1080p", resolution: "1080p" }
  ],
  schemaUrl: Ie("bfl-flux-3-video")
}, bi = {
  key: "auto",
  air: "auto",
  slug: "model-router",
  name: "Model Router",
  caps: {
    approach: "router",
    referenceVideos: { max: 10 },
    referenceImages: { max: 10 },
    referenceAudios: { max: 10 },
    startFrameWithReferences: !1
  },
  prompt: { min: 1, max: 5e4 },
  duration: { kind: "range", min: 1, max: 30, auto: !1 },
  rates: [],
  schemaUrl: "https://runware.ai/docs/models-api/model-router"
}, ea = [Be, ui, mi, pi, bt, fi, gi, bi];
function Tt(e) {
  const t = ea.find((a) => a.key === e || a.air === e || a.slug === e);
  if (!t) throw new Error(`Unknown model "${e}". Use one of: ${ea.map((a) => a.key).join(", ")}.`);
  return t;
}
const wi = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, _a = (e, t) => `{{upload:${e}:${t.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80)}}}`;
function yi() {
  return globalThis.crypto.randomUUID();
}
class v extends Error {
  constructor(t) {
    super(t), this.name = "PlanError";
  }
}
function vi(e, t) {
  if (t === "auto") {
    if (!e.duration.auto) throw new v(`${e.name} needs a whole number of seconds; "auto" is not in its schema.`);
    return;
  }
  if (!Number.isInteger(t)) throw new v(`Duration must be a whole number of seconds; got ${t}.`);
  if (e.duration.kind === "range" && (t < e.duration.min || t > e.duration.max))
    throw new v(`${e.name} makes ${e.duration.min}-${e.duration.max} s clips; got ${t}.`);
  if (e.duration.kind === "enum" && !e.duration.values.includes(t))
    throw new v(`${e.name} makes clips of ${e.duration.values.join(", ")} s only; got ${t}.`);
}
function xi(e, t, a) {
  const n = e.rates.filter((s) => s.resolution === t);
  return n.find((s) => s.videoInput === void 0 || s.videoInput === a) ?? n[0] ?? e.rates.reduce((s, o) => o.usdPerSecond > s.usdPerSecond ? o : s, e.rates[0]);
}
const $i = (e) => e.duration.kind === "range" ? e.duration.max : Math.max(...e.duration.values);
function ki(e, t) {
  if (e.key === "auto")
    return { usd: t.maxPrice ?? null, basis: "router: capped server-side by routing.maxPrice" };
  const a = t.seconds === "auto" ? $i(e) : t.seconds, n = xi(e, t.resolution, t.videoInput);
  let i = n.usdPerSecond * a, s = `${n.label} at $${n.usdPerSecond}/s × ${a} s${t.seconds === "auto" ? " (auto: bounded by the longest clip)" : ""}`;
  if (e.inputVideoUsdPerSecond && t.videoInput) {
    const o = t.inputVideoSeconds ?? e.caps.referenceVideos?.totalMaxSeconds ?? 15;
    i += e.inputVideoUsdPerSecond * o, s += ` + input video $${e.inputVideoUsdPerSecond}/s × ${o.toFixed(2)} s`;
  }
  return e.key === "h3" && (t.images ?? 0) > 5 && (i += 0.04 * ((t.images ?? 0) - 5), s += " + $0.04 per image beyond five"), { usd: Math.round(i * 1e4) / 1e4, basis: s };
}
function za(e, t = yi()) {
  const a = Tt(e.model), n = e.prompt.trim();
  if (n.length < a.prompt.min || n.length > a.prompt.max)
    throw new v(`${a.name} takes a prompt of ${a.prompt.min}-${a.prompt.max} characters.`);
  if (a.key === "auto" && !(e.routing && e.routing.maxPrice > 0))
    throw new v("The router lane needs a price cap (routing.maxPrice / --max-price).");
  let i;
  try {
    i = li(a.caps, {
      modelName: a.name,
      guideVideo: e.guideVideo,
      firstFrame: e.firstFrame,
      character: e.character,
      environment: e.environment,
      requireAudio: e.requireAudio,
      audio: e.audio,
      keyframes: e.keyframes
    });
  } catch (g) {
    throw g instanceof Ba ? new v(g.message) : g;
  }
  const s = [], o = [], r = (g, b, x) => {
    if (o.push({
      role: b,
      src: g.displaySrc ?? g.name,
      label: g.name,
      ...x !== void 0 ? { frame: x } : {}
    }), wi.test(g.ref) || /^https:\/\//.test(g.ref)) return g.ref;
    if (!/^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(g.ref))
      throw new v(`${g.name}: media must be an https URL, a media UUID or a data URI.`);
    const U = s.find((se) => se.media === g);
    if (U) return U.placeholder;
    const F = _a(s.length + 1, g.name);
    return s.push({ placeholder: F, media: g }), F;
  }, d = {};
  i.frameImages.length && (d.frameImages = i.frameImages.map((g) => ({ image: r(g.media, "frameImage", g.frame), frame: g.frame }))), i.referenceImages.length && (d.referenceImages = i.referenceImages.map((g) => r(g, "referenceImage"))), i.referenceVideos.length && (d.referenceVideos = i.referenceVideos.map((g) => r(g, "referenceVideo"))), i.referenceAudios.length && (d.referenceAudios = i.referenceAudios.map((g) => r(g, "referenceAudio"))), i.drivingAudio && (d.audio = r(i.drivingAudio, "audio"));
  const l = {
    taskType: "videoInference",
    taskUUID: t,
    model: a.air,
    positivePrompt: n
  }, m = !!i.drivingAudio, u = e.duration ?? (a.duration.kind === "range" ? Math.max(5, a.duration.min) : a.duration.values[0]);
  if (m) {
    if (e.duration !== void 0) throw new v(`${a.name} with audio takes its length from the audio; drop --duration.`);
  } else
    vi(a, u), l.duration = u;
  let p = e.resolution ?? a.defaultResolution;
  if (a.resolutions) {
    if (p && !a.resolutions.includes(p))
      throw new v(`${a.name} resolutions: ${a.resolutions.join(", ")}.`);
    p && (l.resolution = p);
  } else if (a.sizes)
    if (m) p = "1080p";
    else {
      const g = p ? a.sizes[p] : void 0;
      if (!g) throw new v(`${a.name} sizes: ${Object.keys(a.sizes).join(", ")}.`);
      l.width = g.width, l.height = g.height;
    }
  else if (a.key !== "auto") {
    if (e.resolution && e.resolution !== a.defaultResolution)
      throw new v(`${a.name} makes ${a.defaultResolution} only; the size follows the input.`);
  } else if (e.resolution) throw new v(`${a.name}: resolution is not set on the router lane; describe it in --requirements.`);
  if (Object.keys(d).length && (l.inputs = d), e.camera !== void 0) {
    if (!a.cameraMovements)
      throw new v(`${a.name} declares no camera parameter in its schema; describe the camera in the prompt.`);
    if (!a.cameraMovements.includes(e.camera))
      throw new v(`${a.name} camera movements: ${a.cameraMovements.join(", ")}.`);
    if (m) throw new v(`${a.name} forbids cameraMovement beside audio.`);
    l.settings = { cameraMovement: e.camera };
  }
  if (a.key === "auto" && e.routing) {
    const g = { maxPrice: e.routing.maxPrice };
    if (e.routing.requirements) {
      if (e.routing.requirements.length > 3e3) throw new v("routing.requirements is limited to 3000 characters.");
      g.requirements = e.routing.requirements;
    }
    e.routing.preferences && (g.preferences = e.routing.preferences), l.routing = g;
  }
  l.deliveryMethod = "async", l.includeCost = !0;
  const f = i.referenceVideos.length > 0, w = ki(a, {
    resolution: p,
    seconds: m ? i.drivingAudio?.info?.seconds ?? a.caps.drivingAudio?.maxSeconds ?? 10 : u,
    videoInput: f,
    inputVideoSeconds: i.referenceVideos.reduce(
      (g, b) => b.info?.seconds === void 0 || g === void 0 ? void 0 : g + b.info.seconds,
      0
    ),
    images: i.referenceImages.length + i.frameImages.length,
    maxPrice: e.routing?.maxPrice
  }), h = [...i.notes];
  return a.prompt.tokens && h.push(`${a.name} prompt tokens for inputs: ${a.prompt.tokens}.`), {
    provider: "runware-api",
    modelId: a.air,
    modelName: a.name,
    uploads: s,
    task: l,
    inputsSent: o,
    firstFrameVariant: e.firstFrame ? e.firstFrameVariant ?? "A" : "C",
    estimate: w,
    notes: h
  };
}
function Wa(e, t) {
  const a = JSON.stringify(e).replace(/\{\{upload:\d+:[^}]*\}\}/g, (n) => {
    const i = t.get(n);
    if (!i) throw new Error(`No media id for ${n}.`);
    return i;
  });
  return JSON.parse(a);
}
const ve = ["kling-4", "seedance-2.5", "h3", "ltx-2.5"], Si = ["kling-4", "seedance-2.5", "h3"], ut = (e, t) => e && (e.min !== null || e.max !== null) ? `${e.min ?? 0}-${e.max ?? "any"} ${t}` : null, mt = (e, t, a) => {
  const n = e.prompting.addressing.tokens.find((i) => i.input === t);
  return n ? ` ${n.pattern.replace("{n}", String(a))}` : "";
};
function Ii(e, t) {
  if (t === "audio-first-frame") {
    const d = ut(e.inputs.audioToVideo.limits?.secondsEach, "s");
    return `Audio + first frame only: does not use the guide video. Takes the guide's audio${d ? ` (${d})` : ""} and exactly one image: frame 0, your character sheet or your environment image, not both. The clip runs as long as the audio.`;
  }
  const a = e.inputs.referenceVideos.limits, n = [ut(a?.secondsEach, "s"), a?.sidePx?.min ? `${a.sidePx.min}+ px a side` : null, ut(a?.fps, "fps")].filter(Boolean).join(", "), i = Tt(e.id).caps.sharedSeconds?.max, s = e.inputs.referenceAudios.supported ? `its audio as reference audio${i ? ` when clip and audio fit ${i} s together` : ""}` : "no audio input", o = e.inputs.referenceImages, r = o.supported ? `; up to ${o.maxCount ?? "several"} reference images beside it: character sheet${mt(e, "image", 1)}, environment${mt(e, "image", 2)}` : "; no reference images";
  return `The whole guide clip as a reference video${mt(e, "video", 1)} (${n}); ${s}${r}.`;
}
function Ei(e) {
  const t = e.sources.guides;
  return t.find((a) => /prompt/i.test(a.title)) ?? t[0] ?? { title: "Model page", url: e.sources.model };
}
function Rt(e) {
  if (!ve.includes(e))
    throw new v(`The generate flow offers ${ve.join(", ")}; "${e}" is not one of them.`);
  const t = Da(e), a = t.inputs.referenceVideos.supported ? "guide-video" : "audio-first-frame";
  return { key: e, name: t.name, use: a, line: Ii(t, a), guide: Ei(t) };
}
const Ha = () => ve.map(Rt);
function Pi(e, t, a) {
  const n = Rt(t), i = [], s = [];
  if (n.use === "guide-video") {
    s.push({ id: "guide", kind: "video", role: "motion" }), a.hasCharacter && s.push({ id: "character", kind: "image", role: "character", replaces: "the figure in the guide" }), a.hasEnvironment && s.push({ id: "environment", kind: "image", role: "setting", replaces: "the guide's background" });
    const r = a.hasAudio ? Ka(n.name, Tt(n.key).caps, [{ name: "guide", info: { seconds: a.seconds, hasAudio: a.audioInVideo } }], [{ name: "audio", info: { seconds: a.audioSeconds ?? a.seconds } }], a.requireAudio) : { drop: !1 };
    if (r.problem) throw new v(r.problem);
    r.drop ? i.push(r.note) : a.hasAudio && s.push({ id: "audio", kind: "audio", role: "soundtrack" });
  } else {
    if (a.hasCharacter && a.hasEnvironment)
      throw new v(`${n.name} takes exactly one image beside the audio: send the character sheet or the environment image, not both.`);
    s.push({ id: a.hasCharacter ? "character" : a.hasEnvironment ? "environment" : "frame0", kind: "image", role: "first-frame" }), a.hasAudio && s.push({ id: "audio", kind: "audio", role: "soundtrack" });
  }
  return { shot: {
    subject: e.subject,
    action: e.action,
    ...e.environment ? { environment: e.environment } : {},
    ...e.legend ? { legend: e.legend } : {},
    // With no camera named, the guide video carries it (and LTX, without one, gets no camera words).
    camera: e.camera ?? "guide",
    references: s,
    duration: Math.max(1, Math.round(a.seconds))
  }, notes: i };
}
function Qe(e, t, a) {
  const n = Rt(t), { shot: i, notes: s } = Pi(e, t, a), o = ci(t, i, n.use === "audio-first-frame" ? { prefer: "inputs" } : {});
  return { model: n, composed: o, shot: i, notes: s };
}
const Ai = (e, t, a = Si) => a.map((n) => Qe(e, n, t));
function xo(e, t, a = {}, n = {}) {
  const i = "manifest" in n ? n : void 0, s = {
    seconds: i ? i.seconds : n.seconds ?? 5,
    hasAudio: i ? !!i.audio : n.hasAudio ?? !0,
    audioInVideo: i ? i.meta.audioInVideo === !0 : n.audioInVideo,
    hasCharacter: !!a.character,
    hasEnvironment: !!a.environment
  }, o = Qe(e, t, s);
  return {
    model: o.model,
    prompt: o.composed.prompt,
    tags: o.composed.used.filter((r) => r.address).map((r) => ({ tag: r.address, input: r.ref })),
    dropped: o.composed.dropped.map((r) => `${r.ref}: ${r.reason}`),
    notes: [...o.notes, ...o.composed.notes],
    shot: o.shot
  };
}
const $o = () => Ha();
function Xa(e, t) {
  const { guide: a, character: n, environment: i } = e, s = e.prompt?.trim() || void 0, o = e.shot ?? a.shot ?? (s ? { subject: s, action: "" } : void 0);
  if (!o || !o.subject.trim()) throw new v("Describe the shot (subject and action), or write a prompt.");
  const r = { seconds: a.seconds, hasAudio: !!a.audio, hasCharacter: !!n, hasEnvironment: !!i, audioInVideo: a.meta.audioInVideo === !0, audioSeconds: a.audio?.info?.seconds, requireAudio: e.requireAudio }, { model: d, composed: l, shot: m, notes: u } = Qe(o, e.model, r);
  if (d.use === "audio-first-frame" && !a.audio)
    throw new v(`${d.name} is driven by the guide's audio, and this bundle has no audio file.`);
  const p = { guide: a.video, audio: a.audio, character: n, environment: i, frame0: a.firstFrame }, f = { model: d.key, prompt: s ?? l.prompt };
  for (const g of l.used) {
    const b = p[g.ref];
    b && (g.role === "motion" ? f.guideVideo = b : g.role === "soundtrack" ? f.audio = b : g.role === "character" ? f.character = b : g.role === "setting" ? f.environment = b : g.role === "first-frame" && (f.firstFrame = b, f.firstFrameVariant = g.ref === "frame0" ? "A" : "B"));
  }
  typeof l.params.duration == "number" && (f.duration = l.params.duration);
  const w = l.params["settings.cameraMovement"];
  typeof w == "string" && (f.camera = w), e.resolution && (f.resolution = e.resolution), e.requireAudio && (f.requireAudio = !0);
  const h = za(f, t);
  return {
    plan: h,
    request: f,
    composed: l,
    shot: m,
    ...s ? {} : { marker: An(l) },
    model: d,
    notes: [...u, ...l.notes, ...h.notes]
  };
}
function Ui(e) {
  const t = typeof e == "string" ? Number(e) : e;
  return typeof t == "number" && Number.isFinite(t) && t >= 0 ? t : null;
}
const Ti = (e) => new Promise((t) => setTimeout(t, e));
function Ri(e, t, a, n = "videoURL") {
  const i = a.filter((l) => l.taskUUID === e || !l.taskUUID);
  if (i.length) return { state: "error", error: new ne(200, i) };
  const s = t.filter((l) => l.taskUUID === e), o = s.find((l) => l.status === "success" || typeof l[n] == "string");
  if (o && typeof o[n] == "string")
    return {
      state: "success",
      result: {
        taskUUID: e,
        videoURL: o[n],
        ...typeof o.videoUUID == "string" ? { videoUUID: o.videoUUID } : {},
        cost: Ui(o.cost),
        ...typeof o.seed == "number" ? { seed: o.seed } : {},
        ...typeof o.model == "string" ? { model: o.model } : {}
      }
    };
  const r = s.find((l) => l.status === "error");
  if (r) {
    const l = r.error ?? {};
    return {
      state: "error",
      error: new ne(200, [{ code: l.code ?? "error", message: l.message ?? "Task failed.", taskUUID: e }])
    };
  }
  const d = s.find((l) => l.status === "processing");
  return d ? { state: "processing", progress: typeof d.progress == "number" ? d.progress : void 0 } : { state: "absent" };
}
async function Ja(e, t, a = {}) {
  const n = a.sleep ?? Ti, i = a.now ?? Date.now, s = a.timeoutMs ?? 45 * 6e4, o = i();
  let r = a.intervalMs ?? 2e3;
  const d = a.maxIntervalMs ?? 15e3;
  for (await n(a.initialDelayMs ?? 5e3); ; ) {
    if (a.signal?.aborted) throw new Error(`Stopped polling. Resume with taskUUID ${t}.`);
    const { data: l, errors: m } = await e.post([{ taskType: "getResponse", taskUUID: t }], a.signal), u = Ri(t, l, m, a.urlField);
    if (u.state === "success") return u.result;
    if (u.state === "error") throw u.error;
    if (a.onProgress?.(u.state, u.state === "processing" ? u.progress : void 0), i() - o > s)
      throw new Error(`Still running after ${Math.round(s / 6e4)} min. Resume with taskUUID ${t}; do not resubmit.`);
    await n(r), r = Math.min(d, Math.round(r * 1.5));
  }
}
async function Mi(e, t, a = {}) {
  const n = await Ja(e, t, { initialDelayMs: 1500, timeoutMs: 6e5, ...a, urlField: "imageURL" });
  return { taskUUID: t, imageURL: n.videoURL, cost: n.cost, ...n.seed !== void 0 ? { seed: n.seed } : {} };
}
async function Fi(e, t, a, n, i) {
  if (n && n !== "auto") return n;
  if (t.modelId !== "auto") return t.modelId;
  try {
    const s = await e.taskDetails(a, i), o = Array.isArray(s?.request) ? s.request : [], r = o.find((d) => d.taskUUID === a)?.model ?? o[0]?.model;
    return typeof r == "string" && r !== "auto" ? r : null;
  } catch {
    return null;
  }
}
function Li(e) {
  const t = new Ke({ getKey: e.getKey, fetch: e.fetch });
  async function a(n, i, s, o) {
    const r = String(i.taskUUID), d = await Ja(t, r, {
      ...e.poll,
      signal: o.signal,
      onProgress: (m, u) => o.onProgress?.({ stage: "poll", message: m, progress: u })
    }), l = await Fi(t, n, r, d.model, o.signal);
    return o.onProgress?.({ stage: "done", message: "done" }), {
      taskUUID: r,
      videoURL: d.videoURL,
      costUsd: d.cost,
      generationSeconds: (Date.now() - s) / 1e3,
      modelRan: l,
      task: i
    };
  }
  return {
    id: "runware-api",
    client: t,
    plan: (n) => za(n),
    async run(n, i = {}) {
      const s = Date.now(), o = /* @__PURE__ */ new Map();
      for (const m of n.uploads) {
        i.onProgress?.({ stage: "upload", message: `uploading ${m.media.name}` });
        const { mediaUUID: u } = await t.upload(m.media.ref, i.signal);
        o.set(m.placeholder, u);
      }
      const r = Wa(n.task, o);
      i.onProgress?.({ stage: "submit", message: "submitting" });
      const { errors: d } = await t.post([r], i.signal), l = d.filter((m) => !m.taskUUID || m.taskUUID === r.taskUUID);
      if (l.length) throw new ne(400, l);
      return a(n, r, s, i);
    },
    /** Polls an already-submitted task without sending it again. */
    resume(n, i, s = {}) {
      return a(n, { ...n.task, taskUUID: i }, Date.now(), s);
    }
  };
}
class P extends Error {
  constructor(t, a, n) {
    super(a), this.code = t, this.taskUUID = n, this.name = "GenerateError";
  }
  code;
  taskUUID;
}
const ji = /^[\x21-\x7e]{16,512}$/, Ci = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }, Vi = (e) => typeof e == "object" && e !== null && "manifest" in e && "video" in e, Oi = ["image/png", "image/jpeg", "image/webp"], Ni = 30 * 1048576;
async function wt(e, t) {
  if (!e) return;
  const a = e instanceof Blob ? e : e.blob;
  if (!(a instanceof Blob)) throw new P("refused", `The ${t} reference must be an image Blob.`);
  if (!Oi.includes(a.type)) throw new P("refused", `The ${t} image must be PNG, JPEG or WebP; got ${a.type || "an unknown type"}.`);
  if (a.size > Ni) throw new P("refused", `The ${t} image is over 30 MB.`);
  let i = ((e instanceof Blob ? e.name : e.name ?? e.blob.name) || t).split(/[\\/]/).pop();
  je(i) !== a.type && (i = `${i.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${Ci[a.type]}`);
  const s = e instanceof Blob ? void 0 : e.src;
  try {
    return await Fa(ze(a, i), s && /^https?:\/\//.test(s) ? s : void 0);
  } catch (o) {
    throw new P("refused", `The ${t} image: ${o.message}`);
  }
}
function ze(e, t) {
  return { name: t, size: e.size, bytes: async () => new Uint8Array(await e.arrayBuffer()) };
}
function Ya(e) {
  const t = typeof e[Symbol.iterator] == "function" || "length" in e ? Array.from(e) : [];
  return t.length ? t.map((a, n) => ze(a, a.name ?? `file-${n}`)) : Object.entries(e).map(([a, n]) => ze(n, a));
}
function Za(e, t, a, n) {
  if (e instanceof P) return e;
  const i = n(e?.message ?? String(e)), s = a ? ` The task was already submitted and may still finish and be billed (taskUUID ${a}); do not resubmit.` : " Nothing was submitted.";
  return t?.aborted || e?.name === "AbortError" || i.startsWith("Stopped polling") ? new P("aborted", `Stopped.${s}`, a) : i.startsWith("Still running after") ? new P("timeout", i, a) : e instanceof K ? new P("bad-bundle", i) : e instanceof v ? new P("refused", i) : e instanceof ne && (e.status === 401 || e.status === 403 || e.errors.some((r) => /key|auth/i.test(r.code))) || /No Runware API key|does not look like a Runware API key/.test(i) ? new P("invalid-key", "The key was refused. Check it in the key panel; it is sent only to api.runware.ai.") : new P("provider", i, a);
}
async function Di(e) {
  const t = e.key, a = typeof t == "function" ? t : typeof t == "string" ? () => t : () => t.getKey(), n = Li({
    getKey: a,
    fetch: e.fetch,
    poll: { timeoutMs: 20 * 6e4, ...e.poll }
  }), i = (r) => n.client.redact(r), s = (r) => e.onProgress?.(r);
  let o;
  try {
    if (!(typeof e.maxPrice == "number" && Number.isFinite(e.maxPrice) && e.maxPrice > 0 && e.maxPrice <= 100))
      throw new P("refused", "maxPrice must be a positive number of USD up to 100.");
    const r = a();
    if (!r || !ji.test(r)) throw new P("invalid-key", "Connect a Runware API key first (16-512 characters, no spaces).");
    s({ stage: "plan", message: "reading the guide" });
    const d = Vi(e.guide) ? e.guide : await ja(Ya(e.guide)), l = await wt(e.references?.character, "character"), m = await wt(e.references?.environment, "environment"), u = Xa({ guide: d, model: e.model, shot: e.shot, prompt: e.prompt, character: l, environment: m, resolution: e.resolution, requireAudio: e.requireAudio }, e.taskUUID), { plan: p } = u;
    if (p.estimate.usd === null) throw new P("no-estimate", `No price estimate for ${p.modelName}; it cannot be checked against maxPrice.`);
    if (p.estimate.usd > e.maxPrice)
      throw new P("over-price", `Estimated $${p.estimate.usd.toFixed(2)} (${p.estimate.basis}) is over your cap of $${e.maxPrice.toFixed(2)}.`);
    if (s({ stage: "confirm", message: `estimated $${p.estimate.usd.toFixed(2)}` }), !await e.confirm({
      model: p.modelId,
      modelName: p.modelName,
      usd: p.estimate.usd,
      basis: p.estimate.basis,
      maxPrice: e.maxPrice,
      inputs: p.inputsSent,
      prompt: u.request.prompt
    })) throw new P("not-confirmed", "Not confirmed; nothing was sent.");
    if (e.signal?.aborted) throw new P("aborted", "Stopped. Nothing was submitted.");
    const w = await n.run(p, {
      signal: e.signal,
      onProgress: (F) => {
        (F.stage === "submit" || F.stage === "poll") && (o = String(p.task.taskUUID)), s(F);
      }
    }), h = xn(e.laneId ?? "lane-1", p, u.request, w, w.videoURL);
    u.marker && (h.composed = u.marker, h.shot = u.shot);
    const g = (/* @__PURE__ */ new Date()).toISOString(), b = {
      schemaVersion: 1,
      id: `gen-${w.taskUUID.slice(0, 8).toLowerCase()}`,
      title: `${p.modelName}: ${(u.shot.subject || u.request.prompt).slice(0, 80)}`,
      createdAt: g,
      guide: d.guide,
      lanes: [h],
      ...u.marker ? { shot: u.shot } : {}
    }, x = {
      date: g.slice(0, 10),
      model: p.modelId,
      modelRan: w.modelRan,
      taskUUID: w.taskUUID,
      duration: String(u.request.duration ?? "audio length"),
      resolution: Ea(p.task),
      inputs: p.inputsSent.map((F) => F.role).join("+"),
      estimateUsd: p.estimate.usd,
      costUsd: w.costUsd,
      seconds: w.generationSeconds,
      output: w.videoURL,
      status: "ok (browser)"
    }, U = [...u.notes];
    return w.costUsd !== null && w.costUsd > e.maxPrice && U.push(`Reported cost $${w.costUsd} is over the cap of $${e.maxPrice}.`), s({ stage: "done", message: "done" }), {
      videoURL: w.videoURL,
      costUsd: w.costUsd,
      generationSeconds: w.generationSeconds,
      taskUUID: w.taskUUID,
      modelRan: w.modelRan,
      estimate: p.estimate,
      inputsSent: p.inputsSent,
      lane: h,
      record: b,
      costRow: x,
      costRowText: Ia(x),
      notes: U,
      task: w.task
    };
  } catch (r) {
    throw Za(r, e.signal, o, i);
  }
}
function c(e, t = {}, ...a) {
  const n = document.createElement(e);
  for (const [i, s] of Object.entries(t)) n.setAttribute(i, s);
  for (const i of a) i != null && n.append(i);
  return n;
}
function X(e, t) {
  try {
    const a = new URL(e, t);
    return a.protocol === "https:" || a.protocol === "http:" || a.protocol === "blob:" ? a.href : a.protocol === "data:" && /^data:(image|video|audio)\//.test(e) ? e : null;
  } catch {
    return null;
  }
}
const Gi = {
  A: "A · raw frame 0",
  B: "B · restyled still",
  C: "C · none"
}, Bi = {
  referenceVideo: "reference video",
  referenceImage: "reference image",
  referenceAudio: "reference audio",
  frameImage: "frame image",
  audio: "audio",
  video: "video"
}, J = (e) => e === null ? "not recorded" : `$${e.toFixed(e < 1 ? 3 : 2)}`, qe = (e) => e == null ? "not recorded" : `${e.toFixed(1)} s`;
function Ki(e, t) {
  const a = X(e.src, t), n = e.role === "referenceImage" || e.role === "frameImage", i = e.role === "referenceVideo" || e.role === "video";
  let s;
  if (a && n) s = c("img", { src: a, alt: e.label ?? e.role, loading: "lazy" });
  else if (a && i) {
    const r = c("video", { src: a, muted: "", playsinline: "", preload: "metadata", "aria-label": e.label ?? e.role });
    r.muted = !0, s = r;
  } else s = c("div", { class: "ph" }, e.role.includes("udio") ? "audio" : "media");
  const o = `${Bi[e.role]}${e.frame !== void 0 ? ` @ ${e.frame}` : ""}`;
  return c("div", { class: "input", title: e.label ?? e.src }, s, c("span", {}, o));
}
function _i(e) {
  const t = c("button", { class: "small", type: "button" }, "Copy prompt");
  return t.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(e), t.textContent = "Copied";
    } catch {
      t.textContent = "Select and copy";
    }
    setTimeout(() => t.textContent = "Copy prompt", 1500);
  }), t;
}
function zi(e, t, a) {
  const n = c("button", { class: "small", type: "button", "aria-pressed": "false" }, "Play alone");
  n.addEventListener("click", a);
  const s = [
    ["Model ran", e.modelRan ?? (e.status === "placeholder" ? "nothing ran (placeholder)" : "not reported by the provider")],
    ["First frame", Gi[e.firstFrameVariant]],
    ["Cost", J(e.costUsd)],
    ["Seconds", qe(e.generationSeconds)]
  ];
  e.durationSeconds !== void 0 && s.push(["Clip length", e.durationSeconds === "auto" ? "auto" : `${e.durationSeconds} s asked`]), e.routing && s.push([
    "Routing",
    [e.routing.maxPrice !== void 0 ? `cap $${e.routing.maxPrice}` : "", e.routing.requirements ?? ""].filter(Boolean).join(" · ")
  ]);
  const o = c("dl");
  for (const [l, m] of s) o.append(c("dt", {}, l), c("dd", {}, m));
  const r = e.inputsSent.length ? c("div", { class: "inputs" }, ...e.inputsSent.map((l) => Ki(l, t))) : c("div", { class: "note" }, "Inputs sent: prompt only");
  return { node: c(
    "div",
    { class: "caption" },
    c(
      "div",
      { class: "row" },
      c("span", { class: "model" }, e.label ?? e.modelName ?? e.model),
      c("span", { class: "id" }, `${e.provider} · ${e.model}`)
    ),
    e.prompt ? c("div", { class: "prompt" }, c("pre", {}, e.prompt), c("div", { class: "row" }, _i(e.prompt), n)) : c("div", { class: "row" }, n),
    c("div", {}, c("div", { class: "id" }, "Inputs sent"), r),
    o,
    e.note ? c("div", { class: "note" }, e.note) : null
  ), solo: n };
}
const De = "model-arena:runware-key";
class Wi {
  constructor(t = Hi()) {
    this.storage = t;
    try {
      this.key = this.storage?.getItem(De) ?? void 0;
    } catch {
      this.key = void 0;
    }
  }
  storage;
  key;
  get = () => this.key;
  set(t, a = "memory") {
    this.key = t.trim() || void 0;
    try {
      a === "session" && this.key ? this.storage?.setItem(De, this.key) : this.storage?.removeItem(De);
    } catch {
    }
  }
  clear() {
    this.key = void 0;
    try {
      this.storage?.removeItem(De);
    } catch {
    }
  }
}
function Hi() {
  try {
    return typeof sessionStorage > "u" ? void 0 : sessionStorage;
  } catch {
    return;
  }
}
const Xi = `
  --ma-bg: #18181b; --ma-card: #1f1f23; --ma-fg: #f4f4f5; --ma-muted: #a1a1aa;
  --ma-line: #3f3f46; --ma-input: #27272a; --ma-chip: #2e2e33;
  --ma-accent: #e4e4e7; --ma-accent-fg: #18181b; --ma-warn: #fbbf24; --ma-ok: #86efac;`, ta = `
  --ma-bg: #ffffff; --ma-card: #f7f7f8; --ma-fg: #18181b; --ma-muted: #52525b;
  --ma-line: #d4d4d8; --ma-input: #efeff1; --ma-chip: #e7e7ea;
  --ma-accent: #27272a; --ma-accent-fg: #ffffff; --ma-warn: #9a5800; --ma-ok: #166534;`, Ji = `
  --ma-radius: 7px; --ma-radius-lg: 12px; --ma-gap: 8px;
  --ma-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --ma-mono: ui-monospace, SFMono-Regular, Menlo, monospace;`, et = (
  /* css */
  `
:host {${Xi}${Ji} }
:host([theme="light"]) {${ta} }
@media (prefers-color-scheme: light) { :host([theme="auto"]) {${ta} } }
`
), Yi = [
  "--ma-bg",
  "--ma-card",
  "--ma-fg",
  "--ma-muted",
  "--ma-line",
  "--ma-input",
  "--ma-chip",
  "--ma-accent",
  "--ma-accent-fg",
  "--ma-warn",
  "--ma-ok",
  "--ma-radius",
  "--ma-radius-lg",
  "--ma-gap",
  "--ma-font",
  "--ma-mono"
], Zi = /^[\x21-\x7e]{16,512}$/, aa = "https://runware.ai/";
function na(e) {
  return e ? /\s/.test(e) ? "A key has no spaces or line breaks." : e.length < 16 ? "That is too short for an API key." : e.length > 512 ? "That is too long for an API key." : Zi.test(e) ? null : "A key uses plain printable characters only." : "Paste your key first.";
}
const ia = (
  /* css */
  `
${et}
:host { display: block; color: var(--ma-fg); font: 400 14px/1.5 var(--ma-font); }
* { box-sizing: border-box; }
.panel { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-bg); }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
label.field { display: grid; gap: 4px; flex: 1 1 220px; min-width: 0; }
.lbl { font-size: 12px; color: var(--ma-muted); }
input[type="password"] { width: 100%; min-width: 0; font: 13px var(--ma-mono); color: var(--ma-fg); background: var(--ma-input); border: 1px solid var(--ma-line); border-radius: var(--ma-radius); padding: 6px 8px; min-height: 34px; }
button { font: inherit; cursor: pointer; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-input); color: var(--ma-fg); padding: 4px 12px; min-height: 34px; }
button.primary { background: var(--ma-accent); color: var(--ma-accent-fg); border-color: var(--ma-accent); font-weight: 600; }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--ma-accent); outline-offset: 2px; }
.note { font-size: 12px; color: var(--ma-muted); margin: 0; }
.err { font-size: 13px; color: var(--ma-warn); margin: 0; }
.err:empty { display: none; }
.state { font-weight: 600; }
.balance { font: 13px var(--ma-mono); }
.balance:empty { display: none; }
.state::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: var(--ma-ok); }
a { color: var(--ma-fg); }
`
);
class Qi extends HTMLElement {
  static observedAttributes = ["signup-url"];
  store;
  root;
  remembered = !1;
  balanceUsd = null;
  balanceNote = "";
  asked = 0;
  /** Test seam: the fetch the balance call uses. */
  fetch;
  constructor() {
    super(), this.root = this.attachShadow({ mode: "open" }), this.store = new Wi();
    const t = this.store.get();
    t && na(t) && this.store.clear(), this.remembered = !!this.store.get();
  }
  connectedCallback() {
    this.render(), this.connected && this.balanceUsd === null && this.refreshBalance();
  }
  /** The balance last read from Runware, in USD; null until known. */
  get balance() {
    return this.balanceUsd;
  }
  /** Reads the balance again. Resolves to the number, or null when it cannot be read. */
  async refreshBalance() {
    const t = ++this.asked;
    if (!this.connected) return null;
    let a = null, n = "";
    try {
      a = await new Ke({ getKey: this.getKey, fetch: this.fetch }).balance();
    } catch (i) {
      n = `Balance not available: ${new Ke({ getKey: this.getKey }).redact(i instanceof Error ? i.message : "request failed")}`.slice(0, 200);
    }
    return t !== this.asked || !this.connected ? null : (this.balanceUsd = a, this.balanceNote = n, this.render(), this.dispatchEvent(new CustomEvent("arena-balance-change", { bubbles: !0, composed: !0, detail: { balance: a } })), a);
  }
  attributeChangedCallback() {
    this.isConnected && this.render();
  }
  /** True when a key is held. */
  get connected() {
    return !!this.store.get();
  }
  /** The key, for RunwareClient only. Never log or store what this returns. */
  getKey = () => this.store.get();
  disconnect() {
    this.store.clear(), this.remembered = !1, this.changed();
  }
  /** Connects a key typed or pasted elsewhere; returns the problem, or null. */
  connect(t, a = !1) {
    const n = t.trim(), i = na(n);
    return i || (this.store.set(n, a ? "session" : "memory"), this.remembered = a, this.changed(), null);
  }
  changed() {
    this.asked++, this.balanceUsd = null, this.balanceNote = "", this.render(), this.dispatchEvent(new CustomEvent("arena-key-change", { bubbles: !0, composed: !0, detail: { connected: this.connected, remembered: this.remembered } })), this.connected && this.refreshBalance();
  }
  signup() {
    let t = aa;
    try {
      const a = new URL(this.getAttribute("signup-url") ?? aa);
      a.protocol === "https:" && (t = a.href);
    } catch {
    }
    return c("a", { href: t, target: "_blank", rel: "noopener noreferrer" }, "Get a key");
  }
  render() {
    const t = c("p", { class: "note" }, "Your key stays in your browser and is sent only to api.runware.ai.");
    if (this.connected) {
      const r = c("button", { type: "button", "data-action": "disconnect" }, "Disconnect");
      r.addEventListener("click", () => this.disconnect()), this.root.replaceChildren(
        c("style", {}, ia),
        c(
          "div",
          { class: "panel", part: "panel", "data-state": "connected" },
          c("div", { class: "row" }, c("span", { class: "state" }, "Key connected"), c("span", { class: "note" }, this.remembered ? "remembered for this tab" : "held in memory until you leave"), r),
          c("div", { class: "row" }, c("span", { class: "balance", "data-field": "balance" }, this.balanceUsd === null ? "" : `Balance ${this.balanceUsd.toFixed(2)} USD`), c("span", { class: "note", "data-field": "balance-note" }, this.balanceNote)),
          t
        )
      );
      return;
    }
    const a = c("input", {
      type: "password",
      autocomplete: "off",
      spellcheck: "false",
      autocapitalize: "off",
      maxlength: "512",
      "aria-describedby": "where",
      "data-field": "key"
    }), n = c("input", { type: "checkbox", "data-field": "remember" }), i = c("p", { class: "err", role: "alert" }), s = c("button", { type: "submit", class: "primary", "data-action": "connect" }, "Connect"), o = c(
      "form",
      { class: "panel", part: "panel", "data-state": "disconnected" },
      c("div", { class: "row" }, c("label", { class: "field" }, c("span", { class: "lbl" }, "Runware API key"), a), s),
      c("div", { class: "row" }, c("label", { class: "note" }, n, " Remember for this tab"), this.signup()),
      i,
      t
    );
    t.id = "where", a.addEventListener("input", () => i.textContent = ""), o.addEventListener("submit", (r) => {
      r.preventDefault();
      const d = this.connect(a.value, n.checked);
      d ? i.textContent = d : a.value = "";
    }), this.root.replaceChildren(c("style", {}, ia), o);
  }
}
function Qa(e = "arena-key") {
  customElements.get(e) || customElements.define(e, Qi);
}
const yt = [
  ["subject", "Subject", "Who or what moves"],
  ["environment", "Environment", "Where it happens"],
  ["action", "Action", "What it does along the path"],
  ["legend", "Colour legend", "e.g. The orange figure is the character"]
], qi = ["image/png", "image/jpeg", "image/webp"];
function sa(e, t) {
  const a = c("input", { type: "file", accept: qi.join(","), "data-field": e }), n = c("span", { class: "row", "data-ref": e }), s = c("div", { class: "drop", "data-drop": e }, c("span", { class: "note" }, `${e === "character" ? "Character sheet (optional)" : "Environment image (optional)"}: drop an image or`), a, n);
  return s.addEventListener("dragover", (o) => (o.preventDefault(), s.classList.add("over"))), s.addEventListener("dragleave", () => s.classList.remove("over")), s.addEventListener("drop", (o) => {
    o.preventDefault(), s.classList.remove("over"), t(o.dataTransfer?.files[0]);
  }), a.addEventListener("change", () => t(a.files?.[0])), { node: s, input: a, shown: n };
}
function es(e) {
  const t = Ha(), a = t.some((h) => h.key === e("model")) ? e("model") : t[0].key, n = t.map((h) => {
    const g = c("input", { type: "radio", name: "model", value: h.key, "data-model": h.key });
    return g.checked = h.key === a, { m: h, r: g };
  }), i = c(
    "fieldset",
    {},
    c("legend", {}, "Model"),
    c(
      "div",
      { class: "models" },
      ...n.map(
        ({ m: h, r: g }) => c(
          "label",
          { class: "model-opt" },
          g,
          c("span", {}, h.name, h.use === "audio-first-frame" ? c("span", { class: "badge" }, "audio + first frame only") : null),
          c("span", { class: "line" }, h.line)
        )
      )
    )
  ), s = {}, o = c("div", { class: "fields" });
  for (const [h, g, b] of yt)
    s[h] = c("input", { type: "text", maxlength: h === "legend" ? "300" : "500", placeholder: b, "data-field": h, value: e(h) ?? "" }), o.append(c("label", { class: "f" }, g, s[h]));
  const r = c("textarea", { maxlength: "5000", "data-field": "prompt", placeholder: "Leave empty to use the composed prompt" });
  r.value = e("prompt") ?? "";
  const d = c("details", {}, c("summary", {}, "Write my own prompt instead"), r);
  d.open = !!r.value;
  const l = c("fieldset", {}, c("legend", {}, "Shot description"), o, d), m = c("input", { type: "file", multiple: "", accept: ".json,.mp4,.wav,.mp3,.png,.jpg", "data-field": "bundle" }), u = c("p", { class: "note", "data-guide": "" }, "No guide yet: choose the bundle's files."), p = c("input", { type: "number", min: "0.1", max: "100", step: "0.1", value: e("max-price") ?? "2", "data-field": "max-price" }), f = c("button", { type: "button", class: "primary", "data-action": "run" }, "Run"), w = c("button", { type: "button", "data-action": "stop" }, "Stop");
  return w.hidden = !0, {
    radios: n,
    model: () => n.find(({ r: h }) => h.checked)?.m.key ?? a,
    setModel: (h) => n.forEach(({ m: g, r: b }) => b.checked = g.key === h),
    modelSet: i,
    fields: s,
    override: r,
    own: d,
    shotSet: l,
    bundleInput: m,
    guideInfo: u,
    maxPrice: p,
    run: f,
    stop: w,
    preview: c("div", { "data-preview": "" }),
    estimate: c("p", { class: "note", "data-estimate": "" }),
    confirmSlot: c("div"),
    status: c("p", { class: "status", role: "status" }),
    error: c("p", { class: "err", role: "alert" }),
    result: c("div", { "data-result": "" })
  };
}
const ts = /^[A-Za-z0-9._-]{1,255}$/, oa = (e) => typeof e == "object" && e !== null && !Array.isArray(e), ra = (e) => typeof e == "string" && e.length > 0 && e.length <= 2048 && !/^(javascript|data):/i.test(e.trim());
function as(e) {
  if (!oa(e)) throw new Error("preset must be an object");
  if (!ra(e.bundle)) throw new Error("preset.bundle must be a bundle directory URL");
  const t = { bundle: e.bundle };
  if (e.references !== void 0) {
    if (!oa(e.references)) throw new Error("preset.references must be an object");
    t.references = {};
    for (const a of ["character", "environment"]) {
      const n = e.references[a];
      if (n !== void 0) {
        if (!ra(n)) throw new Error(`preset.references.${a} must be an image URL`);
        t.references[a] = n;
      }
    }
  }
  if (e.shot !== void 0) {
    const a = La(e.shot);
    if (!a) throw new Error("preset.shot needs a subject (and an action)");
    t.shot = a;
  }
  if (e.model !== void 0) {
    if (!ve.includes(e.model)) throw new Error(`preset.model must be one of ${ve.join(", ")}`);
    t.model = e.model;
  }
  if (e.prompt !== void 0) {
    if (typeof e.prompt != "string" || e.prompt.length > 5e3) throw new Error("preset.prompt must be text up to 5000 characters");
    t.prompt = e.prompt;
  }
  return t;
}
async function vt(e) {
  const t = await fetch(e);
  if (!t.ok) throw new Error(`${new URL(e).pathname.split("/").pop()}: HTTP ${t.status}`);
  return t.blob();
}
async function da(e) {
  const t = e.endsWith("/") ? e : `${e}/`, a = JSON.parse(await (await vt(new URL("bundle.json", t).href)).text()), n = { "bundle.json": new Blob([JSON.stringify(a)], { type: "application/json" }) }, i = /* @__PURE__ */ new Set([a.recipe, a.camera, a.firstFrameStyled]);
  for (const s of ["video", "audio", "firstFrame", "beats", "recipe", "meta", "camera"]) {
    const o = a[s];
    if (!(typeof o != "string" || !ts.test(o)))
      try {
        n[o] = await vt(new URL(o, t).href);
      } catch (r) {
        if (!i.has(o)) throw r;
      }
  }
  return { files: n, dir: t };
}
async function ns(e) {
  return { blob: await vt(e), src: e, name: new URL(e).pathname.split("/").pop() || "reference.png" };
}
function is(e, t) {
  if (!e.guide) return null;
  const a = e.lanes.find((d) => d.shot || d.composed) ?? e.lanes[0];
  if (!a) return null;
  const n = _e.find((d) => d.air === a.model || d.id === a.model || d.id === a.composed?.model), i = n && ve.includes(n.id) ? n.id : void 0;
  if (!i) return null;
  const s = new URL(e.guide.video.src, t), o = { bundle: new URL(".", s).href, model: i }, r = a.shot ?? e.shot;
  if (r) {
    o.shot = { subject: r.subject, action: r.action, ...r.environment ? { environment: r.environment } : {}, ...r.legend ? { legend: r.legend } : {}, camera: r.camera };
    const d = a.inputsSent.filter((m) => m.role === "referenceImage" || m.role === "frameImage"), l = r.references.filter((m) => m.kind === "image").map((m) => m.id);
    d.forEach((m, u) => {
      const p = l[u];
      (p === "character" || p === "environment") && (o.references = { ...o.references, [p]: new URL(m.src, t).href });
    });
  }
  return a.composed || (o.prompt = a.prompt), o;
}
const ss = {
  guide: "the guide clip",
  audio: "the guide's audio",
  character: "your character sheet",
  environment: "your environment image",
  frame0: "the guide's frame 0"
};
function os(e) {
  const t = e.composed.used.filter((a) => a.address).map((a) => `${a.address} = ${ss[a.ref] ?? a.ref}`);
  return t.length ? `Reference tags: ${t.join(", ")}` : "Reference tags: none; this model is not addressed by tags.";
}
function ca(e, t = !1) {
  const a = e.composed.dropped.map((i) => `${i.ref}: ${i.reason}`), n = [...e.notes, ...a];
  return c(
    "div",
    { class: t ? "prompt-card compact" : "prompt-card", "data-model": e.model.key },
    c("div", { class: "row spread" }, c("strong", {}, e.model.name), c("a", { href: e.model.guide.url, target: "_blank", rel: "noopener noreferrer" }, /^prompting$/i.test(e.model.guide.title) ? "Prompting guide" : `Prompting guide: ${e.model.guide.title}`)),
    t ? null : c("p", { class: "line" }, e.model.line),
    c("pre", { "data-prompt": e.model.key }, e.composed.prompt),
    c("p", { class: "tags" }, os(e)),
    n.length ? c("ul", { class: "notes" }, ...n.map((i) => c("li", {}, i))) : null
  );
}
function rs(e) {
  if (e.override.trim())
    return c(
      "div",
      { class: "preview" },
      c("p", { class: "note" }, "Your own prompt replaces the composed one; the model gets exactly this text."),
      c("pre", { "data-prompt": e.model }, e.override.trim())
    );
  if (!e.shot || !e.shot.subject.trim()) return c("div", { class: "preview" }, c("p", { class: "note" }, "Describe the subject to see the prompt each model gets."));
  let t;
  try {
    t = ca(Qe(e.shot, e.model, e.facts));
  } catch (n) {
    t = c("p", { class: "err" }, n.message);
  }
  const a = c(
    "details",
    { class: "compare" },
    c("summary", {}, "Compare prompts"),
    c("div", { class: "compare-grid" }, ...Ai(e.shot, e.facts).map((n) => ca(n, !0)))
  );
  return c("div", { class: "preview" }, t, a);
}
const ds = 0.025;
class la {
  media = /* @__PURE__ */ new Map();
  generation = 0;
  frame;
  listeners = /* @__PURE__ */ new Set();
  maxDrift;
  publishEvery;
  raf;
  caf;
  state = { playing: !1, soloing: void 0, time: 0, duration: 0, error: "" };
  constructor(t = {}) {
    this.maxDrift = t.maxDrift ?? 1 / 48, this.publishEvery = t.publishEvery ?? 100, this.raf = t.raf ?? ((a) => requestAnimationFrame(a)), this.caf = t.caf ?? ((a) => cancelAnimationFrame(a));
  }
  subscribe(t) {
    return this.listeners.add(t), t(this.state), () => this.listeners.delete(t);
  }
  set(t) {
    this.state = { ...this.state, ...t }, this.listeners.forEach((a) => a(this.state));
  }
  add(t, a) {
    this.media.set(t, a), this.loaded();
  }
  remove(t) {
    this.media.get(t)?.pause(), this.media.delete(t), this.loaded();
  }
  /** Call on `loadedmetadata`: the shared length is the shortest clip. */
  loaded() {
    const t = [...this.media.values()].map((a) => a.duration).filter((a) => Number.isFinite(a) && a > 0);
    this.set({ duration: t.length ? Math.min(...t) : 0 });
  }
  pause() {
    this.generation++, this.stopLoop(), this.media.forEach((t) => t.pause()), this.set({ playing: !1, soloing: void 0 });
  }
  seek(t) {
    this.pause();
    const a = Math.max(0, Math.min(t, this.state.duration || t));
    this.media.forEach((n) => {
      n.readyState >= 1 && (n.currentTime = Math.min(a, n.duration));
    }), this.set({ time: a });
  }
  async play() {
    if (this.state.playing) return this.pause();
    this.state.soloing && this.pause();
    const t = ++this.generation;
    this.set({ error: "" });
    const a = [...this.media.values()];
    if (!a.length || a.some((o) => o.readyState < 2 || o.error)) {
      this.set({ error: "Wait for every video to load, or replace the unavailable clip." });
      return;
    }
    const { time: n, duration: i } = this.state, s = n >= i - 0.04 ? 0 : n;
    a.forEach((o) => o.currentTime = s);
    try {
      if (await Promise.all(a.map((o) => o.play())), t !== this.generation) return void a.forEach((o) => o.pause());
      this.set({ playing: !0 }), this.startLoop();
    } catch {
      if (t !== this.generation) return;
      this.pause(), this.set({ error: "Playback was interrupted. Press Play to try again." });
    }
  }
  async solo(t) {
    const a = this.media.get(t);
    if (!a) return;
    if (this.state.soloing === t) return this.pause();
    this.pause();
    const n = this.generation;
    if (this.set({ error: "" }), a.readyState < 2 || a.error) {
      this.set({ error: "Wait for this video to load, or replace the clip." });
      return;
    }
    (a.ended || a.currentTime >= a.duration - 0.04) && (a.currentTime = 0);
    try {
      if (await a.play(), n !== this.generation) return a.pause();
      this.set({ soloing: t }), a.addEventListener("pause", () => this.state.soloing === t && this.set({ soloing: void 0 }), {
        once: !0
      }), this.startSoloLoop(t, a);
    } catch {
      n === this.generation && this.set({ error: "Playback was interrupted. Press Play to try again." });
    }
  }
  /** Pause everything; call on page hide or element disconnect. */
  hide() {
    this.pause();
  }
  stopLoop() {
    this.frame !== void 0 && this.caf(this.frame), this.frame = void 0;
  }
  /** One frame of the sync loop; public so tests can drive it. */
  tick(t) {
    const a = [...this.media.values()], n = a[0], { duration: i } = this.state;
    if (!n || n.ended || n.currentTime >= i - ds)
      return a.forEach((s) => s.pause()), this.stopLoop(), this.set({ playing: !1, time: i }), !1;
    for (const s of a.slice(1))
      Math.abs(s.currentTime - n.currentTime) > this.maxDrift && (s.currentTime = n.currentTime);
    return t - this.published >= this.publishEvery && (this.published = t, this.set({ time: n.currentTime })), !0;
  }
  published = -1 / 0;
  startLoop() {
    this.stopLoop(), this.published = -1 / 0;
    const t = (a) => {
      this.tick(a) && (this.frame = this.raf(t));
    };
    this.frame = this.raf(t);
  }
  startSoloLoop(t, a) {
    this.stopLoop();
    const n = () => {
      this.state.soloing === t && (this.set({ time: a.currentTime }), this.frame = this.raf(n));
    };
    this.frame = this.raf(n);
  }
}
const ua = /^[a-z0-9][a-z0-9-]{0,63}$/, xt = (e) => typeof e == "object" && e !== null && !Array.isArray(e), cs = (e) => xt(e) && Array.isArray(e.tabs);
function ls(e) {
  if (!xt(e)) throw new y("set", "must be an object");
  if (e.schemaVersion !== 1) throw new y("schemaVersion", "must be 1");
  if (typeof e.id != "string" || !ua.test(e.id)) throw new y("id", "must be a slug");
  if (typeof e.title != "string" || e.title.length < 1 || e.title.length > 200) throw new y("title", "must be 1-200 characters");
  if (!Array.isArray(e.tabs) || e.tabs.length < 1 || e.tabs.length > 8) throw new y("tabs", "must hold 1-8 tabs");
  const t = /* @__PURE__ */ new Set();
  return e.tabs.forEach((a, n) => {
    const i = `tabs[${n}]`;
    if (!xt(a)) throw new y(i, "must be an object");
    if (typeof a.id != "string" || !ua.test(a.id)) throw new y(`${i}.id`, "must be a slug");
    if (t.has(a.id)) throw new y(`${i}.id`, "tab ids must be distinct");
    if (t.add(a.id), typeof a.label != "string" || a.label.length < 1 || a.label.length > 40) throw new y(`${i}.label`, "must be 1-40 characters");
    if (a.record !== void 0) ge(a.record);
    else if (typeof a.src != "string" || a.src.length < 1 || a.src.length > 2048) throw new y(`${i}.src`, "must be a record URL, or give an inline record");
  }), e;
}
const us = (
  /* css */
  `
/* layout="arena": tiles keep 16:9 from the row height; hero tiles stretch. */
.stage { display: grid; gap: var(--ma-gap); min-width: 0; }
.tile { position: relative; margin: 0; min-width: 0; border-radius: var(--ma-radius); }
.tile .screen { height: 100%; }
.tile.preferred .screen { box-shadow: 0 0 0 1px var(--ma-accent); }
.overlay { position: absolute; inset: 0; pointer-events: none; }
.overlay > * { pointer-events: auto; position: absolute; }
.overlay select {
  top: 8px; left: 8px; max-width: calc(100% - 16px); background: var(--ma-chip); color: var(--ma-fg);
  border: 1px solid var(--ma-line); border-radius: 6px; font: 500 12px var(--ma-font); padding: 3px 6px;
}
.overlay .solo { bottom: 10px; left: 8px; background: var(--ma-chip); }
.overlay .meta { bottom: 12px; right: 10px; font: 12px var(--ma-mono); color: var(--ma-muted); background: rgba(0,0,0,0.55); padding: 1px 6px; border-radius: 4px; }
.stage[data-layout="2-side"] { grid-template-columns: 1fr 1fr; }
.stage[data-layout="2-stack"] { grid-template-columns: 1fr; }
.stage[data-layout="3-row"] { grid-template-columns: repeat(3, 1fr); }
.stage[data-layout="3-hero"] { grid-template-columns: 2fr 1fr; }
.stage[data-layout="3-hero"] .tile:first-child { grid-row: span 2; }
.stage[data-layout="4-grid"] { grid-template-columns: 1fr 1fr; }
.stage[data-layout="4-row"] { grid-template-columns: repeat(4, 1fr); }
.stage[data-layout="5-3-2"] { grid-template-columns: repeat(6, 1fr); }
.stage[data-layout="5-3-2"] .tile { grid-column: span 2; }
.stage[data-layout="5-3-2"] .tile:nth-child(n+4) { grid-column: span 3; }
.stage[data-layout="5-hero"] { grid-template-columns: 2fr 1fr 1fr; }
.stage[data-layout="5-hero"] .tile:first-child { grid-row: span 2; }
.stage .tile { aspect-ratio: 16 / 9; }
.stage[data-layout="3-hero"] .tile:first-child, .stage[data-layout="5-hero"] .tile:first-child { aspect-ratio: auto; }
.stage[data-layout="4-row"] .overlay .solo { display: none; }
@container (max-width: 640px) {
  .stage[data-layout] { grid-template-columns: minmax(0, 1fr); }
  .stage[data-layout] .tile { grid-column: auto; grid-row: auto; aspect-ratio: 16 / 9; }
  .stage[data-layout="4-row"] .overlay .solo { display: inline-block; }
}

/* layout="guidance" */
.pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ma-gap); }
.side { margin: 0; min-width: 0; display: grid; gap: 6px; }
.side figcaption { display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; }
.switcher { display: flex; flex-wrap: wrap; gap: 6px; }
.switcher button[aria-pressed="true"] { background: var(--ma-accent); color: var(--ma-accent-fg); border-color: var(--ma-accent); }
.modes { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ma-gap); }
.modes li { border: 1px solid var(--ma-line); border-radius: var(--ma-radius-lg); padding: 10px 12px; display: grid; gap: 2px; color: var(--ma-muted); font-size: 13px; opacity: 0.6; }
.modes li strong { color: var(--ma-fg); font-size: 14px; }
.modes li.on { opacity: 1; border-color: var(--ma-accent); box-shadow: inset 0 0 0 1px var(--ma-accent); }
.strip { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.slot { border: 1px solid var(--ma-line); border-radius: var(--ma-radius); padding: 8px 10px; display: grid; gap: 2px; font-size: 12px; min-width: 0; overflow-wrap: anywhere; }
.slot strong { font-size: 13px; }
.slot.sent { border-color: var(--ma-accent); }
.slot.sent strong::before { content: "● "; color: var(--ma-accent); }
.slot.not-sent { color: var(--ma-muted); }
.slot.cannot { color: var(--ma-muted); opacity: 0.45; border-style: dashed; text-decoration: line-through; text-decoration-thickness: 1px; }
.composed { display: grid; gap: 6px; }
.composed pre { margin: 0; padding: 10px 12px; font: 12px/1.5 var(--ma-mono); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--ma-bg); border: 1px solid var(--ma-line); border-radius: var(--ma-radius); max-height: 14em; overflow: auto; }
@container (max-width: 640px) {
  .pair, .modes { grid-template-columns: minmax(0, 1fr); }
  .strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* layout="three-up": full captions */
.lanes { display: grid; gap: var(--ma-gap); grid-template-columns: repeat(var(--ma-columns, 3), minmax(0, 1fr)); }
@container (max-width: 720px) { .lanes { grid-template-columns: minmax(0, 1fr); } }
.lane { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); overflow: hidden; background: var(--ma-bg); }
.lane .screen { border-radius: 0; }
.lane.preferred { border-color: var(--ma-accent); }
.caption { padding: 10px 12px 12px; display: grid; gap: 8px; font-size: 13px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
dt { color: var(--ma-muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.prompt { display: grid; gap: 4px; }
.prompt pre { margin: 0; padding: 6px 8px; font: 12px/1.4 var(--ma-mono); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--ma-card); border: 1px solid var(--ma-line); border-radius: 6px; max-height: 8.5em; overflow: auto; }
.inputs { display: flex; flex-wrap: wrap; gap: 8px; }
.input { display: grid; gap: 2px; width: 96px; font-size: 11px; color: var(--ma-muted); }
.input img, .input video { width: 96px; height: 54px; object-fit: cover; border-radius: 4px; background: #000; display: block; }
.input .ph { width: 96px; height: 54px; border-radius: 4px; border: 1px dashed var(--ma-line); display: grid; place-items: center; }
.input span { overflow-wrap: anywhere; }
/* layout="inputs": reference strip, then guide + outputs on one row. */
.ref-strip { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.ref-strip li { display: grid; gap: 2px; width: 84px; font-size: 11px; color: var(--ma-muted); }
.ref-strip img, .ref-strip .ph { width: 84px; height: 56px; object-fit: cover; border-radius: 4px; border: 1px solid var(--ma-line); background: var(--ma-chip); }
.inputs-row { display: grid; grid-template-columns: repeat(var(--ma-columns, 2), minmax(0, 1fr)); gap: var(--ma-gap); min-width: 0; }
@container (max-width: 640px) { .inputs-row { grid-template-columns: 1fr; } }
.inputs-row .side { margin: 0; display: grid; gap: 6px; min-width: 0; align-content: start; }
.inputs-row figcaption { display: grid; gap: 2px; }
.lane-prompt summary { cursor: pointer; font-size: 12px; color: var(--ma-muted); }
.lane-prompt pre { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.5 var(--ma-mono); background: var(--ma-input); border-radius: 6px; padding: 6px; max-height: 200px; overflow: auto; }
`
), ma = (
  /* css */
  `
${et}
:host {
  display: block;
  width: 100%;
  max-width: 100%;
  color: var(--ma-fg);
  background: var(--ma-card);
  border: 1px solid var(--ma-line);
  border-radius: var(--ma-radius-lg);
  overflow: hidden;
  font: 400 14px/1.5 var(--ma-font);
  container-type: inline-size;
}
* { box-sizing: border-box; }
.head {
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px 16px;
  padding: 12px 16px; border-bottom: 1px solid var(--ma-line);
}
.title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; min-width: 0; }
.head h2 { font-size: 15px; margin: 0; font-weight: 600; }
.head .meta { color: var(--ma-muted); font-size: 13px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.body { padding: 12px; display: grid; gap: 12px; min-width: 0; }
.intent { margin: 0; padding: 8px 16px; border-bottom: 1px solid var(--ma-line); font-size: 13px; color: var(--ma-muted); overflow-wrap: anywhere; }
.seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--ma-line); border-radius: 8px; overflow: hidden; max-width: 100%; }
.seg button { background: transparent; color: var(--ma-muted); border: 0; border-radius: 0; font: 500 13px var(--ma-font); padding: 5px 11px; min-height: 32px; }
.seg button + button { border-left: 1px solid var(--ma-line); }
.seg button[aria-pressed="true"], .seg button[aria-selected="true"] { background: var(--ma-accent); color: var(--ma-accent-fg); }
button {
  font: inherit; cursor: pointer; border: 1px solid var(--ma-line); border-radius: var(--ma-radius);
  background: var(--ma-input); color: var(--ma-fg); padding: 4px 10px; min-height: 32px;
}
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: var(--ma-accent); color: var(--ma-accent-fg); border-color: var(--ma-accent); font-weight: 600; min-width: 96px; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--ma-accent); outline-offset: 2px; }
.transport {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px;
  padding: 8px 12px; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-bg);
}
input[type="range"] { width: 100%; min-width: 0; accent-color: var(--ma-accent); }
.time { font: 12px var(--ma-mono); color: var(--ma-muted); white-space: nowrap; }
@container (max-width: 400px) { .time { display: none; } .transport { grid-template-columns: auto minmax(0, 1fr); } }
.error { color: var(--ma-warn); font-size: 13px; padding: 8px 16px 0; }
.error:empty { display: none; }
.screen { position: relative; background: #000; aspect-ratio: 16 / 9; border-radius: var(--ma-radius); overflow: hidden; }
.screen video { width: 100%; height: 100%; display: block; object-fit: contain; }
.playhead { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,0.15); }
.playhead span { display: block; height: 100%; width: 0; background: var(--ma-accent); }
.badge { position: absolute; top: 8px; right: 8px; font: 11px var(--ma-mono); padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.7); color: #fff; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.row.spread { justify-content: space-between; }
.model { font-weight: 600; font-size: 14px; }
.id { font: 12px var(--ma-mono); color: var(--ma-muted); overflow-wrap: anywhere; }
.note { color: var(--ma-muted); font-style: italic; margin: 0; }
.small { font-size: 12px; padding: 2px 8px; min-height: 28px; }
${us}
`
);
function Ve(e) {
  return _e.find((t) => t.air === e.model || t.id === e.model);
}
function qa(e) {
  const a = e.settings?.settings?.cameraMovement;
  return typeof a == "string" ? a : void 0;
}
const pa = [
  { id: "parameter", title: "Camera parameter", text: "The move is a request field the model reads directly." },
  { id: "guide-video", title: "Guide video", text: "A reference video carries the move; the prompt names it." },
  { id: "prompt", title: "Prompt words", text: "The move is written into the prompt and nothing else." }
];
function ms(e) {
  return qa(e) ? "parameter" : e.inputsSent.some((t) => t.role === "referenceVideo") ? "guide-video" : "prompt";
}
function ps(e, t = Ve(e)) {
  const a = (f) => e.inputsSent.find((w) => w.role === f), n = e.inputsSent.find((f) => f.role === "frameImage" && (f.frame === void 0 || f.frame === "first" || f.frame === 0)), i = e.firstFrameVariant !== "C" ? a("referenceImage") : void 0, s = a("referenceVideo"), o = a("referenceAudio") ?? a("audio"), r = qa(e), d = (f) => f === !1 ? "cannot" : "not-sent", l = n ? { key: "firstFrame", label: "First frame", state: "sent", detail: "as the first frame" } : i ? { key: "firstFrame", label: "First frame", state: "sent", detail: "as a reference image" } : { key: "firstFrame", label: "First frame", state: d(t?.inputs.firstFrame.supported), detail: t?.inputs.firstFrame.supported === !1 ? "cannot take it" : "not sent" }, m = t ? t.inputs.referenceVideos.supported : void 0, u = t ? t.inputs.referenceAudios.supported || t.inputs.audioToVideo.supported : void 0, p = t ? t.camera.kind === "parameter" : void 0;
  return [
    l,
    s ? { key: "guideVideo", label: "Guide video", state: "sent", detail: "as a reference video" } : { key: "guideVideo", label: "Guide video", state: d(m), detail: m === !1 ? "cannot take it" : "not sent" },
    o ? { key: "audio", label: "Audio", state: "sent", detail: o.role === "audio" ? "drives the clip" : "as reference audio" } : { key: "audio", label: "Audio", state: d(u), detail: u === !1 ? "cannot take it" : "not sent" },
    r ? { key: "cameraParam", label: "Camera parameter", state: "sent", detail: r } : { key: "cameraParam", label: "Camera parameter", state: d(p), detail: p === !1 ? "none on this model" : "not sent" },
    e.prompt ? { key: "prompt", label: "Prompt text", state: "sent", detail: r ? "no camera words" : "carries the move" } : { key: "prompt", label: "Prompt text", state: "not-sent", detail: "no prompt" }
  ];
}
function en(e, t = Ve(e)) {
  if (!t || typeof e.durationSeconds != "number") return null;
  const a = e.inputsSent.some((d) => d.role === "referenceVideo" || d.role === "video"), n = t.pricing.rates.filter((d) => !d.mode.startsWith("draft")), i = n.filter((d) => d.mode === "any" || d.mode === (a ? "video-input" : "no-video-input")), s = i.length ? i : n;
  if (!s.length) return null;
  const o = Math.round(Math.min(...s.map((d) => d.usdPerSecond)) * e.durationSeconds * 1e3) / 1e3, r = a ? t.pricing.surcharges.find((d) => d.per === "input-video-second") : void 0;
  return r ? { usd: o, excludes: `${r.label} at $${r.usd}/s` } : { usd: o };
}
const ha = (e) => {
  const t = Math.floor(e / 60), a = e - t * 60;
  return `${t}:${a.toFixed(1).padStart(4, "0")}`;
};
function tt(e, t = "Play all") {
  const a = c("button", { class: "primary", type: "button" }, t);
  a.addEventListener("click", () => {
    e().play();
  });
  const n = c("input", { type: "range", min: "0", max: "0", step: String(1 / 24), value: "0", "aria-label": "Playhead" });
  let i = !1;
  n.addEventListener("input", () => {
    i = !0, e().seek(Number(n.value));
  }), n.addEventListener("change", () => i = !1);
  const s = c("span", { class: "time" }, "0:00.0 / 0:00.0");
  return {
    node: c("div", { class: "transport" }, a, n, s),
    update(o) {
      a.textContent = o.playing ? "Pause" : t, n.max = String(o.duration || 0), i || (n.value = String(o.time)), s.textContent = `${ha(o.time)} / ${ha(o.duration)}`;
    }
  };
}
function xe(e, t, a, n) {
  const i = c("div", { class: "screen" });
  let s;
  e ? (s = c("video", { src: e, muted: "", playsinline: "", preload: "auto", "aria-label": t }), s.muted = !0, s.addEventListener("error", () => a(`${t}: the clip did not load.`)), i.append(s)) : i.append(c("div", { class: "badge" }, "No output")), n && i.append(c("div", { class: "badge" }, n));
  const o = c("span");
  return i.append(c("div", { class: "playhead" }, o)), { node: i, video: s, bar: o };
}
const at = (e) => e.duration ? `${Math.min(100, e.time / e.duration * 100)}%` : "0%", tn = {
  2: [["2-side", "Side by side"], ["2-stack", "Stacked"]],
  3: [["3-row", "Row of 3"], ["3-hero", "1 big + 2"]],
  4: [["4-grid", "2 × 2"], ["4-row", "Row of 4"]],
  5: [["5-3-2", "3 + 2"], ["5-hero", "1 big + 4"]]
};
function Mt(e) {
  if (e.costUsd !== null) return `${J(e.costUsd)} per clip`;
  const t = en(e, Ve(e));
  return t ? `List price from ${J(t.usd)} per clip${t.excludes ? ` plus ${t.excludes}` : ""} (not run)` : "Cost not recorded";
}
function hs(e) {
  const t = e.costUsd === null ? en(e, Ve(e)) : null, a = e.costUsd !== null ? J(e.costUsd) : t ? `from ${J(t.usd)}` : "$ —", n = e.generationSeconds !== null ? qe(e.generationSeconds) : "— s";
  return `${a} · ${n}`;
}
function Ft(e) {
  const t = typeof e.durationSeconds == "number" ? `${e.durationSeconds} s clip` : null, a = e.generationSeconds !== null ? `${qe(e.generationSeconds)} to generate` : "generation time not recorded";
  return [t, a].filter(Boolean).join(" · ");
}
function an(e, t) {
  const a = e.lanes.map((l) => l.id), n = Math.max(1, Math.min(5, a.length)), i = Math.min(n, Math.max(Math.min(2, n), t?.count ?? Math.min(3, n))), s = tn[i] ?? [["single", "Single"]], o = s.some(([l]) => l === t?.layout) ? t.layout : s[0][0], r = [], d = (t?.picks ?? []).filter((l) => a.includes(l));
  for (let l = 0; l < i; l++) r.push(d[l] ?? a.find((m) => !r.includes(m) && !d.includes(m)) ?? a[l % a.length]);
  return { count: i, layout: o, picks: r };
}
function fa(e, t, a, n) {
  const i = c("div", { class: "seg", role: "group", "aria-label": e });
  for (const [s, o] of t) {
    const r = c("button", { type: "button", "aria-pressed": String(s === a) }, o);
    r.addEventListener("click", () => n(s)), i.append(r);
  }
  return i;
}
function fs(e, t, a) {
  const { record: n, base: i } = e, s = tt(e.clock), o = c("div", { class: "stage", "data-layout": t.layout }), r = [], d = /* @__PURE__ */ new Map(), l = new Map(n.lanes.map((f) => [f.id, f])), m = [2, 3, 4, 5].filter((f) => f <= n.lanes.length), u = m.length > 0 ? [
    fa("How many models", m.map((f) => [String(f), `${f} models`]), String(t.count), (f) => a(an(n, { ...t, count: Number(f), layout: void 0 }))),
    fa("Layout", tn[t.count] ?? [], t.layout, (f) => a({ ...t, layout: f }))
  ] : [];
  t.picks.forEach((f, w) => {
    const h = l.get(f), g = `tile-${w}`, b = h.label ?? h.modelName ?? h.model, x = h.output ? X(h.output.src, i) : null, U = xe(x, b, e.error, h.status === "placeholder" ? "Placeholder" : void 0);
    U.video && (U.video.addEventListener("loadedmetadata", () => e.clock().loaded()), e.clock().add(g, U.video)), r.push(U.bar);
    const F = c("select", { "aria-label": `Model for tile ${w + 1}` });
    for (const Y of n.lanes) {
      const de = c("option", { value: Y.id }, Y.label ?? Y.modelName ?? Y.model);
      de.selected = Y.id === f, F.append(de);
    }
    F.addEventListener("change", () => a({ ...t, picks: t.picks.map((Y, de) => de === w ? F.value : Y) }));
    const se = c("button", { class: "small solo", type: "button", "aria-pressed": "false" }, "Play alone");
    se.addEventListener("click", () => {
      e.clock().solo(g);
    }), U.video || (se.disabled = !0), d.set(g, se);
    const Pe = c("span", { class: "meta", title: `${Mt(h)} · ${Ft(h)}` }, hs(h));
    o.append(
      c(
        "figure",
        { class: `tile${n.preferredLane === h.id ? " preferred" : ""}`, "data-lane": h.id },
        U.node,
        c("figcaption", { class: "overlay" }, F, se, Pe)
      )
    );
  });
  const p = n.observations?.length ? c("ul", { class: "note" }, ...n.observations.map((f) => c("li", {}, f))) : null;
  return {
    controls: u,
    nodes: [s.node, o, ...p ? [p] : []],
    update(f) {
      s.update(f);
      const w = at(f);
      r.forEach((h) => h.style.width = w);
      for (const [h, g] of d)
        g.textContent = f.soloing === h ? "Stop" : "Play alone", g.setAttribute("aria-pressed", String(f.soloing === h));
    }
  };
}
const gs = (e) => e.model === "guide" || e.provider === "none";
function bs(e) {
  const t = c("button", { class: "small", type: "button" }, "Copy prompt");
  return t.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(e()), t.textContent = "Copied";
    } catch {
      t.textContent = "Select and copy";
    }
    setTimeout(() => t.textContent = "Copy prompt", 1500);
  }), t;
}
function ws(e, t) {
  const { record: a, base: n } = e, i = a.lanes.filter((k) => !gs(k));
  let s = i.find((k) => k.id === t) ?? i[0];
  const o = tt(e.clock, "Play both"), r = a.guide ? X(a.guide.video.src, n) : null, d = xe(r, "Guide", e.error);
  d.video && (d.video.addEventListener("loadedmetadata", () => e.clock().loaded()), e.clock().add("guide-clip", d.video));
  const l = c(
    "figure",
    { class: "side" },
    d.node,
    c("figcaption", {}, c("span", { class: "model" }, "Guide"), c("span", { class: "id" }, a.guide ? a.guide.title ?? "The clip every model was given" : "No guide clip in this record"))
  ), m = c("div", { class: "side-screen" }), u = c("span", { class: "model" }), p = c("span", { class: "id" }), f = c("figure", { class: "side" }, m, c("figcaption", {}, u, p));
  let w = c("span");
  const h = c("div", { class: "switcher", role: "group", "aria-label": "Model" }), g = /* @__PURE__ */ new Map();
  for (const k of i) {
    const j = c("button", { type: "button", "aria-pressed": "false", "data-lane": k.id }, k.label ?? k.modelName ?? k.model);
    j.addEventListener("click", () => Y(k)), g.set(k.id, j), h.append(j);
  }
  const b = c("ol", { class: "modes", "aria-label": "Three ways a model is steered" }), x = new Map(
    pa.map((k) => {
      const j = c("li", { "data-mode": k.id }, c("strong", {}, k.title), c("span", {}, k.text));
      return b.append(j), [k.id, j];
    })
  ), U = c("ul", { class: "strip", "aria-label": "Inputs this model received" }), F = c("pre"), se = c(
    "div",
    { class: "composed" },
    c("div", { class: "row spread" }, c("span", { class: "id" }, "Composed prompt"), bs(() => s?.prompt ?? "")),
    F
  ), Pe = c("p", { class: "note" });
  function Y(k) {
    s = k;
    const j = e.clock(), gn = j.state.time;
    j.pause(), j.remove("output");
    const bn = k.output ? X(k.output.src, n) : null, nt = k.label ?? k.modelName ?? k.model, Ae = xe(bn, nt, e.error, k.status === "placeholder" ? "Placeholder clip" : void 0);
    Ae.video && (Ae.video.addEventListener("loadedmetadata", () => {
      j.loaded(), j.seek(gn);
    }), j.add("output", Ae.video)), m.replaceChildren(Ae.node), w = Ae.bar;
    const it = ms(k), wn = pa.find((O) => O.id === it).title;
    u.textContent = nt, p.textContent = `Steered by: ${wn} · ${Mt(k)} · ${Ft(k)}`;
    for (const [O, Ue] of g) Ue.setAttribute("aria-pressed", String(O === k.id));
    for (const [O, Ue] of x)
      Ue.classList.toggle("on", O === it), O === it ? Ue.setAttribute("aria-current", "true") : Ue.removeAttribute("aria-current");
    const yn = Ve(k);
    U.replaceChildren(
      ...ps(k, yn).map(
        (O) => c(
          "li",
          { class: `slot ${O.state}`, "data-slot": O.key, title: O.state === "cannot" ? `${nt} cannot take this input` : O.detail },
          c("strong", {}, O.label),
          c("span", {}, O.detail)
        )
      )
    ), F.textContent = k.prompt || "(no prompt)", Pe.textContent = k.note ?? "", Pe.hidden = !k.note;
  }
  s && Y(s);
  const de = i.length ? null : c("p", { class: "note" }, "This record has no model lanes to compare with the guide.");
  return {
    nodes: [c("div", { class: "pair" }, l, f), o.node, h, b, U, se, Pe, ...de ? [de] : []],
    update(k) {
      o.update(k);
      const j = at(k);
      d.bar.style.width = j, w.style.width = j;
    }
  };
}
const ys = (e) => e.model === "guide" || e.provider === "none", vs = /* @__PURE__ */ new Set(["referenceImage", "frameImage"]), xs = { character: "Character sheet", environment: "Environment", frame0: "Guide frame 0" };
function $s(e) {
  const t = /* @__PURE__ */ new Map();
  for (const a of e) {
    const n = (a.shot?.references ?? []).filter((i) => i.kind === "image").map((i) => i.id);
    a.inputsSent.filter((i) => vs.has(i.role)).forEach((i, s) => {
      t.has(i.src) || t.set(i.src, xs[n[s] ?? ""] ?? i.label ?? "Reference image");
    });
  }
  return [...t].map(([a, n]) => ({ src: a, label: n }));
}
function ks(e) {
  const { record: t, base: a } = e, n = e.clock(), i = tt(e.clock, "Play all"), s = [], o = t.lanes.filter((b) => !ys(b) && b.output).slice(0, 3), r = $s(t.lanes), d = r.length ? c(
    "ul",
    { class: "ref-strip", "aria-label": "Reference images sent" },
    ...r.map((b) => {
      const x = X(b.src, a);
      return c("li", {}, x ? c("img", { src: x, alt: b.label, loading: "lazy" }) : c("div", { class: "ph" }, "image"), c("span", {}, b.label));
    })
  ) : null, l = c("div", { class: "inputs-row" });
  l.style.setProperty("--ma-columns", String(1 + Math.max(1, o.length)));
  const m = t.guide ? X(t.guide.video.src, a) : null, u = xe(m, "Guide", e.error);
  u.video && (u.video.addEventListener("loadedmetadata", () => n.loaded()), n.add("guide-clip", u.video)), s.push(u.bar), l.append(c("figure", { class: "side", "data-lane": "guide" }, u.node, c("figcaption", {}, c("span", { class: "model" }, "Guide"), c("span", { class: "id" }, t.guide?.title ?? "The clip every model was given"))));
  const p = t.guide?.audio ? X(t.guide.audio.src, a) : null;
  let f;
  p && (f = c("audio", { src: p, preload: "auto", "data-track": "guide-audio" }), f.addEventListener("loadedmetadata", () => n.loaded()), n.add("guide-audio", f));
  const w = [];
  for (const b of o) {
    const x = xe(X(b.output.src, a), b.label ?? b.modelName ?? b.model, e.error, b.status === "placeholder" ? "Placeholder clip" : void 0);
    x.video && (x.video.addEventListener("loadedmetadata", () => n.loaded()), n.add(b.id, x.video), w.push(x.video)), s.push(x.bar), l.append(
      c(
        "figure",
        { class: "side", "data-lane": b.id },
        x.node,
        c("figcaption", {}, c("span", { class: "model" }, b.label ?? b.modelName ?? b.model), c("span", { class: "id" }, `${Mt(b)} · ${Ft(b)}`)),
        c("details", { class: "lane-prompt" }, c("summary", {}, b.composed ? "Composed prompt" : "Prompt"), c("pre", {}, b.prompt || "(no prompt)"))
      )
    );
  }
  o.length || l.append(c("p", { class: "note" }, "This record has no outputs yet."));
  const h = c("button", { type: "button", class: "small", "aria-pressed": "false", "data-action": "clip-sound" }, "Clip sound: off"), g = (b) => {
    for (const x of w) x.muted = !b;
    f && (f.muted = b), h.setAttribute("aria-pressed", String(b)), h.textContent = `Clip sound: ${b ? "on" : "off"}`;
  };
  return h.addEventListener("click", () => g(h.getAttribute("aria-pressed") !== "true")), g(!1), {
    controls: [h],
    nodes: [...d ? [d] : [], l, i.node, ...f ? [f] : []],
    update(b) {
      i.update(b);
      const x = at(b);
      s.forEach((U) => U.style.width = x);
    }
  };
}
function Ss(e, t) {
  const { record: a, base: n } = e, i = tt(e.clock), s = [], o = /* @__PURE__ */ new Map(), r = c("div", { class: "lanes" });
  r.style.setProperty("--ma-columns", String(t === "three-up" ? Math.min(3, a.lanes.length) : 3));
  for (const l of a.lanes) {
    const m = l.output ? X(l.output.src, n) : null, u = xe(m, l.label ?? l.model, e.error, l.status === "placeholder" ? "Placeholder clip" : l.status === "pending" ? "Not run yet" : void 0);
    u.video && (u.video.addEventListener("loadedmetadata", () => e.clock().loaded()), e.clock().add(l.id, u.video)), s.push(u.bar);
    const { node: p, solo: f } = zi(l, n, () => {
      e.clock().solo(l.id);
    });
    u.video || (f.disabled = !0), o.set(l.id, f), r.append(c("article", { class: `lane${a.preferredLane === l.id ? " preferred" : ""}`, "data-lane": l.id }, u.node, p));
  }
  const d = a.observations?.length ? c("ul", { class: "note" }, ...a.observations.map((l) => c("li", {}, l))) : null;
  return {
    nodes: [i.node, r, ...d ? [d] : []],
    update(l) {
      i.update(l);
      const m = at(l);
      s.forEach((u) => u.style.width = m);
      for (const [u, p] of o)
        p.textContent = l.soloing === u ? "Stop" : "Play alone", p.setAttribute("aria-pressed", String(l.soloing === u));
    }
  };
}
const pt = () => typeof location > "u" ? "http://localhost/" : location.href;
class Is extends HTMLElement {
  static observedAttributes = ["src", "layout", "tab"];
  root;
  clock = new la();
  unsubscribe;
  current;
  set;
  tabId;
  arenaState;
  base = pt();
  load = 0;
  onHide = () => document.hidden && this.clock.hide();
  constructor() {
    super(), this.root = this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    document.addEventListener("visibilitychange", this.onHide), !this.current && !this.getAttribute("src") && this.message("Set src to a record URL.");
  }
  disconnectedCallback() {
    document.removeEventListener("visibilitychange", this.onHide), this.clock.hide();
  }
  attributeChangedCallback(t, a, n) {
    t === "src" && n && n !== a && this.fetchSource(n), t === "layout" && this.current && this.render(this.current), t === "tab" && n && this.set && n !== this.tabId && this.showTab(n);
  }
  get record() {
    return this.current;
  }
  set record(t) {
    this.setRecord(t);
  }
  /** Hands in a record or a record set; media and tab paths resolve against `baseUrl` (default: the page). */
  setRecord(t, a = pt()) {
    const n = ++this.load, i = (s) => this.message(`This record cannot be shown: ${s.message}`);
    try {
      this.accept(t, a, n).catch(i);
    } catch (s) {
      i(s);
    }
  }
  /** Not async on purpose: a bad record throws synchronously, so the message shows at once. */
  accept(t, a, n) {
    if (cs(t))
      return this.set = { data: ls(t), base: a, cache: /* @__PURE__ */ new Map() }, this.showTab(this.getAttribute("tab") ?? this.set.data.tabs[0].id, n);
    const i = ge(t);
    return this.set = void 0, this.tabId = void 0, this.base = a, this.render(i), Promise.resolve();
  }
  async fetchJson(t) {
    const a = await fetch(t);
    if (!a.ok) throw new Error(`HTTP ${a.status}`);
    return a.json();
  }
  async fetchSource(t) {
    const a = ++this.load;
    this.message("Loading…");
    try {
      const n = new URL(t, pt()).href, i = await this.fetchJson(n);
      if (a !== this.load) return;
      await this.accept(i, n, a);
    } catch (n) {
      a === this.load && this.message(`Could not load ${t}: ${n.message}`);
    }
  }
  async showTab(t, a = ++this.load) {
    const n = this.set;
    if (!n) return;
    const i = n.data.tabs.find((s) => s.id === t) ?? n.data.tabs[0];
    this.tabId = i.id;
    try {
      let s = n.cache.get(i.id);
      if (!s) {
        if (i.record) s = { record: ge(i.record), base: n.base };
        else {
          const o = new URL(i.src, n.base).href;
          s = { record: ge(await this.fetchJson(o)), base: o };
        }
        n.cache.set(i.id, s);
      }
      if (a !== this.load) return;
      this.base = s.base, this.render(s.record);
    } catch (s) {
      a === this.load && this.message(`Could not load the "${i.label}" tab: ${s.message}`);
    }
  }
  message(t) {
    this.teardown();
    const a = this.tabs();
    this.root.replaceChildren(
      c("style", {}, ma),
      ...a ? [c("div", { class: "head" }, c("div", { class: "controls" }, a))] : [],
      c("div", { class: "body" }, c("p", { class: "note" }, t))
    );
  }
  teardown() {
    this.unsubscribe?.(), this.clock.hide(), this.clock = new la();
  }
  tabs() {
    const t = this.set;
    if (!t || t.data.tabs.length < 2) return null;
    const a = c("div", { class: "seg tabs", role: "tablist", "aria-label": "Test" }), n = t.data.tabs.map((i) => i.id);
    for (const i of t.data.tabs) {
      const s = i.id === this.tabId, o = c("button", { type: "button", role: "tab", "aria-selected": String(s), tabindex: s ? "0" : "-1", "data-tab": i.id }, i.label);
      o.addEventListener("click", () => {
        this.showTab(i.id);
      }), o.addEventListener("keydown", (r) => {
        const d = r.key === "ArrowRight" ? 1 : r.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        r.preventDefault();
        const l = n[(n.indexOf(i.id) + d + n.length) % n.length];
        this.showTab(l).then(() => this.root.querySelector(`[data-tab="${l}"]`)?.focus());
      }), a.append(o);
    }
    return a;
  }
  render(t) {
    this.teardown(), this.current = t;
    const a = this.getAttribute("layout") ?? "three-up", n = c("div", { class: "error", role: "status" }), i = { record: t, base: this.base, clock: () => this.clock, error: (m) => n.textContent = m };
    let s;
    a === "arena" ? (this.arenaState = an(t, this.arenaState), s = fs(i, this.arenaState, (m) => {
      this.arenaState = m, this.render(t);
    })) : a === "inputs" ? s = ks(i) : s = a === "guidance" ? ws(i, this.getAttribute("model")) : Ss(i, a);
    const o = this.tabs(), r = [...o ? [o] : [], ...s.controls ?? []], d = c(
      "div",
      { class: "head" },
      c("div", { class: "title" }, c("h2", {}, t.title), c("span", { class: "meta" }, `${t.lanes.length} lanes`)),
      r.length ? c("div", { class: "controls" }, ...r) : null
    ), l = t.shot ? c("p", { class: "intent" }, c("span", { class: "id" }, "One shot description, composed per model: "), Pn(t.shot)) : null;
    this.root.replaceChildren(c("style", {}, ma), d, ...l ? [l] : [], n, c("div", { class: "body" }, ...s.nodes)), this.dataset.layout = a, this.unsubscribe = this.clock.subscribe((m) => {
      s.update(m), m.error && (n.textContent = m.error);
    });
  }
}
function Lt(e = "model-arena") {
  customElements.get(e) || customElements.define(e, Is);
}
const Es = {
  referenceVideo: "reference video",
  referenceImage: "reference image",
  referenceAudio: "reference audio",
  frameImage: "frame image",
  audio: "driving audio",
  video: "video"
};
function Ps(e, t) {
  const a = (s) => t.get(s.replace(/^\.\//, "")) ?? s, n = JSON.parse(JSON.stringify(e)), i = n.guide;
  if (i)
    for (const s of ["video", "audio", "firstFrame", "firstFrameStyled", "camera"]) i[s] && (i[s].src = a(i[s].src));
  for (const s of n.lanes) for (const o of s.inputsSent) o.src = a(o.src);
  return n;
}
function As(e) {
  return [
    `Inputs sent: ${e.inputsSent.map((a) => `${Es[a.role] ?? a.role} ${a.label ?? a.src}`).join(", ") || "prompt only"}`,
    `Cost: ${J(e.costUsd)}${e.costUsd === null ? "" : " reported"} (estimate ${J(e.estimate.usd)})`,
    `Seconds: ${qe(e.generationSeconds)} to generate`,
    `Model ran: ${e.modelRan ?? "not reported by the provider"}`,
    // An input the model was not sent belongs in the caption itself, not only in the notes.
    ...e.notes.filter((a) => a.startsWith("Music not sent"))
  ].join(" · ");
}
function Us(e) {
  const t = c("a", { class: "btn", download: `${e.id}.json`, "data-action": "record-json" }, "Download record JSON");
  try {
    t.href = URL.createObjectURL(new Blob([JSON.stringify(e, null, 2)], { type: "application/json" }));
  } catch {
    t.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(e))}`;
  }
  return t;
}
function Ts(e, t, a, n) {
  Lt();
  const i = document.createElement("model-arena");
  i.setAttribute("layout", "guidance"), i.setRecord(Ps(e.record, t), a);
  const s = c("a", { class: "btn", href: X(e.videoURL, a) ?? "#", download: "", target: "_blank", rel: "noopener noreferrer", "data-action": "download" }, "Download"), o = c("button", { type: "button", "data-action": "add" }, "Add to gallery"), r = c("span");
  o.addEventListener("click", () => {
    n(e.record), o.textContent = "Added", o.disabled = !0, r.replaceChildren(Us(e.record));
  });
  const d = c("details", { class: "cost-row" }, c("summary", {}, "Cost row for docs/costs.md"), c("pre", {}, e.costRowText.trim()));
  return c(
    "section",
    { class: "result", "aria-label": "Result" },
    i,
    c("p", { class: "caption", "data-caption": "" }, As(e)),
    e.notes.length ? c("ul", { class: "notes" }, ...e.notes.map((l) => c("li", {}, l))) : null,
    c("div", { class: "row" }, s, o, r),
    d
  );
}
const Rs = Yi.map((e) => `${e}: inherit;`).join(" "), nn = (
  /* css */
  `
${et}
:host { display: block; width: 100%; max-width: 100%; color: var(--ma-fg); background: var(--ma-card); border: 1px solid var(--ma-line); border-radius: var(--ma-radius-lg); font: 400 14px/1.5 var(--ma-font); container-type: inline-size; overflow: hidden; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap { display: grid; gap: 14px; padding: 16px; min-width: 0; }
h3 { margin: 0; font-size: 15px; font-weight: 600; }
fieldset { border: 1px solid var(--ma-line); border-radius: var(--ma-radius); margin: 0; padding: 10px 12px; display: grid; gap: 8px; min-width: 0; }
legend { padding: 0 4px; font-size: 12px; color: var(--ma-muted); }
.models { display: grid; gap: 6px; }
.model-opt { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; align-items: start; padding: 6px 8px; border-radius: var(--ma-radius); border: 1px solid transparent; cursor: pointer; }
.model-opt:has(input:checked) { border-color: var(--ma-accent); background: var(--ma-bg); }
.model-opt .line { grid-column: 2; font-size: 12px; color: var(--ma-muted); }
.badge { display: inline-block; margin-left: 6px; font: 11px var(--ma-mono); padding: 1px 6px; border-radius: 4px; background: var(--ma-chip); color: var(--ma-warn); }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
@container (max-width: 560px) { .fields { grid-template-columns: 1fr; } .pair, .compare-grid { grid-template-columns: 1fr !important; } }
label.f { display: grid; gap: 3px; min-width: 0; font-size: 12px; color: var(--ma-muted); }
input[type="text"], input[type="number"], textarea { width: 100%; min-width: 0; font: 13px var(--ma-font); color: var(--ma-fg); background: var(--ma-input); border: 1px solid var(--ma-line); border-radius: var(--ma-radius); padding: 6px 8px; }
textarea { min-height: 72px; resize: vertical; }
input[type="number"] { max-width: 120px; }
button, .btn { font: inherit; cursor: pointer; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-input); color: var(--ma-fg); padding: 4px 12px; min-height: 34px; text-decoration: none; display: inline-flex; align-items: center; }
button.primary { background: var(--ma-accent); color: var(--ma-accent-fg); border-color: var(--ma-accent); font-weight: 600; min-width: 96px; }
button:disabled { opacity: 0.5; cursor: default; }
button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--ma-accent); outline-offset: 2px; }
.row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; min-width: 0; }
.row.spread { justify-content: space-between; }
.note { margin: 0; font-size: 12px; color: var(--ma-muted); }
.err { margin: 0; color: var(--ma-warn); font-size: 13px; }
.err:empty, .status:empty { display: none; }
.status { margin: 0; font: 12px var(--ma-mono); color: var(--ma-muted); }
.drop { border: 1px dashed var(--ma-line); border-radius: var(--ma-radius); padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.drop.over { border-color: var(--ma-accent); }
.drop img { width: 56px; height: 56px; object-fit: cover; border-radius: 4px; }
.preview { display: grid; gap: 8px; min-width: 0; }
.prompt-card { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-bg); min-width: 0; }
.prompt-card .line, .prompt-card .tags { margin: 0; font-size: 12px; color: var(--ma-muted); }
.prompt-card a, a { color: var(--ma-fg); font-size: 12px; }
pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 var(--ma-mono); background: var(--ma-input); border-radius: 6px; padding: 8px; max-height: 260px; overflow: auto; }
.notes { margin: 0; padding-left: 18px; font-size: 12px; color: var(--ma-muted); }
.compare summary { cursor: pointer; font-size: 13px; }
.compare-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.confirm { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--ma-accent); border-radius: var(--ma-radius); background: var(--ma-bg); }
.result { display: grid; gap: 10px; min-width: 0; }
.caption { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
.caption strong { font-weight: 600; }
.switch { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--ma-line); border-radius: 8px; overflow: hidden; max-width: 100%; }
.switch button { border: 0; border-radius: 0; background: transparent; color: var(--ma-muted); min-height: 32px; }
.switch button + button { border-left: 1px solid var(--ma-line); }
.switch button[aria-pressed="true"] { background: var(--ma-accent); color: var(--ma-accent-fg); }
.empty { padding: 32px 16px; text-align: center; color: var(--ma-muted); }
.empty strong { display: block; color: var(--ma-fg); font-size: 15px; margin-bottom: 4px; }
model-arena, arena-key { ${Rs} }
`
), me = () => typeof location > "u" ? "http://localhost/" : location.href;
class Ms extends HTMLElement {
  static observedAttributes = ["guide-src", "preset"];
  /** A fake or wrapped fetch for the provider; the page's fetch otherwise. */
  fetch;
  pollOptions;
  /** Replaces the inline "spend up to" check. */
  confirm;
  root;
  urls = /* @__PURE__ */ new Map();
  base = me();
  loaded;
  refs = {};
  slots;
  abort;
  ownKey;
  ui;
  pending;
  constructor() {
    super(), this.root = this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    this.ui || this.build();
    const t = this.getAttribute("preset"), a = this.getAttribute("guide-src");
    t && !this.loaded ? this.fetchPreset(t) : a && !this.loaded && this.loadFrom(a);
  }
  attributeChangedCallback(t, a, n) {
    !this.ui || !n || n === a || (t === "preset" ? this.fetchPreset(n) : this.loadFrom(n));
  }
  /** A bundle: FileList, File[] or name → Blob. */
  set guide(t) {
    this.pending = this.setGuide(t, me());
  }
  /** The loaded guide, or undefined. */
  get guide() {
    return this.loaded;
  }
  /** Host-supplied reference images; a missing role is cleared. */
  set references(t) {
    this.pending = Promise.all([this.setRef("character", t?.character), this.setRef("environment", t?.environment)]).then(() => {
    });
  }
  get references() {
    return { ...this.refs.character ? { character: this.refs.character.input } : {}, ...this.refs.environment ? { environment: this.refs.environment.input } : {} };
  }
  set preset(t) {
    this.pending = this.loadPreset(t);
  }
  /** Resolves once the last guide, references or preset handed in has loaded. */
  whenReady() {
    return this.pending ?? Promise.resolve();
  }
  /** Loads a bundle, its references, shot and model; URLs resolve against `baseUrl`. */
  async loadPreset(t, a = me()) {
    this.ui || this.build();
    const n = this.ui;
    try {
      const i = as(t), s = (d) => new URL(d, a).href, { files: o, dir: r } = await da(s(i.bundle));
      await this.setGuide(o, r, !0);
      for (const d of ["character", "environment"]) {
        const l = i.references?.[d];
        await this.setRef(d, l ? await ns(s(l)) : void 0);
      }
      if (i.shot) for (const [d] of yt) n.fields[d].value = i.shot[d] ?? "";
      i.model && n.setModel(i.model), n.override.value = i.prompt ?? "", n.own.open = !!n.override.value, this.refresh();
    } catch (i) {
      this.fail(`Could not load the preset: ${i.message}`);
    }
  }
  async fetchPreset(t) {
    try {
      const a = new URL(t, me()).href, n = await fetch(a);
      if (!n.ok) throw new Error(`HTTP ${n.status}`);
      this.pending = this.loadPreset(await n.json(), a), await this.pending;
    } catch (a) {
      this.fail(`Could not load the preset: ${a.message}`);
    }
  }
  async loadFrom(t) {
    try {
      const { files: a, dir: n } = await da(new URL(t, me()).href);
      this.pending = this.setGuide(a, n, !0), await this.pending;
    } catch (a) {
      this.fail(`Could not load the guide bundle: ${a.message}`);
    }
  }
  keySource() {
    const t = this.getAttribute("key-panel"), a = t ? document.getElementById(t) : null;
    if (a && typeof a.getKey == "function") return a;
    const n = document.querySelector("arena-key");
    return n && typeof n.getKey == "function" ? n : this.ownKey;
  }
  shot() {
    const t = this.ui.fields, a = (n) => t[n].value.trim();
    return a("subject") ? { subject: a("subject"), action: a("action"), ...a("environment") ? { environment: a("environment") } : {}, ...a("legend") ? { legend: a("legend") } : {} } : null;
  }
  async setGuide(t, a, n = !1) {
    const i = this.ui ?? (this.build(), this.ui);
    try {
      const s = /* @__PURE__ */ new Map(), o = Array.isArray(t) || t.length !== void 0 ? Array.from(t) : null;
      if (o) for (const l of o) s.set(l.name.split(/[\\/]/).pop(), l);
      else for (const [l, m] of Object.entries(t)) s.set(l, m);
      const r = await ja(Ya(t), n ? { base: a } : {});
      for (const [l, m] of this.urls) Object.values(this.refs).some((u) => u?.media.displaySrc === l) || URL.revokeObjectURL(m);
      this.urls = new Map([...s].filter(([l]) => !l.endsWith(".json")).map(([l, m]) => [l, URL.createObjectURL(m)]));
      for (const l of Object.values(this.refs)) l && this.urls.set(l.media.displaySrc ?? l.media.name, l.url);
      this.base = a, this.loaded = r;
      for (const [l] of yt) {
        const m = r.shot?.[l];
        m && !i.fields[l].value && !this.getAttribute(l) && (i.fields[l].value = m);
      }
      const d = r.meta;
      i.guideInfo.textContent = `Guide: ${r.video.name} · ${d.width}×${d.height} · ${d.fps} fps · ${r.seconds} s${r.audio ? ` · audio ${r.audio.name}` : " · no audio"}`, i.error.textContent = "", this.refresh();
    } catch (s) {
      this.fail(s.message);
    }
  }
  async setRef(t, a) {
    this.ui || this.build();
    const n = this.slots[t], i = this.refs[t];
    if (i && URL.revokeObjectURL(i.url), delete this.refs[t], n.shown.replaceChildren(), a)
      try {
        const s = await wt(a, t), o = a instanceof Blob ? a : a.blob, r = URL.createObjectURL(o);
        this.refs[t] = { input: a, media: s, url: r }, this.urls.set(s.displaySrc ?? s.name, r);
        const d = c("button", { type: "button", "data-action": `clear-${t}` }, "Remove");
        d.addEventListener("click", () => {
          this.setRef(t, void 0).then(() => this.refresh());
        }), n.shown.append(c("img", { src: r, alt: t === "character" ? "Character sheet" : "Environment" }), c("span", { class: "note" }, `${s.name}${s.info?.width ? ` · ${s.info.width}×${s.info.height}` : ""}`), d);
      } catch (s) {
        this.fail(s.message, "refused");
      }
    this.refresh();
  }
  fail(t, a = "bad-bundle") {
    this.ui && (this.ui.error.textContent = t), this.dispatchEvent(new CustomEvent("arena-generate-error", { bubbles: !0, composed: !0, detail: { code: a, message: t } }));
  }
  refresh() {
    const t = this.ui, a = {
      seconds: this.loaded?.seconds ?? 5,
      hasAudio: this.loaded ? !!this.loaded.audio : !0,
      hasCharacter: !!this.refs.character,
      hasEnvironment: !!this.refs.environment,
      audioInVideo: this.loaded?.meta.audioInVideo === !0,
      audioSeconds: this.loaded?.audio?.info?.seconds
    };
    t.preview.replaceChildren(rs({ shot: this.shot(), override: t.override.value, model: t.model(), facts: a }));
    let n = "Load a guide bundle to see the estimate.";
    if (this.loaded)
      try {
        const i = Xa({ guide: this.loaded, model: t.model(), shot: this.shot() ?? void 0, prompt: t.override.value, character: this.refs.character?.media, environment: this.refs.environment?.media });
        n = `Estimated ${J(i.plan.estimate.usd)} (${i.plan.estimate.basis}). Sends: ${i.plan.inputsSent.map((s) => `${s.role} ${s.label}`).join(", ")}.`;
      } catch (i) {
        n = i.message;
      }
    t.estimate.textContent = n, t.run.disabled = !this.loaded || !!this.abort;
  }
  askInline(t) {
    const a = this.ui.confirmSlot;
    return new Promise((n) => {
      const i = c("button", { type: "button", class: "primary", "data-action": "confirm" }, `Spend up to ${J(t.usd)}`), s = c("button", { type: "button", "data-action": "cancel" }, "Cancel"), o = (r) => (a.replaceChildren(), n(r));
      i.addEventListener("click", () => o(!0)), s.addEventListener("click", () => o(!1)), a.replaceChildren(
        c("div", { class: "confirm", role: "group", "aria-label": "Confirm cost" }, c("p", { class: "caption" }, `${t.modelName}: estimated ${J(t.usd)} (${t.basis}); your cap is ${J(t.maxPrice)}.`), c("div", { class: "row" }, i, s))
      ), i.focus();
    });
  }
  async run() {
    const t = this.ui;
    if (!this.loaded) return;
    const a = this.keySource();
    if (!a?.connected) return this.fail("Connect your Runware key first.", "invalid-key");
    this.abort = new AbortController(), t.run.disabled = !0, t.stop.hidden = !1, t.error.textContent = "", t.result.replaceChildren();
    try {
      const n = await Di({
        guide: this.loaded,
        model: t.model(),
        shot: this.shot() ?? void 0,
        prompt: t.override.value,
        references: this.references,
        maxPrice: Number(t.maxPrice.value),
        key: a.getKey,
        confirm: this.confirm ?? ((o) => this.askInline(o)),
        signal: this.abort.signal,
        fetch: this.fetch,
        poll: this.pollOptions,
        onProgress: (o) => {
          t.status.textContent = `${o.stage}: ${o.message}${o.progress !== void 0 ? ` ${o.progress}%` : ""}`, this.dispatchEvent(new CustomEvent("arena-generate-progress", { bubbles: !0, composed: !0, detail: { ...o } }));
        }
      });
      t.result.replaceChildren(
        Ts(
          n,
          this.urls,
          this.base,
          (o) => this.dispatchEvent(new CustomEvent("arena-gallery-add", { bubbles: !0, composed: !0, detail: { record: o, base: this.base } }))
        )
      );
      const { task: i, ...s } = n;
      this.dispatchEvent(new CustomEvent("arena-generate-result", { bubbles: !0, composed: !0, detail: s }));
    } catch (n) {
      const i = n instanceof P ? n : new P("provider", n.message);
      this.fail(i.message, i.code);
    } finally {
      this.abort = void 0, t.stop.hidden = !0, t.confirmSlot.replaceChildren(), this.refresh();
    }
  }
  build() {
    const t = es((n) => this.getAttribute(n));
    this.ui = t, this.slots = {
      character: sa("character", (n) => {
        this.setRef("character", n);
      }),
      environment: sa("environment", (n) => {
        this.setRef("environment", n);
      })
    }, t.bundleInput.addEventListener("change", () => t.bundleInput.files?.length && void (this.pending = this.setGuide(t.bundleInput.files, me()))), t.run.addEventListener("click", () => {
      this.run();
    }), t.stop.addEventListener("click", () => this.abort?.abort());
    for (const n of [...Object.values(t.fields), t.override]) n.addEventListener("input", () => this.refresh());
    for (const { r: n } of t.radios) n.addEventListener("change", () => this.refresh());
    const a = c("div");
    this.keySource() || (Qa(), this.ownKey = document.createElement("arena-key"), a.append(this.ownKey)), this.root.replaceChildren(
      c("style", {}, nn),
      c(
        "div",
        { class: "wrap" },
        c("h3", {}, "Generate from this guide"),
        a,
        c("div", { class: "row" }, t.bundleInput, t.guideInfo),
        t.modelSet,
        t.shotSet,
        c("fieldset", {}, c("legend", {}, "Reference images"), this.slots.character.node, this.slots.environment.node),
        t.preview,
        c("div", { class: "row" }, c("label", { class: "f" }, "Price cap, USD", t.maxPrice), t.run, t.stop),
        t.estimate,
        t.confirmSlot,
        t.status,
        t.error,
        t.result
      )
    ), this.refresh();
  }
}
function Fs(e = "arena-generate") {
  customElements.get(e) || customElements.define(e, Ms);
}
const ht = () => typeof location > "u" ? "http://localhost/" : location.href, ga = 50;
function Ls(e) {
  return e ? [`${e.subject} ${e.action}`.trim(), e.environment, e.legend].filter(Boolean).join(" · ") : null;
}
class js extends HTMLElement {
  static observedAttributes = ["src"];
  root;
  entries = [];
  index = 0;
  view = "inputs";
  skipped = [];
  load = 0;
  constructor() {
    super(), this.root = this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    Lt(), this.getAttribute("src") || this.render();
  }
  attributeChangedCallback(t, a, n) {
    n && n !== a && this.fetchList(n);
  }
  get records() {
    return this.entries.map((t) => t.record);
  }
  set records(t) {
    this.entries = [], this.skipped = [];
    for (const a of Array.isArray(t) ? t.slice(0, ga) : []) this.accept(a, ht());
    this.index = 0, this.render();
  }
  /** Adds a record and shows it. Returns false when it does not validate. */
  add(t, a = ht()) {
    const n = this.accept(t, a);
    return n && (this.index = this.entries.length - 1), this.render(), n;
  }
  accept(t, a) {
    try {
      const n = ge(t), i = this.entries.findIndex((s) => s.record.id === n.id);
      return i >= 0 ? this.entries[i] = { record: n, base: a } : this.entries.push({ record: n, base: a }), !0;
    } catch (n) {
      return this.skipped.push(n.message), !1;
    }
  }
  async fetchList(t) {
    const a = ++this.load;
    try {
      const n = new URL(t, ht()).href, i = await fetch(n);
      if (!i.ok) throw new Error(`HTTP ${i.status}`);
      const s = await i.json(), o = Array.isArray(s) ? s : Array.isArray(s.records) ? s.records : null;
      if (!o) throw new Error("expected an array of records");
      const r = [];
      this.skipped = [];
      for (const d of o.slice(0, ga))
        if (typeof d == "string") {
          const l = new URL(d, n).href, m = await fetch(l);
          if (!m.ok) {
            this.skipped.push(`${d}: HTTP ${m.status}`);
            continue;
          }
          r.push(...this.tryParse(await m.json(), l));
        } else r.push(...this.tryParse(d, n));
      if (a !== this.load) return;
      this.entries = r, this.index = 0, this.render();
    } catch (n) {
      a === this.load && this.render(`Could not load ${t}: ${n.message}`);
    }
  }
  tryParse(t, a) {
    try {
      return [{ record: ge(t), base: a }];
    } catch (n) {
      return this.skipped.push(n.message), [];
    }
  }
  render(t) {
    const a = c("style", {}, nn);
    if (!this.entries.length) {
      this.root.replaceChildren(
        a,
        c("div", { class: "empty", "data-empty": "" }, c("strong", {}, "No published runs yet"), t ?? "Runs added to the gallery show up here, playable without a key.")
      );
      return;
    }
    const n = this.entries[Math.min(this.index, this.entries.length - 1)], i = !!n.record.guide, s = i ? this.view : "arena", o = c("div", { class: "switch", role: "group", "aria-label": "Run" });
    this.entries.forEach((f, w) => {
      const h = c("button", { type: "button", "aria-pressed": String(f === n), "data-record": f.record.id }, f.record.title.slice(0, 48));
      h.addEventListener("click", () => (this.index = w, this.render())), o.append(h);
    });
    const r = c("div", { class: "switch", role: "group", "aria-label": "View" });
    for (const [f, w] of [["inputs", "Inputs and outputs"], ["guidance", "Guide beside output"], ["arena", "All outputs"]]) {
      const h = c("button", { type: "button", "aria-pressed": String(s === f), "data-view": f }, w);
      h.disabled = f !== "arena" && !i, h.addEventListener("click", () => (this.view = f, this.render())), r.append(h);
    }
    const d = document.createElement("model-arena");
    d.setAttribute("layout", s), d.setRecord(n.record, n.base);
    const l = n.record.lanes.find((f) => f.shot) ?? n.record.lanes[0], m = Ls(l?.shot ?? n.record.shot), u = is(n.record, n.base);
    let p = null;
    u && (p = c("button", { type: "button", "data-action": "run-yourself" }, "Run this yourself"), p.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("arena-run-yourself", { bubbles: !0, composed: !0, detail: { preset: u, record: n.record } }));
      const f = this.getAttribute("generate"), w = f ? document.getElementById(f) : null;
      w?.loadPreset && (w.loadPreset(u), w.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    })), this.root.replaceChildren(
      a,
      c(
        "div",
        { class: "wrap" },
        c("div", { class: "row spread" }, o, r),
        d,
        c("div", { class: "row spread" }, m ? c("p", { class: "caption", "data-shot": "" }, c("strong", {}, "Shot: "), m) : c("span"), p),
        this.skipped.length ? c("p", { class: "note" }, `${this.skipped.length} record(s) skipped: ${this.skipped[0]}`) : null
      )
    );
  }
}
function Cs(e = "arena-gallery") {
  customElements.get(e) || customElements.define(e, js);
}
const Vs = () => typeof location > "u" ? "http://localhost/" : location.href;
function Os(e, t, a, n = 24) {
  return Number.isFinite(t) ? a ? Math.abs(e - t) > 1e-3 : Math.abs(e - t) > 1 / n : !1;
}
const Ns = (
  /* css */
  `
${et}
:host { display: block; position: relative; background: #000; border-radius: var(--ma-radius); overflow: hidden; aspect-ratio: 16 / 9; }
video { width: 100%; height: 100%; display: block; object-fit: contain; }
.err { position: absolute; inset: auto 8px 8px 8px; margin: 0; font: 12px var(--ma-font); color: var(--ma-warn); }
.err:empty { display: none; }
`
);
class Ds extends HTMLElement {
  static observedAttributes = ["src", "controls", "muted", "label"];
  video;
  root;
  err;
  target = 0;
  constructor() {
    super(), this.root = this.attachShadow({ mode: "open" }), this.video = c("video", { playsinline: "", preload: "auto", "data-player": "" }), this.video.muted = !0, this.video.controls = !0, this.err = c("p", { class: "err", role: "status" }), this.video.addEventListener("loadedmetadata", () => {
      this.dispatchEvent(new CustomEvent("arena-player-ready", { bubbles: !0, composed: !0, detail: { duration: this.video.duration } })), this.target && (this.video.currentTime = Math.min(this.target, this.video.duration || this.target));
    }), this.video.addEventListener("error", () => {
      this.err.textContent = "The clip did not load.", this.dispatchEvent(new CustomEvent("arena-player-error", { bubbles: !0, composed: !0, detail: { message: this.err.textContent } }));
    }), this.root.replaceChildren(c("style", {}, Ns), this.video, this.err);
  }
  attributeChangedCallback(t) {
    if (t === "src") {
      const a = X(this.getAttribute("src") ?? "", Vs());
      this.err.textContent = "", a ? this.video.src = a : this.video.removeAttribute("src");
    }
    t === "controls" && (this.video.controls = this.getAttribute("controls") !== "none"), t === "muted" && (this.video.muted = this.getAttribute("muted") !== "false"), t === "label" && this.video.setAttribute("aria-label", this.getAttribute("label") ?? "Generated clip");
  }
  get fps() {
    const t = Number(this.getAttribute("fps"));
    return t > 0 && t <= 240 ? t : 24;
  }
  get duration() {
    return this.video.duration;
  }
  get paused() {
    return this.video.paused;
  }
  get muted() {
    return this.video.muted;
  }
  set muted(t) {
    this.video.muted = t;
  }
  get currentTime() {
    return this.video.currentTime;
  }
  /** The host's time, every frame if it likes; the video seeks only when it must. */
  set currentTime(t) {
    this.follow(t);
  }
  follow(t) {
    const a = this.video.duration, n = Math.max(0, Number.isFinite(a) && a > 0 ? Math.min(t, a) : t);
    this.target = n, Os(this.video.currentTime, n, this.video.paused, this.fps) && (this.video.currentTime = n);
  }
  seek(t) {
    this.target = Math.max(0, t), this.video.currentTime = this.target;
  }
  async play() {
    try {
      await this.video.play();
    } catch (t) {
      this.err.textContent = t.name === "NotAllowedError" ? "Press play on the page to start the clip." : "";
    }
  }
  pause() {
    this.video.pause();
  }
}
function Gs(e = "arena-player") {
  customElements.get(e) || customElements.define(e, Ds);
}
const sn = (e) => Math.round(e * 1e6) / 1e6, on = (e = "") => new TextEncoder().encode(e).length;
function Bs(e, t) {
  return e.outputTokensPerImage === void 0 || t.references > 0 && e.inputTokensPerImage === void 0 ? null : sn(e.outputTokensPerImage * e.rates.imageOutput + on(t.prompt) * e.rates.textInput + t.references * (e.inputTokensPerImage ?? 0) * e.rates.imageInput);
}
function Ks(e, t) {
  if (t.resolution) return e.output.find((n) => n.presets?.includes(t.resolution));
  if (!t.width || !t.height) return;
  const a = t.width * t.height;
  return e.output.find((n) => a <= n.upToPixels);
}
function _s(e, t) {
  const a = e.approx, n = t > 0 ? "reference-to-image" : "text-to-image", i = e.examples.filter((s) => s.mode === n && s.outputTokens !== void 0).map((s) => (s.usd - s.outputTokens * e.rates.imageOutput - (s.references ?? 0) * a.perReference * e.rates.imageInput) / e.rates.textInput);
  return Math.max(0, Math.ceil(Math.max(0, ...i)));
}
function zs(e, t) {
  const a = e.approx;
  if (!a) return null;
  const n = Ks(a, t);
  if (!n) return null;
  const i = _s(e, t.references), s = i + on(t.prompt), o = n.tokens * e.rates.imageOutput + t.references * a.perReference * e.rates.imageInput + s * e.rates.textInput, r = sn(o * (1 + a.margin)), d = t.references ? ` + ${t.references} × about ${a.perReference.toLocaleString("en-GB")} reference tokens` : "";
  return {
    usd: r,
    approximate: !0,
    basis: `about $${r}: an estimate, not a strict bound. Priced per token (${e.ratesText}); output ${n.label} about ${n.tokens.toLocaleString("en-GB")} image tokens${d}; text about ${s.toLocaleString("en-GB")} tokens (the prompt plus a rewrite allowance of ${i.toLocaleString("en-GB")}, the most the published examples imply); plus a ${Math.round(a.margin * 100)}% margin. Source: ${a.source}`
  };
}
const Ws = (e) => Math.max(...e.examples.map((t) => t.usd)), $t = (e) => e.examples.map((t) => `${t.mode} $${t.usd}`).join(", ");
function rn(e, t) {
  const a = Bs(e, t);
  if (a !== null) return { usd: a, basis: `up to $${a} (priced per token: ${e.ratesText})` };
  const n = zs(e, t);
  return n || {
    usd: null,
    basis: e.approx ? `priced per token (${e.ratesText}); Runware publishes no token count for an output of this size (the approximate figures stop at 4K), so there is no estimate. Published examples: ${$t(e)}` : `priced per token (${e.ratesText}); Runware publishes no token count for this size and quality, so there is no upper bound. Published examples: ${$t(e)}`
  };
}
const q = "https://runware.ai/docs/models", Ee = "13 Nov 2026", kt = ["FLUX", "OpenAI GPT Image", "MiniMax H3", "ByteDance Seedream", "Kling IMAGE"], ue = (e) => ({ slug: e, schemaUrl: `${q}/${e}/schema.json`, pageUrl: `${q}/${e}` }), dn = (e, t) => () => ({ usd: e, basis: t }), cn = (e) => Object.values(e.pairs).flat(), ln = (e, t, a) => Object.entries(e.pairs).find(([, n]) => n.some(([i, s]) => i === t && s === a))?.[0], Hs = {
  key: "klein-9b",
  air: "runware:400@2",
  ...ue("bfl-flux-2-klein-9b"),
  name: "FLUX.2 [klein] 9B",
  family: "FLUX",
  provider: "runware-api",
  maker: "Black Forest Labs",
  prompt: { min: 1, max: 1e4 },
  references: { max: 4, minRatio: 0.125, maxRatio: 8 },
  // Required width and height: 128-2048, multiples of 16. 1280×720 matches a 16:9 guide frame.
  size: { kind: "grid", min: 128, max: 2048, multipleOf: 16, default: [1280, 720] },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: !1,
  pricing: {
    kind: "compute-time",
    summary: "Billed by compute time; no rate. Measured 1024×1024 at 4 steps $0.00078; examples $0.00078-$0.00338",
    source: `${q}/bfl-flux-2-klein-9b/schema.json x-pricing`,
    read: "10 Nov 2026"
  },
  // No per-unit rate: "billed by compute time". The bound is the highest published example price.
  estimate: dn(338e-5, "no published rate (compute-time billing); bounded by the highest published example, $0.00338")
}, ba = [[512 * 512, 3e-3], [1024 * 1024, 6e-3], [2048 * 2048, 0.0179], [4096 * 4096, 0.1013]], wa = [[768 * 1344, 0.0149], [1024 * 1536, 0.0149]], Xs = {
  key: "flux-3-image-klein",
  air: "bfl:flux@3-image-klein",
  ...ue("bfl-flux-3-image-klein"),
  name: "FLUX 3 Image Klein",
  family: "FLUX",
  provider: "runware-api",
  maker: "Black Forest Labs",
  prompt: { min: 1, max: 1e4 },
  // x-constraints: each reference at least 16 px a side; maxItems 4.
  references: { max: 4, minSide: 16 },
  // Width and height 128-4096 in multiples of 16, required without a reference.
  size: { kind: "grid", min: 128, max: 4096, multipleOf: 16, default: [1280, 720] },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: !1,
  pricing: {
    kind: "compute-time",
    summary: "Billed by compute time; no rate. Measured at 16 steps: 512² $0.003, 1024² $0.006, 2048² $0.0179, 4096² $0.1013; reference examples $0.0149",
    source: `${q}/bfl-flux-3-image-klein/schema.json x-pricing`,
    read: Ee
  },
  estimate(e) {
    const t = (e.width ?? 1280) * (e.height ?? 720), a = ba.find(([o]) => o >= t) ?? ba.at(-1), n = Math.round(Math.sqrt(a[0]));
    let i = a[1], s = `compute-time billing, no rate; bounded by the measured run at ${n}×${n} (16 steps), $${a[1]}`;
    if (e.references > 0) {
      const o = Math.max(...wa.map(([d]) => d));
      if (t > o)
        return { usd: null, basis: `compute-time billing; no published run with reference images above ${(o / 1e6).toFixed(2)} MP, so no bound` };
      const r = Math.max(...wa.map(([, d]) => d));
      r > i && (i = r, s = `compute-time billing, no rate; bounded by the highest published reference example, $${r}`);
    }
    return { usd: i, basis: s };
  },
  notOffered: ["settings.boundingBoxes", "steps", "seed"]
}, ya = { "0.75K": 0.041, "1K": 0.048, "2K": 0.1, "4K": 0.607 }, un = {
  key: "flux-3-image",
  air: "bfl:flux@3-image",
  ...ue("bfl-flux-3-image"),
  name: "FLUX 3 Image",
  family: "FLUX",
  provider: "runware-api",
  maker: "Black Forest Labs",
  prompt: { min: 2, max: 32e3 },
  // maxItems 10; x-constraints: each at least 128 px a side.
  references: { max: 10, minSide: 128 },
  size: {
    kind: "list",
    // allOf: width/height, when sent, must be one of these pairs (titles name the tier).
    pairs: {
      "0.75K": [[1168, 496], [1088, 544], [1024, 576], [944, 624], [912, 656], [880, 672], [864, 688], [768, 768], [688, 864], [672, 880], [656, 912], [624, 944], [576, 1024], [544, 1088], [496, 1168]],
      "1K": [[1568, 672], [1440, 720], [1360, 768], [1248, 832], [1216, 864], [1184, 880], [1152, 912], [1024, 1024], [912, 1152], [880, 1184], [864, 1216], [832, 1248], [768, 1360], [720, 1440], [672, 1568]],
      "2K": [[3136, 1344], [2896, 1440], [2736, 1536], [2512, 1664], [2416, 1728], [2368, 1776], [2288, 1824], [2048, 2048], [1824, 2288], [1776, 2368], [1728, 2416], [1664, 2512], [1536, 2736], [1440, 2896], [1344, 3136]],
      "4K": [[6256, 2688], [5792, 2896], [5456, 3072], [5024, 3344], [4848, 3456], [4736, 3552], [4576, 3664], [4096, 4096], [3664, 4576], [3552, 4736], [3456, 4848], [3344, 5024], [3072, 5456], [2896, 5792], [2688, 6256]]
    },
    default: [1360, 768],
    // allOf: `resolution` only with referenceImages, never beside width/height; schema default 1K.
    withReference: { field: "resolution", values: ["0.75K", "1K", "2K", "4K"], default: "1K" },
    pairsWithReference: !0
  },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: !1,
  pricing: {
    kind: "per-image",
    summary: "Per image: 0.75K $0.041, 1K $0.048, 2K $0.10, 4K $0.607",
    source: `${q}/bfl-flux-3-image/schema.json x-pricing`,
    read: Ee
  },
  estimate(e) {
    const t = e.resolution ?? (e.width && e.height ? ln(un.size, e.width, e.height) : "1K") ?? "4K";
    return { usd: ya[t], basis: `x-pricing: ${t} at $${ya[t]} per image` };
  },
  notOffered: ["settings.boundingBoxes", "settings.grounding", "settings.safetyTolerance"]
}, Js = { textInput: 5e-6, imageInput: 8e-6, imageOutput: 3e-5 }, va = "text input $5.00, image input $8.00, image output $30.00 per 1M tokens", mn = (e, t) => {
  const a = `openai-gpt-image-2-6-${e.toLowerCase()}`, n = { rates: Js, ratesText: va, examples: t };
  return {
    key: `gpt-image-2.6-${e.toLowerCase()}`,
    air: `openai:gpt-image@2.6-${e.toLowerCase()}`,
    ...ue(a),
    name: `GPT-Image-2.6 ${e}`,
    family: "OpenAI GPT Image",
    provider: "runware-api",
    maker: "OpenAI",
    prompt: { min: 2, max: 32e3 },
    // maxItems 16; x-constraints: each at most 50 MB.
    references: { max: 16, maxBytes: 52428800 },
    // Width and height optional: 16-3840 in multiples of 16; area 655,360-8,294,400 px (not GIF); ratio 1:3 to 3:1.
    size: { kind: "grid", min: 16, max: 3840, multipleOf: 16, default: [1280, 720], area: { min: 655360, max: 8294400 }, ratio: { min: 1 / 3, max: 3 } },
    outputFormats: ["JPG", "PNG", "WEBP", "SVG", "GIF"],
    transparency: !0,
    // settings.quality enum and default from the schema; the quality guide: quality and size set the output tokens.
    quality: { values: ["auto", "max", "xhigh", "high", "medium", "low"], default: "auto" },
    pricing: { kind: "token", summary: `Per token: ${va}`, source: `${q}/${a}/schema.json x-pricing`, read: Ee },
    tokens: n,
    estimate: (i) => rn(n, i),
    notOffered: ["inputs.maskImage", "inputs.markupImage", "outputFormat SVG and GIF (no references allowed beside them)", "settings.quality", "settings.thinkingLevel"]
  };
}, Ys = mn("Flare", [
  { mode: "inpaint", usd: 0.0587 },
  { mode: "text-to-gif", usd: 0.118 },
  { mode: "text-to-image", usd: 0.167 },
  { mode: "text-to-vector", usd: 0.174 },
  { mode: "transparent-background", usd: 0.175 },
  { mode: "reference-to-image", usd: 0.193 }
]), Zs = mn("Sunburst", [
  { mode: "text-to-gif", usd: 0.0374 },
  { mode: "text-to-image", usd: 0.0431 },
  { mode: "text-to-vector", usd: 0.0634 },
  { mode: "inpaint", usd: 0.0771 },
  { mode: "transparent-background", usd: 0.0788 },
  { mode: "reference-to-image", usd: 0.192 }
]), xa = (e) => ({
  output: [
    { upToPixels: 42e5, tokens: 4100, label: "up to about 4 MP", presets: ["1K", "2K"] },
    { upToPixels: 5472 * 3072, tokens: 16400, label: "4K", presets: ["4K"] }
  ],
  perReference: 2050,
  margin: 0.25,
  source: `${q}/${e} (Pricing), read ${Ee}`
}), pn = (e) => {
  const t = e ? "minimax-h3-image-highspeed" : "minimax-h3-image", a = (s) => ({ mode: "text-to-image", usd: s, references: 0, outputTokens: 4100 }), n = (s) => ({ mode: "reference-to-image", usd: s, references: 2, outputTokens: 4100 }), i = e ? {
    rates: { textInput: 23e-7, imageInput: 3e-6, imageOutput: 76e-7 },
    ratesText: "text input $2.30, image input $3.00, image output $7.60 per 1M tokens",
    examples: [a(0.0418), a(0.0422), n(0.0725), n(0.0743)],
    approx: xa(t)
  } : {
    rates: { textInput: 23e-7, imageInput: 15e-7, imageOutput: 38e-7 },
    ratesText: "text input $2.30, image input $1.50, image output $3.80 per 1M tokens",
    examples: [a(0.0176), a(0.0189), n(0.0432), n(0.0432)],
    approx: xa(t)
  };
  return {
    key: e ? "h3-image-highspeed" : "h3-image",
    air: e ? "minimax:h3@image-highspeed" : "minimax:h3@image",
    ...ue(t),
    name: e ? "MiniMax H3 Image Highspeed" : "MiniMax H3 Image",
    family: "MiniMax H3",
    provider: "runware-api",
    maker: "MiniMax",
    prompt: { min: 1, max: 32e3 },
    // maxItems 16; x-constraints: each 128-8192 px a side, ratio 1:4 to 4:1, at most 64 MB.
    references: { max: 16, minSide: 128, maxSide: 8192, minRatio: 0.25, maxRatio: 4, maxBytes: 67108864 },
    // Width and height 468-7745 (no grid); area 655,360-20,000,000 px; ratio 1:3 to 3:1; or `resolution`.
    size: { kind: "grid", min: 468, max: 7745, multipleOf: 1, default: [1280, 720], area: { min: 655360, max: 2e7 }, ratio: { min: 1 / 3, max: 3 }, resolution: { values: ["1K", "2K", "4K"] } },
    outputFormats: ["JPG", "PNG", "WEBP"],
    transparency: !1,
    pricing: {
      kind: "token",
      summary: `Per token: ${i.ratesText}; about 4,100 image tokens up to about 4 MP, about 16,400 at 4K, about 2,050 per reference (estimate with a 25% margin)`,
      source: `${q}/${t}/schema.json x-pricing and the model page's Pricing paragraph`,
      read: Ee
    },
    tokens: i,
    estimate: (s) => rn(i, s),
    notOffered: ["settings.promptOptimizer (must stay on without width/height or with references)"]
  };
}, Qs = pn(!1), qs = pn(!0), eo = 261e4, to = {
  key: "seedream-5.5",
  air: "bytedance:seedream@5.5",
  ...ue("bytedance-seedream-5-5"),
  name: "Seedream 5.5",
  family: "ByteDance Seedream",
  provider: "runware-api",
  maker: "ByteDance",
  prompt: { min: 1, max: 1e4 },
  // maxItems 10; x-constraints: each at least 15 px a side, ratio 1:16 to 16:1, at most 30 MB and 36 MP.
  references: { max: 10, minSide: 15, minRatio: 0.0625, maxRatio: 16, maxBytes: 31457280, maxPixels: 36e6 },
  // Width and height 256-16383 (no grid); area 921,600-4,624,220 px; ratio 1:16 to 16:1; or `resolution` (default 2K).
  size: { kind: "grid", min: 256, max: 16383, multipleOf: 1, default: [1280, 720], area: { min: 921600, max: 4624220 }, ratio: { min: 0.0625, max: 16 }, resolution: { values: ["1K", "1.5K", "2K"] } },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: !0,
  pricing: {
    kind: "per-image",
    summary: "Per image: up to 1.5K (2.61 MP) $0.02, 2K (above 2.61 MP) $0.035; plus $0.008 per input image",
    source: `${q}/bytedance-seedream-5-5/schema.json x-pricing`,
    read: Ee
  },
  estimate(e) {
    const t = e.resolution ? e.resolution !== "2K" : e.width && e.height ? e.width * e.height <= eo : !1, a = t ? 0.02 : 0.035, n = 8e-3 * e.references, i = Math.round((a + n) * 1e4) / 1e4, s = t ? "up to 1.5K (2.61 MP)" : `2K (above 2.61 MP)${e.resolution || e.width ? "" : ", the schema default"}`;
    return { usd: i, basis: `x-pricing: ${s} at $${a} per image${e.references ? ` + $0.008 × ${e.references} input image${e.references > 1 ? "s" : ""}` : ""}` };
  },
  notOffered: ["settings.layerDecomposition", "settings.safetyIdentifier"]
}, ao = {
  key: "kling-image-3",
  air: "klingai:kling-image@3",
  ...ue("klingai-image-3-0"),
  name: "Kling IMAGE 3.0",
  family: "Kling IMAGE",
  provider: "runware-api",
  maker: "Kling AI",
  prompt: { min: 1, max: 2500 },
  references: { max: 1 },
  size: {
    kind: "list",
    // Without a reference, width/height must be one of these pairs; with one, `resolution` follows its aspect.
    pairs: {
      "1K": [[1024, 1024], [1248, 832], [832, 1248], [1168, 880], [880, 1168], [768, 1360], [1360, 768], [1552, 656]],
      "2K": [[2048, 2048], [2496, 1664], [1664, 2496], [2336, 1760], [1760, 2336], [1536, 2720], [2720, 1536], [3104, 1312]]
    },
    default: [1360, 768],
    withReference: { field: "resolution", values: ["1K", "2K"], default: "1K" },
    pairsWithReference: !1
  },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: !1,
  pricing: { kind: "per-image", summary: "$0.028 per image", source: `${q}/klingai-image-3-0/schema.json x-pricing`, read: "10 Nov 2026" },
  estimate: dn(0.028, "x-pricing: $0.028 per image")
}, be = [
  Hs,
  un,
  Xs,
  Ys,
  Zs,
  Qs,
  qs,
  to,
  ao
];
function jt(e) {
  const t = be.find((a) => a.key === e || a.air === e || a.slug === e);
  if (!t) throw new v(`Unknown image model "${e}". Use one of: ${be.map((a) => a.key).join(", ")}.`);
  return t;
}
const St = ["PNG", "JPG", "WEBP"], $e = (e) => Number.isInteger(e) ? String(e) : e.toFixed(2);
function It(e) {
  if (e.kind === "list") {
    const a = Object.entries(e.pairs).map(([n, i]) => `${i.length} at ${n}`);
    return `${cn(e).length} fixed width×height pairs (${a.join(", ")}; default ${e.default.join("×")}); with a reference, resolution ${e.withReference.values.join("/")}${e.pairsWithReference ? " or a listed pair" : ""}`;
  }
  const t = [`${e.min}-${e.max} px a side${e.multipleOf > 1 ? ` in multiples of ${e.multipleOf}` : ""}`];
  return e.area && t.push(`${(e.area.min / 1e6).toFixed(2)}-${(e.area.max / 1e6).toFixed(2)} MP`), e.ratio && t.push(`aspect ${$e(e.ratio.min)}-${$e(e.ratio.max)}`), e.resolution && t.push(`or resolution ${e.resolution.values.join("/")}`), t.join(", ");
}
function $a(e, t, a) {
  if (t < e.min || t > e.max || a < e.min || a > e.max || t % e.multipleOf || a % e.multipleOf)
    return `sizes are ${e.min}-${e.max} px${e.multipleOf > 1 ? ` in multiples of ${e.multipleOf}` : ""}`;
  if (e.area && (t * a < e.area.min || t * a > e.area.max)) return `width × height must be ${e.area.min}-${e.area.max} px`;
  if (e.ratio && (t / a < e.ratio.min - 1e-9 || t / a > e.ratio.max + 1e-9)) return `the aspect must be ${$e(e.ratio.min)}-${$e(e.ratio.max)}`;
}
function no(e, t, a) {
  let n = 1;
  e.area && t * a < e.area.min && (n = Math.sqrt(e.area.min / (t * a))), e.area && t * a > e.area.max && (n = Math.sqrt(e.area.max / (t * a)));
  const i = n > 1 ? Math.ceil : n < 1 ? Math.floor : Math.round, s = (o) => Math.min(e.max, Math.max(e.min, i(o * n / e.multipleOf) * e.multipleOf));
  return [s(t), s(a)];
}
function io(e, t, a) {
  const n = e.references, { width: i, height: s, bytes: o } = t.info ?? {};
  if (n.maxBytes && o && o > n.maxBytes)
    throw new v(`${e.name} takes reference images up to ${Math.round(n.maxBytes / 1048576)} MB; ${t.name} is ${(o / 1048576).toFixed(1)} MB. Re-save it smaller.`);
  if (!i || !s) {
    (n.minSide || n.maxSide || n.minRatio || n.maxPixels) && a.push(`${t.name}: its size is not known here, so ${e.name}'s reference limits were not checked; Runware checks them.`);
    return;
  }
  if (n.minSide && Math.min(i, s) < n.minSide)
    throw new v(`${e.name} takes reference images at least ${n.minSide} px a side; ${t.name} is ${i}×${s}. Use a larger image.`);
  if (n.maxSide && Math.max(i, s) > n.maxSide)
    throw new v(`${e.name} takes reference images up to ${n.maxSide} px a side; ${t.name} is ${i}×${s}. Resize it.`);
  if (n.maxPixels && i * s > n.maxPixels)
    throw new v(`${e.name} takes reference images up to ${n.maxPixels / 1e6} MP; ${t.name} is ${(i * s / 1e6).toFixed(1)} MP. Resize it.`);
  if (n.minRatio && i / s < n.minRatio || n.maxRatio && i / s > n.maxRatio)
    throw new v(`${e.name} takes reference images with aspect ${$e(n.minRatio ?? 0)}-${$e(n.maxRatio ?? 1 / 0)}; ${t.name} is ${(i / s).toFixed(2)}. Crop it.`);
}
function so(e, t = globalThis.crypto.randomUUID()) {
  const a = jt(e.model), n = e.prompt.trim();
  if (n.length < a.prompt.min || n.length > a.prompt.max)
    throw new v(`${a.name} takes a prompt of ${a.prompt.min}-${a.prompt.max} characters.`);
  const i = { taskType: "imageInference", taskUUID: t, model: a.air, positivePrompt: n }, s = [], o = [], r = [], d = [...e.reference ? [e.reference] : [], ...e.references ?? []];
  if (d.length > a.references.max)
    throw new v(`${a.name} takes ${a.references.max === 1 ? "one reference image" : `up to ${a.references.max} reference images`}; got ${d.length}.`);
  if (d.length) {
    const w = d.map((h) => {
      if (io(a, h, r), o.push({ role: "referenceImage", src: h.displaySrc ?? h.name, label: h.name }), /^https:\/\//.test(h.ref)) return h.ref;
      if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(h.ref)) throw new v(`${h.name}: the reference must be an https URL or an image file.`);
      const g = _a(s.length + 1, h.name);
      return s.push({ placeholder: g, media: h }), g;
    });
    i.inputs = { referenceImages: w };
  }
  const l = d.find((w) => w.info?.width && w.info?.height), m = a.size;
  if (e.width !== void 0 && e.resolution) throw new v(`${a.name} takes a resolution or a width and height, not both.`);
  m.kind === "grid" ? oo(a, m, e, l, i, r) : ro(a, m, e, d.length > 0, i, r);
  const u = e.outputFormat ?? "PNG";
  if (!St.includes(u) || !a.outputFormats.includes(u))
    throw new v(`${a.name} still formats: ${a.outputFormats.filter((w) => St.includes(w)).join(", ")}.`);
  if (e.transparent) {
    if (!a.transparency) throw new v(`${a.name} has no transparent background in its schema; pick one that has (${be.filter((w) => w.transparency).map((w) => w.key).join(", ")}).`);
    if (u === "JPG") throw new v(`${a.name} makes a transparent background only as PNG or WEBP.`);
    i.settings = { background: "transparent" };
  }
  if (e.quality !== void 0) {
    if (!a.quality) throw new v(`${a.name} has no quality setting in its schema.`);
    if (!a.quality.values.includes(e.quality)) throw new v(`${a.name} quality: ${a.quality.values.join(", ")} (default ${a.quality.default}).`);
    i.settings = { ...i.settings, quality: e.quality };
  }
  Object.assign(i, { outputType: "URL", outputFormat: u, numberResults: 1, deliveryMethod: "async", includeCost: !0 });
  const p = a.estimate({
    width: i.width,
    height: i.height,
    resolution: i.resolution,
    references: d.length,
    prompt: n
  });
  let f;
  return p.usd === null && a.tokens ? (f = { highestExampleUsd: Ws(a.tokens), rates: a.tokens.ratesText, examples: $t(a.tokens) }, r.push(`${a.name}: no published upper bound (${p.basis}). A run needs allowUnpriced (CLI --allow-unpriced); the cap is then compared with the highest published example, $${f.highestExampleUsd}.`)) : p.usd === null && r.push(`${a.name}: no price estimate (${p.basis}). A run with a price cap is refused.`), { modelId: a.air, modelName: a.name, uploads: s, task: i, inputsSent: o, estimate: p, ...f ? { unpriced: f } : {}, notes: r };
}
function oo(e, t, a, n, i, s) {
  if (a.resolution) {
    if (!t.resolution) throw new v(`${e.name} has no resolution preset; give --width and --height (${It(t)}).`);
    if (!t.resolution.values.includes(a.resolution)) throw new v(`${e.name} resolutions: ${t.resolution.values.join(", ")}.`);
    i.resolution = a.resolution;
    return;
  }
  if (a.width !== void 0 || a.height !== void 0) {
    const [d, l] = [a.width ?? 0, a.height ?? 0], m = $a(t, d, l);
    if (m) throw new v(`${e.name} ${m}; got ${d}×${l}. Rule: ${It(t)}.`);
    i.width = d, i.height = l;
    return;
  }
  let [o, r] = t.default;
  if (n) {
    const [d, l] = [n.info.width, n.info.height], [m, u] = no(t, d, l);
    $a(t, m, u) ? s.push(`${n.name} (${d}×${l}) does not fit ${e.name}'s output sizes, so the still is ${o}×${r}; the reference is sent as it is.`) : ([o, r] = [m, u], (m !== d || u !== l) && s.push(`Output size ${m}×${u}, ${t.multipleOf > 1 && !t.area ? `snapped (multiples of ${t.multipleOf})` : "fitted to the model's size rule"} from ${n.name}'s ${d}×${l}; the reference is sent as it is.`));
  }
  i.width = o, i.height = r;
}
function ro(e, t, a, n, i, s) {
  const o = cn(t), r = (u, p) => o.some(([f, w]) => f === u && w === p);
  if (n && (a.width === void 0 || !t.pairsWithReference)) {
    if (a.width !== void 0)
      throw new v(`${e.name} with a reference takes --resolution (${t.withReference.values.join(" or ")}), not a width and height; the output follows the reference's aspect.`);
    const u = a.resolution ?? t.withReference.default;
    if (!t.withReference.values.includes(u)) throw new v(`${e.name} resolutions: ${t.withReference.values.join(", ")}.`);
    i.resolution = u, s.push(`${e.name} matches the reference's aspect ratio at ${u}.`);
    return;
  }
  if (a.resolution) throw new v(`${e.name} takes --resolution only beside a reference image.`);
  const [d, l] = [a.width ?? t.default[0], a.height ?? t.default[1]];
  if (!r(d, l)) throw new v(`${e.name} sizes: ${o.map(([u, p]) => `${u}×${p}`).join(", ")}.`);
  i.width = d, i.height = l;
  const m = ln(t, d, l);
  m && Object.keys(t.pairs).length > 1 && s.push(`${d}×${l} is a ${m} size.`);
}
function co(e, t, a = !1) {
  const n = e.estimate;
  if (n.usd !== null)
    return n.usd > t ? { ok: !1, code: "over-price", message: `Estimated $${n.usd.toFixed(4)} (${n.basis}) is over your cap of $${t.toFixed(2)}.` } : { ok: !0, usd: n.usd, basis: n.basis, priced: n.approximate ? "estimate" : "bound" };
  const i = e.unpriced;
  return i ? a ? i.highestExampleUsd > t ? { ok: !1, code: "over-price", message: `${e.modelName} has no published bound, and its highest published example, $${i.highestExampleUsd}, is over your cap of $${t.toFixed(2)}.` } : {
    ok: !0,
    usd: i.highestExampleUsd,
    basis: `no published upper bound: priced per token (${i.rates}); highest published example $${i.highestExampleUsd} (examples: ${i.examples}). The real cost may be higher.`,
    priced: "unpriced",
    rates: i.rates,
    examples: i.examples
  } : { ok: !1, code: "no-estimate", message: `${e.modelName} is priced per token (${i.rates}) and Runware publishes no upper bound for it. Pass allowUnpriced: true to run it with the cap compared to the highest published example ($${i.highestExampleUsd}).` } : { ok: !1, code: "no-estimate", message: `No price estimate for ${e.modelName} (${n.basis}); it cannot be checked against maxPrice.` };
}
async function lo(e, t, a = {}) {
  const n = /* @__PURE__ */ new Map();
  for (const r of t.uploads)
    a.onUpload?.(r.media.name), n.set(r.placeholder, (await e.upload(r.media.ref, a.signal)).mediaUUID);
  const i = Wa(t.task, n);
  a.onSubmit?.();
  const { errors: s } = await e.post([i], a.signal), o = s.filter((r) => !r.taskUUID || r.taskUUID === i.taskUUID);
  if (o.length) throw new ne(400, o);
  return { task: i, result: await Mi(e, String(i.taskUUID), a) };
}
const uo = /^[\x21-\x7e]{16,512}$/, ka = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
async function mo(e, t) {
  const a = `reference ${t + 1}`;
  if (typeof e == "string") {
    if (!/^https:\/\//.test(e)) throw new P("refused", `The ${a} URL must start with https://.`);
    const r = decodeURIComponent(new URL(e).pathname.split("/").pop() || a);
    return { name: r, contentType: je(r) ?? "image/*", ref: e, displaySrc: e };
  }
  const n = e instanceof Blob ? e : e.blob;
  if (!(n instanceof Blob)) throw new P("refused", `The ${a} must be an image Blob or an https URL.`);
  if (!ka[n.type]) throw new P("refused", `The ${a} must be PNG, JPEG or WebP; got ${n.type || "an unknown type"}.`);
  let s = ((e instanceof Blob ? e.name : e.name ?? e.blob.name) || `reference-${t + 1}`).split(/[\\/]/).pop();
  je(s) !== n.type && (s = `${s.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${ka[n.type]}`);
  const o = e instanceof Blob ? void 0 : e.src;
  try {
    return await Fa(ze(n, s), o && /^https?:\/\//.test(o) ? o : void 0);
  } catch (r) {
    throw new P("refused", `The ${a}: ${r.message}`);
  }
}
async function ko(e) {
  const t = e.key, a = typeof t == "function" ? t : typeof t == "string" ? () => t : () => t.getKey(), n = new Ke({ getKey: a, fetch: e.fetch }), i = (r) => n.redact(r), s = (r) => e.onProgress?.(r);
  let o;
  try {
    if (!(typeof e.maxPrice == "number" && Number.isFinite(e.maxPrice) && e.maxPrice > 0 && e.maxPrice <= 100))
      throw new P("refused", "maxPrice must be a positive number of USD up to 100.");
    const r = a();
    if (!r || !uo.test(r)) throw new P("invalid-key", "Connect a Runware API key first (16-512 characters, no spaces).");
    s({ stage: "plan", message: "checking the references" });
    const d = await Promise.all((e.references ?? []).map(mo)), l = e.size ?? {}, m = so(
      {
        model: e.model,
        prompt: e.prompt,
        references: d,
        ...l.resolution !== void 0 ? { resolution: l.resolution } : {},
        ...l.width !== void 0 || l.height !== void 0 ? { width: l.width, height: l.height } : {},
        ...e.transparent ? { transparent: !0 } : {},
        ...e.outputFormat ? { outputFormat: e.outputFormat } : {},
        ...e.quality !== void 0 ? { quality: e.quality } : {}
      },
      e.taskUUID
    ), u = co(m, e.maxPrice, e.allowUnpriced === !0);
    if (!u.ok) throw new P(u.code, u.message);
    if (s({
      stage: "confirm",
      message: u.priced === "bound" ? `up to $${u.usd.toFixed(4)}` : u.priced === "estimate" ? `about $${u.usd.toFixed(4)} (estimate)` : `no published bound; highest example $${u.usd}`
    }), !await e.confirm({
      model: m.modelId,
      modelName: m.modelName,
      usd: u.usd,
      basis: u.basis,
      maxPrice: e.maxPrice,
      inputs: m.inputsSent,
      prompt: String(m.task.positivePrompt),
      priced: u.priced,
      ...u.rates ? { rates: u.rates, examples: u.examples } : {}
    })) throw new P("not-confirmed", "Not confirmed; nothing was sent.");
    if (e.signal?.aborted) throw new P("aborted", "Stopped. Nothing was submitted.");
    const f = Date.now(), { task: w, result: h } = await lo(n, m, {
      timeoutMs: 10 * 6e4,
      ...e.poll,
      signal: e.signal,
      onUpload: (U) => s({ stage: "upload", message: `uploading ${U}` }),
      onSubmit: () => {
        o = String(m.task.taskUUID), s({ stage: "submit", message: "submitting" });
      },
      onProgress: (U, F) => s({ stage: "poll", message: U, progress: F })
    }), g = (Date.now() - f) / 1e3, b = {
      date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      model: m.modelId,
      modelRan: m.modelId,
      taskUUID: h.taskUUID,
      duration: "-",
      resolution: Ea(w),
      inputs: m.inputsSent.length ? m.inputsSent.map((U) => U.role).join("+") : "prompt",
      estimateUsd: m.estimate.usd,
      costUsd: h.cost,
      seconds: g,
      output: h.imageURL,
      status: "ok (browser)"
    }, x = [...m.notes];
    return d.length && x.push(`${d.length === 1 ? "The reference was" : `All ${d.length} references were`} sent as given: none resized or dropped.`), u.priced === "unpriced" && x.push(`Ran without a published bound (allowUnpriced): the cap was compared with the highest published example, $${u.usd}; the cost Runware reported is ${h.cost === null ? "missing" : `$${h.cost}`}.`), h.cost !== null && h.cost > e.maxPrice && x.push(`Reported cost $${h.cost} is over the cap of $${e.maxPrice}.`), s({ stage: "done", message: "done" }), {
      imageURL: h.imageURL,
      costUsd: h.cost,
      taskUUID: h.taskUUID,
      // A named model runs as asked; there is no router on this path.
      modelRan: m.modelId,
      estimate: m.estimate,
      inputsSent: m.inputsSent,
      notes: x,
      generationSeconds: g,
      costRow: b,
      costRowText: Ia(b),
      task: w
    };
  } catch (r) {
    throw Za(r, e.signal, o, i);
  }
}
const po = "https://runware.ai/docs/models", te = "13 Nov 2026", L = (e, t) => `${po}/${e}/guides/${t}`, ft = [
  "Say first what the image is for, then describe it one area of the frame at a time.",
  "Give every count as a number and every position against the frame.",
  "Put any words to render in double quotes, and finish with no text or no other text.",
  "With references, say what each image is before anything else, then list what must stay the same."
], Sa = [
  "Open with the task and where the image will be used, then the arrangement, then details and light.",
  "Write counts as numbers and place things against the frame, not against each other.",
  "Call references image 1, image 2 in the order sent, one job each, and say what may change.",
  "Always send a size or 1K/2K: with no size the model returns 4K at about four times the cost."
], hn = [
  {
    key: "klein-9b",
    guide: { url: null, read: te, related: [], note: "no model guide published" },
    tips: [
      "Describe the subject, the setting, the framing and the light in plain sentences.",
      "Name what each reference image is for.",
      "Keep sizes on its grid of 16 px; the reference sets the default size."
    ],
    dialect: "neutral"
  },
  {
    key: "flux-3-image",
    guide: { url: L("bfl-flux-3-image", "prompting"), read: te, related: [L("bfl-flux-3-image", "multi-reference-composition")] },
    tips: [
      "Write the subject, the action, the place, the composition and the style, in that order.",
      "There is no negative prompt: describe what is there instead of what is missing.",
      "Give the light a direction and a hardness.",
      "Refer to references as image 1, image 2, give each a job and say whose light wins."
    ],
    dialect: "flux3"
  },
  {
    key: "flux-3-image-klein",
    guide: { url: L("bfl-flux-3-image-klein", "prompting"), read: te, related: [L("bfl-flux-3-image-klein", "multi-reference-composition")] },
    tips: [
      "Write a full caption: framing, subject, background and light, then a style line.",
      "Nothing rewrites the prompt here, so every clause you leave out is the model's choice.",
      "State absences as what is there, such as a plain blank wall.",
      "Up to four references; name each by number and restate its key details."
    ],
    dialect: "klein3"
  },
  {
    key: "gpt-image-2.6-flare",
    guide: {
      url: L("openai-gpt-image-2-6-flare", "prompting"),
      read: te,
      related: [L("openai-gpt-image-2-6-flare", "editing-images"), L("openai-gpt-image-2-6-flare", "quality-and-thinking-level")]
    },
    tips: [...ft.slice(0, 3), "Try quality low for drafts; quality and size decide how many output tokens you pay for."],
    dialect: "gpt"
  },
  {
    key: "gpt-image-2.6-sunburst",
    guide: {
      url: L("openai-gpt-image-2-6-sunburst", "detailed-editing"),
      read: te,
      related: [L("openai-gpt-image-2-6-flare", "prompting"), L("openai-gpt-image-2-6-flare", "editing-images")],
      note: "Sunburst takes the same request as Flare; its own guide covers detailed edits, and the Flare guides cover prompting"
    },
    tips: [ft[0], ft[3], "Change one thing per edit and list everything else to keep.", "Check every quoted string in the result; one wrong character is the usual miss."],
    dialect: "gpt"
  },
  {
    key: "h3-image",
    guide: {
      url: L("minimax-h3-image", "prompting"),
      read: te,
      related: [L("minimax-h3-image", "multi-reference-composition"), L("minimax-h3-image", "prompt-optimizer")]
    },
    tips: Sa,
    dialect: "h3"
  },
  {
    key: "h3-image-highspeed",
    guide: {
      url: L("minimax-h3-image", "prompting"),
      read: te,
      related: [L("minimax-h3-image", "multi-reference-composition"), L("minimax-h3-image", "prompt-optimizer")],
      note: "no separate guide; the MiniMax H3 Image guide says Highspeed takes the same requests"
    },
    tips: Sa,
    dialect: "h3"
  },
  {
    key: "seedream-5.5",
    guide: { url: L("bytedance-seedream-5-5", "prompting"), read: te, related: [L("bytedance-seedream-5-5", "multi-reference-composition")] },
    tips: [
      "Write it as a brief: what it is for, then subject, setting, light, lens and framing, one clause each.",
      "Describe materials and parts, not only colours, and finish with what to leave out.",
      "Keep it under about 600 words.",
      "Call references image 1, image 2 in the order sent; keep the character as image 1 across a set."
    ],
    dialect: "seedream"
  },
  {
    key: "kling-image-3",
    guide: { url: null, read: te, related: [], note: "no model guide published" },
    tips: [
      "Describe the subject, the setting, the framing and the light in plain sentences.",
      "It takes one reference; say what it is for.",
      "Prompts are limited to 2,500 characters."
    ],
    dialect: "neutral"
  }
];
function fn(e) {
  return hn.find((t) => t.key === e);
}
function So() {
  return hn.map(({ key: e, guide: t, tips: a }) => ({ key: e, guide: { ...t, related: [...t.related] }, tips: [...a] }));
}
function ho(e) {
  const t = e.size.default, a = fn(e.key);
  return {
    key: e.key,
    name: e.name,
    air: e.air,
    family: e.family,
    provider: e.provider,
    maker: e.maker,
    accepts: {
      text: !0,
      referenceImages: { ...e.references },
      transparent: e.transparency,
      quality: e.quality ? { values: [...e.quality.values], default: e.quality.default } : null,
      outputFormats: e.outputFormats.filter((n) => St.includes(n)),
      notOffered: [...e.notOffered ?? []]
    },
    prompt: { ...e.prompt },
    size: { rule: structuredClone(e.size), summary: It(e.size), default: [t[0], t[1]] },
    estimate: e.estimate({ width: t[0], height: t[1], references: 0 }),
    pricing: { ...e.pricing },
    guide: { ...a.guide, related: [...a.guide.related] },
    tips: [...a.tips],
    schemaUrl: e.schemaUrl,
    pageUrl: e.pageUrl
  };
}
const fo = () => [...be].sort((e, t) => kt.indexOf(e.family) - kt.indexOf(t.family) || be.indexOf(e) - be.indexOf(t));
function go() {
  return fo().map(ho);
}
function Io() {
  const e = go();
  return kt.map((t) => ({ family: t, models: e.filter((a) => a.family === t) })).filter((t) => t.models.length);
}
const bo = { landscape: "a wide landscape frame", portrait: "a tall portrait frame", square: "a square frame" }, H = (e) => e.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, ""), z = (e) => e.length < 2 ? e.join("") : `${e.slice(0, -1).join(", ")} and ${e.at(-1)}`, Et = (e) => e ? e[0].toUpperCase() + e.slice(1) + "." : "";
function wo(e) {
  const t = e.kind === "free" ? void 0 : e.kind;
  return (e.references ?? []).map((a, n) => {
    const i = n + 1, s = a.note ? H(a.note) : void 0;
    return a.role === "character" && t !== "environment" ? { n: i, noun: "character", role: "the character to show", keep: "face, hair, build and clothing", mayChange: t === "character" ? "pose and framing" : void 0, styleOnly: !1, note: s } : a.role === "character" ? { n: i, noun: "character", role: "a style reference, used only for its art style and colour palette", keep: "art style and colour palette", styleOnly: !0, note: s } : a.role === "environment" && t !== "character" ? { n: i, noun: "place", role: "the place to show", keep: "layout, architecture and materials", mayChange: e.camera ? "camera position" : void 0, styleOnly: !1, note: s } : a.role === "environment" ? { n: i, noun: "setting", role: "a style reference, used only for its colour palette and the colour of its light", keep: "colour palette", styleOnly: !0, note: s } : { n: i, noun: s ?? "reference", role: s ? `a reference for ${s}` : "a style reference", styleOnly: !0 };
  });
}
function yo(e) {
  const t = H(e.subject), a = e.style ? H(e.style) : void 0, n = bo[e.orientation ?? (e.kind === "character", "landscape")];
  return e.kind === "character" ? {
    deliverable: `a character reference sheet${a ? ` in ${a}` : ""}, for use as a reference image`,
    subject: t,
    layout: "three full-body views of the same character side by side: the front view on the left, the side profile in the middle and the back view on the right",
    action: "standing in a neutral pose with the arms relaxed at the sides",
    setting: "a plain light grey studio background",
    settingAsState: "the background is plain, even light grey and unmarked",
    light: "soft, even studio light from the front, the shadows faint and diffuse",
    camera: "straight-on at mid-body height, the whole figure in each view with space above the head and below the feet",
    frame: n,
    exclusions: ["no text", "no labels", "no logos"]
  } : e.kind === "environment" ? {
    deliverable: `an environment view for a film shot${a ? ` in ${a}` : ""}`,
    subject: t,
    layout: "the place on its own",
    action: "empty and still",
    setting: t,
    settingAsState: "the place is empty of people and every surface is unlettered",
    light: e.light ? H(e.light) : "",
    camera: e.camera ? H(e.camera) : "",
    frame: n,
    exclusions: ["no people", "no text"]
  } : { deliverable: "", subject: t, layout: "", action: "", setting: "", settingAsState: "", light: e.light ? H(e.light) : "", camera: e.camera ? H(e.camera) : "", frame: n, exclusions: [], style: a };
}
function pe(e, t) {
  const a = e.filter((n) => n.keep && !n.styleOnly).map((n) => `the ${n.keep} ${t(n)}`);
  return a.length ? `Keep ${z(a)}` : "";
}
const vo = {
  gpt(e, t, a) {
    const n = [];
    t.length && n.push(z(t.map((s) => `${s.n === 1 ? "Image" : "image"} ${s.n} is ${s.role}${s.note ? ` (${s.note})` : ""}`))), a.kind === "free" ? n.push(e.subject) : (n.push(`${e.deliverable}, in ${e.frame}: ${e.subject}`), n.push(`${e.layout}, ${e.action}`), n.push(`${e.setting === e.subject ? "" : `On ${e.setting}, `}${e.light}${e.camera ? `, camera ${e.camera}` : ""}`.replace(/^, /, "")));
    for (const s of t.filter((o) => o.styleOnly)) n.push(`Take only the ${s.keep ?? "style"} from image ${s.n}, not its content`);
    const i = pe(t, (s) => `of the ${s.noun} from image ${s.n}`);
    return i && n.push(`${i} exactly as ${t.filter((s) => s.keep && !s.styleOnly).length > 1 ? "they are" : "it is"}`), e.exclusions.length && n.push(z(e.exclusions)), n;
  },
  h3(e, t, a) {
    const n = [];
    t.length && n.push(`Use ${z(t.map((r) => `image ${r.n} as ${r.role}`))}`), a.kind === "free" ? n.push(e.subject) : (n.push(`${e.deliverable}, in ${e.frame}`), n.push(a.kind === "character" ? `${e.subject}, shown in ${e.layout}, ${e.action}` : `${e.subject}, ${e.action}`), e.camera && n.push(`The camera is ${e.camera}`), n.push(a.kind === "character" ? "Plain empty space around each view" : "The frame holds only the place"), a.kind === "character" && n.push(`${e.setting}, ${e.light}`));
    const i = t.find((r) => r.noun === "place" || r.noun === "setting" && !r.styleOnly);
    a.kind === "environment" && e.light && n.push(i ? `Relight the place from image ${i.n} with ${e.light}` : e.light);
    const s = pe(t, (r) => `from image ${r.n}`);
    s && n.push(s);
    for (const r of t.filter((d) => d.styleOnly)) n.push(`Take only the ${r.keep ?? "style"} from image ${r.n}`);
    const o = t.filter((r) => r.mayChange).map((r) => r.mayChange);
    return o.length && n.push(`The ${z([...new Set(o)])} can change`), e.exclusions.length && n.push(z(e.exclusions)), n;
  },
  seedream(e, t, a) {
    const n = [];
    t.length && n.push(z(t.map((s) => `${s.n === 1 ? "Image" : "image"} ${s.n} is ${s.role}${s.note ? ` (${s.note})` : ""}`))), a.kind === "free" ? n.push(e.subject) : (n.push(e.deliverable), n.push(a.kind === "character" ? `The subject is ${e.subject}, ${e.action}` : `The setting is ${e.subject}, ${e.action}`), a.kind === "character" && n.push(`The setting is ${e.setting}`), e.light && n.push(`The light is ${e.light}`), n.push(a.kind === "character" ? "50mm lens, straight-on" : e.camera ? `The camera is ${e.camera}` : ""), n.push(`Framing: ${a.kind === "character" ? e.layout : "the place fills the frame"}, in ${e.frame}`));
    const i = pe(t, (s) => `of the ${s.noun} from image ${s.n}`);
    i && n.push(i);
    for (const s of t.filter((o) => o.styleOnly)) n.push(`Take only the ${s.keep ?? "style"} from image ${s.n}`);
    return e.exclusions.length && n.push(z(e.exclusions)), n.filter(Boolean);
  },
  flux3(e, t, a) {
    const n = [];
    t.length && n.push(z(t.map((o) => `${o.n === 1 ? "Image" : "image"} ${o.n} supplies ${o.role}`))), a.kind === "free" ? n.push(e.subject) : a.kind === "character" ? (n.push(`${e.subject}, shown in ${e.layout}`), n.push(e.action), n.push(`${e.frame}, the camera ${e.camera}, a soft contact shadow under each view`)) : (n.push(e.subject), n.push(e.settingAsState), e.camera ? n.push(`${e.frame}, the camera ${e.camera}`) : n.push(`In ${e.frame}`));
    const i = t.find((o) => o.noun === "place");
    e.light && n.push(i ? `The light of the scene wins: ${e.light}` : e.light), a.kind === "character" && n.push(e.settingAsState), a.style && n.push(H(a.style));
    const s = pe(t, (o) => `of the ${o.noun} from image ${o.n}`);
    s && n.push(s);
    for (const o of t.filter((r) => r.styleOnly)) n.push(`Take only the ${o.keep ?? "style"} from image ${o.n}`);
    return n;
  },
  klein3(e, t, a) {
    const n = [], i = (o) => `the ${o.noun} from image ${o.n}${o.note ? `, ${o.note}` : ""}`;
    if (a.kind === "free") n.push(e.subject);
    else if (a.kind === "character")
      n.push(`${Et(e.frame).slice(0, -1)} showing ${e.layout}, ${e.camera}`), n.push(`The subject is ${t.find((o) => o.noun === "character" && !o.styleOnly) ? i(t.find((o) => o.noun === "character" && !o.styleOnly)) + ", " : ""}${e.subject}, ${e.action}`), n.push(`The background is ${e.setting}, plain and blank`), n.push(`The lighting is ${e.light}`);
    else {
      const o = t.find((r) => r.noun === "place");
      n.push(`${Et(e.frame).slice(0, -1)}${e.camera ? `, the camera ${e.camera}` : ""}`), n.push(o ? `Use image ${o.n} as the scene: ${e.subject}` : `The scene is ${e.subject}`), n.push(e.settingAsState), e.light && n.push(`The lighting is ${e.light}`);
    }
    for (const o of t.filter((r) => r.styleOnly)) n.push(`Take only the ${o.keep ?? "style"} of image ${o.n}${o.note ? `, ${o.note}` : ""}`);
    const s = pe(t, (o) => `of the ${o.noun} from image ${o.n}`);
    return s && n.push(s), n.push(a.style ? `Style: ${H(a.style)}` : a.kind === "free" ? "" : "Style: clean reference illustration"), n.filter(Boolean);
  },
  neutral(e, t, a) {
    const n = [], i = (o) => jt(a.model).references.max === 1 ? "the reference image" : `image ${o.n}`;
    t.length && n.push(z(t.map((o) => `${i(o)} is ${o.role}`))), a.kind === "free" ? n.push(e.subject) : (n.push(`${e.deliverable}: ${e.subject}`), a.kind === "character" && n.push(`${e.layout}, ${e.action}`), n.push(a.kind === "character" ? `${e.setting}, ${e.light}` : [e.light, e.camera && `camera ${e.camera}`].filter(Boolean).join(", ")), n.push(e.frame));
    const s = pe(t, (o) => `from ${i(o)}`);
    s && n.push(s);
    for (const o of t.filter((r) => r.styleOnly)) n.push(`Take only the ${o.keep ?? "style"} from ${i(o)}`);
    return e.exclusions.length && n.push(z(e.exclusions)), n;
  }
};
function Eo(e) {
  const t = jt(e.model), a = fn(t.key);
  if (!a) throw new v(`No prompt guide entry for ${t.name}.`);
  if (!H(e.subject)) throw new v("Describe the subject.");
  const n = e.references ?? [];
  if (n.length > t.references.max)
    throw new v(`${t.name} takes ${t.references.max === 1 ? "one reference image" : `up to ${t.references.max} reference images`}; got ${n.length}.`);
  const i = [], s = wo(e), o = yo(e), r = vo[a.dialect](o, s, e).map((l) => Et(H(l))).filter((l) => l.length > 1).join(" ");
  if (r.length > t.prompt.max) throw new v(`The composed prompt is ${r.length} characters; ${t.name} takes up to ${t.prompt.max}. Shorten the subject.`);
  a.dialect === "seedream" && r.split(/\s+/).length > 600 && i.push(`${t.name}: the guide recommends under about 600 words; this prompt has ${r.split(/\s+/).length}.`);
  const d = n.findIndex((l) => l.role === "character");
  return e.kind === "character" && d > 0 && (a.dialect === "gpt" || a.dialect === "seedream") && i.push(`${t.name}: send the character reference first; its guide treats image 1 as the base to keep.`), e.kind === "environment" && !e.light && i.push("No light or time of day given; the model will choose one."), e.kind === "environment" && !e.camera && i.push("No camera height given; say the one the shot uses."), a.dialect === "h3" && i.push(`${t.name}: send a size or 1K/2K; with none it returns 4K at about four times the image tokens.`), a.dialect === "seedream" && n.length > 1 && i.push(`${t.name}: references of different shapes leave the output ratio open; send width and height.`), a.guide.url || i.push(`${t.name}: no model guide published; the prompt uses plain clauses.`), { prompt: r, notes: i };
}
Lt();
Qa();
Gs();
Fs();
Cs();
export {
  js as ArenaGallery,
  Ms as ArenaGenerate,
  Qi as ArenaKey,
  Ds as ArenaPlayer,
  Si as COMPARE_MODEL_KEYS,
  ve as GUIDE_MODEL_KEYS,
  P as GenerateError,
  Is as ModelArena,
  Ke as RunwareClient,
  St as STILL_FORMATS,
  Yi as TOKEN_NAMES,
  co as checkImagePrice,
  Ai as comparePrompts,
  Eo as composeImagePrompt,
  xo as composePrompt,
  It as describeSize,
  Ya as entriesOf,
  Di as generateFromGuide,
  ko as generateImage,
  Ha as guideModels,
  Io as imageFamilies,
  fn as imageGuide,
  So as imageGuides,
  go as imageModels,
  na as keyProblem,
  ja as loadGuideBundle,
  Os as needsSeek,
  $o as offeredModels,
  La as parseGuideShot,
  as as parsePreset,
  ge as parseRecord,
  Xa as planGuideLane,
  so as planImage,
  is as presetFromRecord,
  Qe as previewPrompt,
  lo as runImage,
  Bs as tokenBound
};
