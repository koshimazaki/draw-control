const Ro = (e) => String(e ?? "").replace(/[|\r\n]+/g, " ").trim() || "-", vt = (e) => e === null ? "-" : `$${e.toFixed(4)}`;
function To(e) {
  return `| ${[
    e.date,
    e.model,
    e.modelRan ?? "unknown",
    e.taskUUID,
    e.duration,
    e.resolution,
    e.inputs,
    vt(e.estimateUsd),
    vt(e.costUsd),
    e.seconds === null ? "-" : e.seconds.toFixed(1),
    e.output,
    e.status
  ].map(Ro).join(" | ")} |
`;
}
const jo = (e) => String(e.resolution ?? `${e.width ?? ""}x${e.height ?? ""}`);
function Co(e, t, o, r, s) {
  const { inputs: n, taskUUID: a, positivePrompt: c, ...d } = r?.task ?? t.task;
  return {
    id: e,
    label: t.modelName,
    provider: t.provider,
    model: t.modelId,
    modelName: t.modelName,
    modelRan: r?.modelRan ?? null,
    prompt: o.prompt,
    inputsSent: t.inputsSent,
    firstFrameVariant: t.firstFrameVariant,
    output: s ? { src: s, contentType: "video/mp4", remoteUrl: r?.videoURL } : null,
    costUsd: r?.costUsd ?? null,
    generationSeconds: r ? Math.round(r.generationSeconds * 10) / 10 : null,
    ...o.duration !== void 0 ? { durationSeconds: o.duration } : {},
    ...r ? { taskUUID: r.taskUUID } : {},
    ...o.routing ? { routing: { maxPrice: o.routing.maxPrice, requirements: o.routing.requirements } } : {},
    settings: d,
    status: r ? "ready" : "pending"
  };
}
const Uo = "https://api.runware.ai/v1";
class se extends Error {
  constructor(t, o) {
    super(
      o.length ? o.map((r) => `${r.code}: ${r.message}${r.parameter ? ` (${r.parameter})` : ""}`).join("; ") : `Runware API returned HTTP ${t}.`
    ), this.status = t, this.errors = o, this.name = "RunwareApiError";
  }
  status;
  errors;
}
const Lo = /^[\x21-\x7e]{8,512}$/;
class Fo {
  getKey;
  fetchImpl;
  constructor(t) {
    this.getKey = t.getKey, this.fetchImpl = t.fetch ?? globalThis.fetch;
  }
  /** Redacts the key from any text before it is shown. */
  redact(t) {
    const o = this.getKey();
    return o ? t.split(o).join("[key]") : t;
  }
  async post(t, o) {
    const r = this.getKey();
    if (!r) throw new Error("No Runware API key. Set RUNWARE_API_KEY, or paste it into the key panel.");
    if (!Lo.test(r)) throw new Error("That does not look like a Runware API key.");
    const s = await this.fetchImpl(Uo, {
      method: "POST",
      headers: { Authorization: `Bearer ${r}`, "Content-Type": "application/json" },
      body: JSON.stringify(t),
      signal: o
    });
    let n;
    try {
      n = await s.json();
    } catch {
      throw new se(s.status, []);
    }
    const a = n ?? {}, c = Array.isArray(a.data) ? a.data : [], d = Array.isArray(a.errors) ? a.errors.map((l) => ({
      code: String(l.code ?? "error"),
      message: this.redact(String(l.message ?? "")),
      ...l.parameter ? { parameter: String(l.parameter) } : {},
      ...l.taskUUID ? { taskUUID: String(l.taskUUID) } : {}
    })) : [];
    if (!s.ok && !c.length) throw new se(s.status, d);
    return { data: c, errors: d };
  }
  /** Stores media (data URI, base64 or public URL) and returns its UUID and URL. */
  async upload(t, o) {
    const r = globalThis.crypto.randomUUID(), { data: s, errors: n } = await this.post([{ taskType: "mediaStorage", taskUUID: r, operation: "upload", media: t }], o), a = n.filter((d) => !d.taskUUID || d.taskUUID === r);
    if (a.length) throw new se(400, a);
    const c = s.find((d) => d.taskUUID === r) ?? s[0];
    if (!c || typeof c.mediaUUID != "string") throw new Error("mediaStorage upload returned no mediaUUID.");
    return { mediaUUID: c.mediaUUID, mediaURL: String(c.mediaURL ?? "") };
  }
  /** Reads back the stored request for a task; used to learn which model the router chose. */
  async taskDetails(t, o) {
    const { data: r } = await this.post([{ taskType: "getTaskDetails", taskUUID: t }], o);
    return r[0];
  }
}
const Mo = [
  "firstFrame",
  "lastFrame",
  "keyframes",
  "referenceImages",
  "referenceVideos",
  "referenceAudios",
  "sourceVideo",
  "audioToVideo",
  "elements"
], ot = [
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
], wt = ["image", "video", "audio"], yt = [
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
], No = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
class G extends Error {
  constructor(t, o) {
    super(`${t}: ${o}`), this.path = t, this.name = "ShotError";
  }
  path;
}
const We = (e) => typeof e == "object" && e !== null && !Array.isArray(e);
function q(e, t, o, r = !1) {
  if (!(r && e === void 0) && (typeof e != "string" || e.length > o || No.test(e)))
    throw new G(t, `must be plain text up to ${o} characters`);
}
function Do(e, t = "shot") {
  if (!We(e)) throw new G(t, "must be an object");
  if (q(e.subject, `${t}.subject`, 500), q(e.action, `${t}.action`, 500), q(e.environment, `${t}.environment`, 500, !0), q(e.legend, `${t}.legend`, 300, !0), q(e.focus, `${t}.focus`, 200, !0), q(e.audio, `${t}.audio`, 500, !0), e.camera !== "guide" && !ot.includes(e.camera))
    throw new G(`${t}.camera`, `must be "guide" or one of ${ot.join(", ")}`);
  if (typeof e.duration != "number" || !(e.duration > 0 && e.duration <= 60)) throw new G(`${t}.duration`, "must be 1-60 seconds");
  if (!Array.isArray(e.references) || e.references.length > 20) throw new G(`${t}.references`, "must be an array of up to 20");
  if (e.references.forEach((o, r) => {
    const s = `${t}.references[${r}]`;
    if (!We(o) || typeof o.id != "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(o.id)) throw new G(`${s}.id`, "must be a short id");
    if (!wt.includes(o.kind)) throw new G(`${s}.kind`, `must be one of ${wt.join(", ")}`);
    if (!yt.includes(o.role)) throw new G(`${s}.role`, `must be one of ${yt.join(", ")}`);
    q(o.keep, `${s}.keep`, 200, !0), q(o.replaces, `${s}.replaces`, 200, !0);
  }), e.beats !== void 0) {
    if (!Array.isArray(e.beats) || e.beats.length > 20) throw new G(`${t}.beats`, "must be an array of up to 20");
    e.beats.forEach((o, r) => {
      if (!We(o) || typeof o.start != "number" || typeof o.end != "number" || !(o.end > o.start && o.start >= 0))
        throw new G(`${t}.beats[${r}]`, "must have start < end, in seconds");
      q(o.text, `${t}.beats[${r}].text`, 300);
    });
  }
  return e;
}
function Oo(e) {
  const t = e.references.map((o) => `${o.role} ${o.kind}`).join(", ");
  return `${e.subject} ${e.action}${e.environment ? `, ${e.environment}` : ""}. Camera: ${e.camera === "guide" ? "from the guide" : e.camera}. ${e.duration} s${t ? `. References: ${t}` : ""}${e.audio ? `. Sound: ${e.audio}` : ""}.`;
}
function _o(e) {
  return {
    model: e.model,
    ...e.notes.length ? { notes: e.notes.slice(0, 40) } : {},
    ...e.dropped.length ? { dropped: e.dropped.slice(0, 40).map((t) => `${t.ref}: ${t.reason}`) } : {}
  };
}
const xt = 1, Qt = /^[a-z0-9][a-z0-9-]{0,63}$/, kt = [
  "referenceVideo",
  "referenceImage",
  "referenceAudio",
  "frameImage",
  "audio",
  "video"
], Bo = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
class w extends Error {
  constructor(t, o) {
    super(`${t}: ${o}`), this.path = t, this.name = "RecordError";
  }
  path;
}
const Z = (e) => typeof e == "object" && e !== null && !Array.isArray(e);
function _(e, t, o, r = 0) {
  if (typeof e != "string") throw new w(t, "must be a string");
  if (e.length < r || e.length > o)
    throw new w(t, `must be ${r}-${o} characters`);
  if (Bo.test(e)) throw new w(t, "must be plain text");
  return e;
}
function $t(e, t, o) {
  e !== void 0 && _(e, t, o);
}
function St(e, t) {
  if (e !== null && (typeof e != "number" || !Number.isFinite(e) || e < 0))
    throw new w(t, "must be a non-negative number or null");
}
function It(e, t) {
  if (!Z(e)) throw new w(t, "must be an object");
  _(e.src, `${t}.src`, 2048, 1);
  for (const o of ["width", "height", "fps", "seconds", "bytes"])
    if (e[o] !== void 0 && (typeof e[o] != "number" || !(e[o] >= 0)))
      throw new w(`${t}.${o}`, "must be a non-negative number");
}
function zo(e, t = "guide") {
  if (!Z(e)) throw new w(t, "must be an object");
  if (e.schemaVersion !== 1) throw new w(`${t}.schemaVersion`, "must be 1");
  It(e.video, `${t}.video`);
  for (const o of ["audio", "firstFrame", "firstFrameStyled", "camera"])
    e[o] !== void 0 && It(e[o], `${t}.${o}`);
  if (e.beats !== void 0 && (!Array.isArray(e.beats) || e.beats.some((o) => typeof o != "number" || o < 0)))
    throw new w(`${t}.beats`, "must be non-negative seconds");
  return e.onsets !== void 0 && eo(e.onsets, `${t}.onsets`), e.peaks !== void 0 && ct(e.peaks, `${t}.peaks`), e;
}
function ct(e, t) {
  if (!Array.isArray(e) || e.length > 2e4) throw new w(t, "must be an array");
  return e.forEach((o, r) => {
    if (!Z(o) || typeof o.seconds != "number" || !(o.seconds >= 0))
      throw new w(`${t}[${r}].seconds`, "must be non-negative seconds");
    if (typeof o.strength != "number" || !(o.strength >= 0 && o.strength <= 1))
      throw new w(`${t}[${r}].strength`, "must be 0-1");
  }), e;
}
function eo(e, t) {
  if (!Z(e)) throw new w(t, "must be an object");
  for (const o of ["low", "mid", "high"]) ct(e[o], `${t}.${o}`);
  return e;
}
function Go(e, t) {
  if (!Z(e)) throw new w(t, "must be an object");
  if (typeof e.id != "string" || !Qt.test(e.id)) throw new w(`${t}.id`, "must be a slug");
  if ($t(e.label, `${t}.label`, 120), _(e.provider, `${t}.provider`, 40, 1), _(e.model, `${t}.model`, 120, 1), e.modelRan !== null && _(e.modelRan, `${t}.modelRan`, 120, 1), _(e.prompt, `${t}.prompt`, 5e4), !Array.isArray(e.inputsSent)) throw new w(`${t}.inputsSent`, "must be an array");
  if (e.inputsSent.forEach((o, r) => {
    const s = `${t}.inputsSent[${r}]`;
    if (!Z(o) || !kt.includes(o.role))
      throw new w(s, `role must be one of ${kt.join(", ")}`);
    _(o.src, `${s}.src`, 2048, 1);
  }), !["A", "B", "C"].includes(e.firstFrameVariant))
    throw new w(`${t}.firstFrameVariant`, "must be A, B or C");
  if (e.output !== null) {
    if (!Z(e.output)) throw new w(`${t}.output`, "must be an object or null");
    _(e.output.src, `${t}.output.src`, 2048, 1);
  }
  if (St(e.costUsd, `${t}.costUsd`), St(e.generationSeconds, `${t}.generationSeconds`), $t(e.note, `${t}.note`, 2e3), e.composed !== void 0) {
    if (!Z(e.composed)) throw new w(`${t}.composed`, "must be an object");
    _(e.composed.model, `${t}.composed.model`, 120, 1);
    for (const o of ["notes", "dropped"]) {
      const r = e.composed[o];
      if (r !== void 0) {
        if (!Array.isArray(r) || r.length > 40) throw new w(`${t}.composed.${o}`, "must be an array");
        r.forEach((s, n) => _(s, `${t}.composed.${o}[${n}]`, 1e3));
      }
    }
  }
  return e.shot !== void 0 && to(e.shot, `${t}.shot`), e;
}
function to(e, t) {
  try {
    Do(e, t);
  } catch (o) {
    throw o instanceof G ? new w(o.path, o.message.slice(o.path.length + 2)) : o;
  }
}
function ce(e) {
  if (!Z(e)) throw new w("record", "must be an object");
  if (e.schemaVersion !== xt)
    throw new w("schemaVersion", `must be ${xt}`);
  if (typeof e.id != "string" || !Qt.test(e.id)) throw new w("id", "must be a slug");
  if (_(e.title, "title", 200, 1), e.guide !== void 0 && zo(e.guide), e.shot !== void 0 && to(e.shot, "shot"), !Array.isArray(e.lanes) || e.lanes.length < 1 || e.lanes.length > 12)
    throw new w("lanes", "must hold 1-12 lanes");
  const t = e.lanes.map((r, s) => Go(r, `lanes[${s}]`)), o = new Set(t.map((r) => r.id));
  if (o.size !== t.length) throw new w("lanes", "lane ids must be distinct");
  if (e.preferredLane !== void 0 && !o.has(e.preferredLane))
    throw new w("preferredLane", "must name a lane in this record");
  if (e.observations !== void 0) {
    if (!Array.isArray(e.observations)) throw new w("observations", "must be an array");
    e.observations.forEach((r, s) => _(r, `observations[${s}]`, 2e3));
  }
  return e;
}
const Et = ["mannequin", "block", "stick", "blob", "glider", "file", "rigged"], Ko = [
  "video",
  "audio",
  "firstFrame",
  "character",
  "motion",
  "recipe",
  "beats",
  "camera"
], Wo = /^\d+\.\d+\.\d+$/, Ho = ["schemaVersion", "video", "audio", "firstFrame", "firstFrameStyled", "beats", "recipe", "meta", "camera"], Se = (e) => typeof e == "object" && e !== null && !Array.isArray(e);
function ye(e, t, o) {
  if (typeof e != "string" || e.length < 1 || e.length > 255 || /[\\/]|^\.\.?$/.test(e))
    throw new w(t, "must be a file name inside the bundle");
  if (o && !o.test(e)) throw new w(t, `must match ${o}`);
  return e;
}
function At(e, t) {
  if (!Array.isArray(e) || e.some((o) => typeof o != "number" || !(o >= 0)))
    throw new w(t, "must be non-negative seconds");
  return e;
}
function oo(e, t = "bundle") {
  if (!Se(e)) throw new w(t, "must be an object");
  if (typeof e.schemaVersion != "string" || !Wo.test(e.schemaVersion))
    throw new w(`${t}.schemaVersion`, "must be x.y.z");
  for (const o of Object.keys(e))
    if (!Ho.includes(o)) throw new w(`${t}.${o}`, "is not a bundle key");
  ye(e.video, `${t}.video`, /\.mp4$/), ye(e.firstFrame, `${t}.firstFrame`, /\.png$/);
  for (const o of ["beats", "recipe", "meta"]) ye(e[o], `${t}.${o}`, /\.json$/);
  e.camera !== void 0 && ye(e.camera, `${t}.camera`, /\.json$/);
  for (const o of ["audio", "firstFrameStyled"]) e[o] !== void 0 && ye(e[o], `${t}.${o}`);
  return e;
}
function ro(e, t = "beats") {
  if (!Se(e)) throw new w(t, "must be an object");
  if (typeof e.bpm != "number" || !(e.bpm >= 40 && e.bpm <= 240)) throw new w(`${t}.bpm`, "must be 40-240");
  if (typeof e.offsetSeconds != "number" || !(e.offsetSeconds >= 0))
    throw new w(`${t}.offsetSeconds`, "must be non-negative");
  if (!Number.isInteger(e.beatsPerBar) || e.beatsPerBar < 1)
    throw new w(`${t}.beatsPerBar`, "must be a positive integer");
  if (e.source !== "manual" && e.source !== "analysis") throw new w(`${t}.source`, "must be manual or analysis");
  return At(e.beats, `${t}.beats`), At(e.downbeats, `${t}.downbeats`), e.onsets !== void 0 && eo(e.onsets, `${t}.onsets`), e.peaks !== void 0 && ct(e.peaks, `${t}.peaks`), e;
}
function so(e, t = "meta") {
  if (!Se(e)) throw new w(t, "must be an object");
  for (const r of ["width", "height", "frames"])
    if (!Number.isInteger(e[r]) || e[r] < 1) throw new w(`${t}.${r}`, "must be a positive integer");
  if (e.fps !== 24) throw new w(`${t}.fps`, "must be 24");
  const o = e.character;
  if (!Se(o) || !Et.includes(o.kind) || typeof o.name != "string")
    throw new w(`${t}.character`, `kind must be one of ${Et.join(", ")}`);
  if (!Array.isArray(e.assets) || e.assets.length < 1) throw new w(`${t}.assets`, "must list at least one asset");
  return e.assets.forEach((r, s) => {
    if (!Se(r) || !Ko.includes(r.role)) throw new w(`${t}.assets[${s}].role`, "unknown role");
    if (typeof r.licence != "string" || r.licence.length < 1) throw new w(`${t}.assets[${s}].licence`, "is required");
  }), e;
}
function Xo(e, t, o) {
  const r = oo(e.manifest), s = ro(e.beats), n = so(e.meta), a = t.endsWith("/") ? t : `${t}/`, c = (p) => `${a}${p}`, d = n.fps, l = {
    schemaVersion: 1,
    video: { src: c(r.video), contentType: "video/mp4", width: n.width, height: n.height, fps: d, seconds: n.durationSeconds },
    firstFrame: { src: c(r.firstFrame), contentType: "image/png", width: n.width, height: n.height },
    beats: s.beats,
    ...s.onsets ? { onsets: s.onsets } : {},
    ...s.peaks ? { peaks: s.peaks } : {},
    ...e.recipe ? { recipe: e.recipe } : {},
    meta: {
      licences: n.assets.map((p) => ({ asset: p.file ?? p.name, licence: p.licence })),
      bundleSchemaVersion: r.schemaVersion,
      character: n.character,
      generator: n.generator,
      bpm: s.bpm,
      downbeats: s.downbeats
    }
  };
  return r.audio && (l.audio = { src: c(r.audio) }), r.firstFrameStyled && (l.firstFrameStyled = { src: c(r.firstFrameStyled) }), r.camera && (l.camera = { src: c(r.camera), contentType: "application/json" }), l;
}
class B extends Error {
  constructor(t) {
    super(t), this.name = "GuideError";
  }
}
const Jo = {
  mp4: "video/mp4",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4"
}, qo = 2 * 1048576, Yo = 300 * 1048576, Zo = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
function lt(e) {
  return Jo[e.toLowerCase().split(".").pop() ?? ""];
}
function Qo(e) {
  let t = "";
  for (let o = 0; o < e.length; o += 32768) t += String.fromCharCode(...e.subarray(o, o + 32768));
  return btoa(t);
}
function er(e) {
  const t = new DataView(e.buffer, e.byteOffset, e.byteLength);
  if (e.length > 24 && e[0] === 137 && e[1] === 80) return { width: t.getUint32(16), height: t.getUint32(20) };
  if (e.length > 30 && String.fromCharCode(...e.subarray(0, 4)) === "RIFF" && String.fromCharCode(...e.subarray(8, 12)) === "WEBP") {
    const o = String.fromCharCode(...e.subarray(12, 16));
    return o === "VP8 " ? { width: t.getUint16(26, !0) & 16383, height: t.getUint16(28, !0) & 16383 } : o === "VP8L" ? { width: 1 + ((e[22] & 63) << 8 | e[21]), height: 1 + ((e[24] & 15) << 10 | e[23] << 2 | (e[22] & 192) >> 6) } : o === "VP8X" ? { width: 1 + (e[24] | e[25] << 8 | e[26] << 16), height: 1 + (e[27] | e[28] << 8 | e[29] << 16) } : void 0;
  }
  if (e.length > 4 && e[0] === 255 && e[1] === 216) {
    let o = 2;
    for (; o + 9 < e.length; ) {
      if (e[o] !== 255) return;
      const r = e[o + 1], s = t.getUint16(o + 2);
      if (r >= 192 && r <= 207 && ![196, 200, 204].includes(r))
        return { height: t.getUint16(o + 5), width: t.getUint16(o + 7) };
      o += 2 + s;
    }
  }
}
async function Re(e, t, o = {}, r = e.name) {
  const s = lt(e.name);
  if (!s?.startsWith(t)) throw new B(`${e.name}: expected a ${t} file.`);
  if (e.size > Yo) throw new B(`${e.name} is over 300 MB.`);
  const n = await e.bytes(), a = t === "image" ? er(n) : void 0;
  return {
    name: e.name,
    contentType: s,
    ref: `data:${s};base64,${Qo(n)}`,
    displaySrc: r,
    info: { ...o, ...a, bytes: e.size }
  };
}
const tr = ["image/png", "image/jpeg", "image/webp"];
async function or(e, t) {
  const o = lt(e.name);
  if (!o || !tr.includes(o))
    throw new B(`${e.name}: a reference image must be a PNG, JPEG or WebP file (the name ends in .png, .jpg, .jpeg or .webp).`);
  const r = await Re(e, "image", {}, t ?? e.name);
  if (!r.info?.width || !r.info.height)
    throw new B(`${e.name}: its width and height could not be read, so the model's size limits cannot be checked. Re-save it as a PNG or JPEG.`);
  return r;
}
async function Ae(e, t) {
  if (!e) throw new B(`The bundle has no ${t}.`);
  if (e.size > qo) throw new B(`${t} is over 2 MB.`);
  try {
    return JSON.parse(new TextDecoder().decode(await e.bytes()));
  } catch {
    throw new B(`${t} is not valid JSON.`);
  }
}
const Pe = (e, t) => typeof e == "string" && e.trim().length > 0 && e.length <= t && !Zo.test(e);
function no(e) {
  if (typeof e != "object" || e === null) return;
  const t = e;
  if (!Pe(t.subject, 500) || !(t.action === void 0 || t.action === "" || Pe(t.action, 500))) return;
  const o = { subject: t.subject.trim(), action: typeof t.action == "string" ? t.action.trim() : "" };
  return Pe(t.environment, 500) && (o.environment = t.environment.trim()), Pe(t.legend, 300) && (o.legend = t.legend.trim()), (t.camera === "guide" || ot.includes(t.camera)) && (o.camera = t.camera), o;
}
async function ao(e, t = {}) {
  const o = t.base ? t.base.endsWith("/") ? t.base : `${t.base}/` : "./", r = (g) => /^https?:\/\//.test(o) ? new URL(g, o).href : g, s = /* @__PURE__ */ new Map();
  for (const g of e) s.set(g.name.split(/[\\/]/).pop(), g);
  let n, a, c;
  try {
    n = oo(await Ae(s.get("bundle.json"), "bundle.json")), a = so(await Ae(s.get(n.meta), n.meta)), c = ro(await Ae(s.get(n.beats), n.beats));
  } catch (g) {
    throw g instanceof B ? g : new B(`The bundle does not match the guide-bundle schema: ${g.message}`);
  }
  const d = s.get(n.recipe), l = d ? await Ae(d, n.recipe) : void 0, p = (g) => {
    const y = s.get(g);
    if (!y) throw new B(`The bundle names ${g}, but that file is missing.`);
    return y;
  }, u = a.durationSeconds;
  if (typeof u != "number" || !(u > 0 && u <= 600)) throw new B("meta.json: durationSeconds must be 0-600 seconds.");
  const m = await Re(p(n.video), "video", { width: a.width, height: a.height, seconds: u, fps: a.fps, hasAudio: a.audioInVideo === !0 }, r(n.video)), f = await Re(p(n.firstFrame), "image", {}, r(n.firstFrame)), v = n.audio ? await Re(p(n.audio), "audio", { seconds: u }, r(n.audio)) : void 0, b = Xo({ manifest: n, beats: c, meta: a, ...l ? { recipe: l } : {} }, o), h = no(l?.shot);
  return { manifest: n, meta: a, beats: c, ...l ? { recipe: l } : {}, ...h ? { shot: h } : {}, video: m, audio: v, firstFrame: f, seconds: u, guide: b };
}
const le = {
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
}, rr = {
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
function sr(e, t, o = "the subject") {
  const r = e.camera.vocabulary.find((s) => s.move === t && s.phrase);
  if (r?.phrase) return { text: r.phrase.replaceAll("{subject}", o) };
  if (e.camera.kind === "parameter") {
    const s = e.camera.values.find((n) => n.move === t);
    if (s) return { text: s.meaning };
  }
  return { text: rr[t], note: `"${t}" is not in ${e.name}'s guide vocabulary; plain words are used.` };
}
const J = (e) => {
  const t = e.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const o = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(o) ? o : `${o}.`;
}, ue = (e, t) => t.references.find((o) => o.id === e.ref)?.keep ?? le[e.role].keep, N = (e, t = " ") => e.filter(Boolean).join(t), Ce = (e, t = J(`${e.subject} ${e.action}`)) => N([t, e.environment ? J(e.environment) : null]), Ue = (e) => e.legend ? J(e.legend) : null, nr = (e) => `${e.start}–${e.end} s`;
function ar(e, t, o, r) {
  const s = o.find((d) => d.input === "referenceVideos" && d.role === "motion" && d.address), n = [];
  if (s) {
    const d = t.references.find((l) => l.id === s.ref)?.keep;
    n.push(`Reference only the ${d ?? "motion, camera path and pacing"} of ${s.address}.`);
  }
  for (const d of o) {
    if (!d.address || d === s) continue;
    const l = t.references.find((p) => p.id === d.ref);
    d.input === "firstFrame" ? n.push(`${d.address} is the first frame.`) : d.input === "lastFrame" ? n.push(`${d.address} is the last frame.`) : s && l?.replaces ? n.push(`Replace ${l.replaces} with ${le[d.role].noun} in ${d.address}; keep ${ue(d, t)}.`) : n.push(`${d.address} defines ${le[d.role].noun}; keep ${ue(d, t)}.`);
  }
  const a = t.beats?.length ? t.beats.map((d) => `${nr(d)}: ${J(d.text)}`).join(`
`) : null, c = t.audio ? `Audio: ${J(t.audio)} No subtitles.` : null;
  return N([N([...n, Ue(t)]), N([Ce(t), r.text]), a, c], `

`);
}
function ir(e, t, o, r) {
  const s = o.filter((d) => d.address && d.input !== "referenceAudios").map((d) => d.role === "motion" ? `${d.address} is ${le.motion.noun}: follow its ${ue(d, t)}.` : `${d.address} is ${le[d.role].noun}; keep ${ue(d, t)}.`), n = o.find((d) => d.input === "referenceAudios"), a = t.audio || n ? N(["Audio:", t.audio ? J(t.audio) : null, n?.address ? `Sync the motion to ${n.address}.` : null]) : null, c = t.beats?.length ? t.beats.map((d) => `[${d.start}-${d.end}s] ${J(d.text)}`).join(`
`) : null;
  return N([r.text, N([...s, Ue(t)]), Ce(t), c, a], `

`);
}
function dr(e, t, o, r) {
  const s = o.find((l) => l.role === "motion" && l.address), n = o.filter((l) => l.address && l.input !== "referenceAudios").map((l) => l === s ? `${l.address} is the motion reference: follow its ${ue(l, t)}.` : `${l.address} is ${le[l.role].noun}; keep ${ue(l, t)}.`), a = Ce(t, s ? J(`${t.subject}, moving as in ${s.address}`) : void 0), c = o.some((l) => l.input === "referenceAudios"), d = t.audio || c ? N(["Sound:", t.audio ? J(t.audio) : null, c ? "Follow the reference audio." : null]) : null;
  return N([N([...n, Ue(t)]), N([a, r.text]), d], `

`);
}
function Pt(e, t, o, r) {
  const s = e.id.startsWith("flux") ? o.map(
    (a) => a.input === "firstFrame" ? "Use this image as the first frame." : a.input === "lastFrame" ? "Use this image as the last frame." : a.input === "keyframes" ? "Use these images as keyframes, in order." : null
  ) : [], n = t.audio ? `Audio: ${J(t.audio)}` : null;
  return N([...new Set(s)], " ") + (s.some(Boolean) ? " " : "") + N([Ce(t), Ue(t), r.text, n]);
}
function cr(e, t, o, r) {
  switch (e.prompting.addressing.style) {
    case "tags":
      return ar(e, t, o, r);
    case "at-mentions":
      return ir(e, t, o, r);
    case "plain-words":
      return e.prompting.addressing.tokens.length ? dr(e, t, o, r) : Pt(e, t, o, r);
    default:
      return Pt(e, t, o, r);
  }
}
const ut = "https://runware.ai/docs/models", fe = (e) => `${ut}/${e}`, he = (e) => `${ut}/${e}/schema.json`, Ie = (e, t) => `${ut}/${e}/guides/${t}`, D = 1048576;
function F(e) {
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
const x = (e, t) => ({ min: e, max: t });
function $(e, t, o, r = null, s) {
  return { supported: !0, field: e, maxCount: t, limits: r, source: o, ...s ? { note: s } : {} };
}
function V(e, t) {
  return { supported: !1, field: null, maxCount: null, limits: null, source: e, ...t ? { note: t } : {} };
}
const Le = "bfl-flux-3-video", xe = fe(Le), ee = he(Le), E = (e) => Ie(Le, e), L = (e, t, o) => ({ label: e, width: t, height: o }), lr = {
  id: "flux-3-video",
  name: "FLUX 3 Video",
  lab: "Black Forest Labs",
  air: "bfl:flux@3-video",
  slug: Le,
  verifiedOn: "2026-11-10",
  sources: {
    model: xe,
    schema: ee,
    guides: [
      { title: "Prompting", url: E("prompting") },
      { title: "Keyframes", url: E("keyframes") },
      { title: "Multi-shot sequences", url: E("multi-shot-sequences") },
      { title: "Audio and speech", url: E("audio-and-speech") },
      { title: "Video continuation", url: E("video-continuation") }
    ]
  },
  inputs: {
    firstFrame: $("inputs.frameImages", 1, E("keyframes")),
    lastFrame: $("inputs.frameImages", 1, E("keyframes")),
    keyframes: $("inputs.frameImages", 10, xe, null, "Placed by frame index (24 fps), timestamp, or first/last; unplaced images are spread evenly. Guidance, not a pixel-exact pin."),
    referenceImages: V(ee),
    referenceVideos: V(ee),
    referenceAudios: V(ee),
    sourceVideo: $("inputs.video", 1, E("video-continuation"), F({ secondsEach: x(null, 15), maxBytesEach: 50 * D }), "Extension only: the clip is continued, not used as a motion reference."),
    audioToVideo: V(ee, "No audio input; speech is a quoted line with a visible speaker."),
    elements: V(ee)
  },
  combinations: [
    {
      id: "frames-or-video",
      text: "frameImages cannot be combined with a source video.",
      when: ["sourceVideo"],
      forbidsInputs: ["firstFrame", "lastFrame", "keyframes"],
      source: ee
    },
    {
      id: "keyframes-need-duration",
      text: "Three or more unplaced frame images need a numeric duration; with any image or video input, safetyTolerance is at most 2.",
      when: ["keyframes"],
      forbidsParams: ["duration:auto"],
      source: xe
    }
  ],
  output: {
    durations: { kind: "range", min: 5, max: 20, auto: !0 },
    defaultDuration: "auto",
    resolutionField: "both",
    resolutions: ["720p", "1080p"],
    sizes: [
      L("720p (~21:9)", 1440, 608),
      L("720p (2:1)", 1344, 672),
      L("720p (~16:9)", 1280, 704),
      L("720p (~4:3)", 1088, 800),
      L("720p (1:1)", 960, 960),
      L("720p (~3:4)", 800, 1088),
      L("720p (~9:16)", 704, 1280),
      L("1080p (~21:9)", 2176, 928),
      L("1080p (~2:1)", 2016, 1024),
      L("1080p (~16:9)", 1920, 1088),
      L("1080p (~4:3)", 1632, 1216),
      L("1080p (1:1)", 1440, 1440),
      L("1080p (~3:4)", 1216, 1632),
      L("1080p (~9:16)", 1088, 1920)
    ],
    fps: [24],
    frameCountRule: "duration × 24 frames; numeric keyframe indices count real frames at 24 fps (keyframes guide).",
    audio: { generates: !0, toggle: "settings.audio" },
    source: ee
  },
  prompting: {
    minChars: null,
    maxChars: null,
    addressing: {
      style: "plain-words",
      tokens: [],
      numbering: 'Frames are named by position in words: "use this image as the first frame" (or "as the last frame"); a continuation opens with "continue the reference video from its final frames".',
      source: E("keyframes")
    },
    rules: [
      { text: "Write plain declarative prose, as to a colleague; keyword lists do worse.", source: E("prompting") },
      { text: "Name five to ten beats rather than piling on adjectives; keep to a few hundred words.", source: E("prompting") },
      { text: "Give each beat about five to seven seconds, and pin the duration once the beats are known.", source: E("prompting") },
      { text: "Always give a camera direction; without one the camera drifts.", source: E("prompting") },
      { text: 'Name each audio layer in order of prominence; add "no on-screen text" whenever speech is quoted.', source: E("audio-and-speech") }
    ],
    seed: { supported: !1, max: null, source: xe },
    negativePrompt: !1
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "camera locked", source: E("prompting"), move: "static", phrase: "The camera holds locked at eye level." },
      { term: "camera pushes slowly forward", source: E("prompting"), move: "push-in", phrase: "The camera pushes slowly forward from wide to close." },
      { term: "camera pulls slowly back", source: E("prompting"), move: "pull-out", phrase: "The camera pulls slowly back from close to wide, revealing the setting." },
      { term: "tracking shot alongside the subject", source: E("prompting"), move: "track-left", phrase: "Tracking shot moving left alongside the subject." },
      { term: "tracking shot alongside the subject", source: E("prompting"), move: "track-right", phrase: "Tracking shot moving right alongside the subject." },
      { term: "camera orbits smoothly", source: E("prompting"), move: "orbit", phrase: "The camera orbits smoothly around the subject, keeping it centred." },
      { term: "handheld tracking shot", source: E("prompting"), move: "handheld", phrase: "Handheld camera following the subject." },
      { term: "pan / tilt", source: E("prompting") },
      { term: "lens: 24mm / 35mm / 70mm / anamorphic", source: E("prompting") },
      { term: "one continuous unbroken shot", source: E("multi-shot-sequences") }
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
    source: xe
  },
  notes: [
    "fps: no fps field; the keyframes guide states 24 fps.",
    "Crane and rack focus: not stated in the guides' camera vocabulary.",
    "Seed: no request field; the response returns one.",
    "The frame field lists only first/last as allowed values, yet the guides use numeric indices; the guide's index 240 on a 10 s clip is one past the last frame.",
    "Prompt length: not stated in the schema or on the model page (no minLength or maxLength); the guides say 10,000 characters.",
    "Draft mode applies to text-to-video only."
  ]
}, Fe = "klingai-video-4-0", Vt = fe(Fe), X = he(Fe), S = (e) => Ie(Fe, e), de = F({ sidePx: x(300, null), maxBytesEach: 30 * D, aspect: x(0.4, 2.5) }), ie = {
  id: "kling-4",
  name: "Kling VIDEO 4.0",
  lab: "Kling AI",
  air: "klingai:kling-video@4.0",
  slug: Fe,
  verifiedOn: "2026-11-10",
  sources: {
    model: Vt,
    schema: X,
    guides: [
      { title: "Prompting", url: S("prompting") },
      { title: "Reference images", url: S("reference-images") },
      { title: "Reference videos", url: S("reference-videos") },
      { title: "Keyframes", url: S("keyframes") },
      { title: "Elements", url: S("elements") },
      { title: "Editing video", url: S("editing-video") },
      { title: "Long takes and multi-shot", url: S("long-takes-and-multi-shot") },
      { title: "Dialogue and on-screen text", url: S("dialogue-and-on-screen-text") }
    ]
  },
  inputs: {
    firstFrame: $("inputs.frameImages", 1, X, de),
    lastFrame: $("inputs.frameImages", 1, X, de),
    keyframes: $(
      "inputs.frameImages",
      10,
      S("keyframes"),
      de,
      "3-10 frames (x-modes multiple-frames); only first and last are pinned, the rest are spaced evenly in array order."
    ),
    referenceImages: $("inputs.referenceImages", 10, X, de),
    referenceVideos: $(
      "inputs.referenceVideos",
      5,
      X,
      F({
        secondsEach: x(3, 30),
        secondsTotalMax: 30,
        sidePx: x(700, 4553),
        maxAreaPx: 8294400,
        fps: x(24, 60),
        maxBytesEach: 300 * D,
        aspect: x(0.4, 2.5)
      })
    ),
    referenceAudios: V(X, "No audio input in the schema."),
    sourceVideo: $(
      "inputs.video",
      1,
      S("editing-video"),
      F({ secondsEach: x(3, 30), sidePx: x(700, 4553), maxAreaPx: 8294400, fps: x(24, 60), maxBytesEach: 300 * D, aspect: x(0.4, 2.5) }),
      "Prompt-based edit of the source clip."
    ),
    audioToVideo: V(X),
    elements: $(
      "inputs.elements",
      7,
      S("elements"),
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
      source: S("reference-images")
    },
    {
      id: "video-cap",
      text: "Source video, reference videos and element videos share a cap of five files and 30 s in total.",
      when: [],
      sharedMax: { inputs: ["sourceVideo", "referenceVideos"], max: 5 },
      source: X
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
    source: X
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
      source: X
    },
    rules: [
      { text: "Open with one sentence per input saying what it defines and what to keep from it.", source: S("reference-images") },
      { text: 'Name what to copy from a reference video without describing it again; add "only" to keep the rest out.', source: S("reference-videos") },
      { text: "Trade mood adjectives for things the camera can see: light direction, materials, focus.", source: S("prompting") },
      { text: "Long briefs run in a fixed order: settings, then timed beats, then an audio section.", source: S("prompting") },
      { text: "Write positively; the only negatives worth writing are no subtitles and no background music.", source: S("prompting") }
    ],
    seed: { supported: !1, max: null, source: S("prompting") },
    negativePrompt: !1
  },
  camera: {
    kind: "prompt-only",
    // Runware's "Directing the camera" rule: name the move, the height, the speed and what the shot
    // ends on, tied to something in the frame. "Crane" is not in the vocabulary; "rises and tilts down" is.
    vocabulary: [
      { term: "static camera / locked-off", source: S("prompting"), move: "static", phrase: "Static, locked-off camera at eye level, holding on {subject} for the whole shot." },
      { term: "push-in", source: S("prompting"), move: "push-in", phrase: "Slow push-in at eye level, ending on a close-up of {subject}." },
      { term: "pull-out", source: S("prompting"), move: "pull-out", phrase: "Slow pull-out at eye level, ending on a wide shot with {subject} small in the frame." },
      { term: "tracking shot", source: S("prompting"), move: "track-left", phrase: "Tracking shot at waist height, moving left at walking pace alongside {subject}, ending with {subject} centred." },
      { term: "tracking shot", source: S("prompting"), move: "track-right", phrase: "Tracking shot at waist height, moving right at walking pace alongside {subject}, ending with {subject} centred." },
      { term: "rises and tilts down", source: S("reference-videos"), move: "crane-up", phrase: "The camera slowly rises and tilts down, ending on a high view looking down at {subject}." },
      { term: "orbit", source: S("prompting"), move: "orbit", phrase: "Slow orbit around {subject} at eye level, ending facing {subject}." },
      { term: "light handheld energy", source: S("prompting"), move: "handheld", phrase: "Light handheld energy at eye level, following {subject} and ending on {subject}." },
      { term: "pan", source: S("prompting") },
      { term: "lateral dolly", source: S("dialogue-and-on-screen-text") },
      { term: "one continuous gimbal shot with no cuts", source: S("long-takes-and-multi-shot") },
      { term: 'borrowing a camera path: "Reference only the camera path and pacing of <<<video_1>>>"', source: S("reference-videos") },
      { term: 'timed beats, e.g. "0–3 s: … 3–7 s: …"', source: S("prompting") }
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
    source: Vt
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
}, mt = "klingai-video-4-0-flash", Rt = fe(mt), O = he(mt), Y = {
  ...ie,
  id: "kling-4-flash",
  name: "Kling VIDEO 4.0 Flash",
  air: "klingai:kling-video@4.0-flash",
  slug: mt,
  sources: { model: Rt, schema: O, guides: ie.sources.guides },
  inputs: {
    ...ie.inputs,
    firstFrame: $("inputs.frameImages", 1, O, de, "This model only supports the first frame."),
    lastFrame: V(O, "First frame only."),
    keyframes: V(O, "First frame only."),
    referenceImages: $("inputs.referenceImages", 10, O, de),
    referenceVideos: $(
      "inputs.referenceVideos",
      5,
      O,
      F({
        secondsEach: x(3, 20),
        secondsTotalMax: 20,
        sidePx: x(700, 4553),
        maxAreaPx: 8294400,
        fps: x(24, 60),
        maxBytesEach: 300 * D,
        aspect: x(0.4, 2.5)
      })
    ),
    sourceVideo: $(
      "inputs.video",
      1,
      O,
      F({ secondsEach: x(3, 20), sidePx: x(700, 4553), maxAreaPx: 8294400, fps: x(24, 60), maxBytesEach: 300 * D, aspect: x(0.4, 2.5) }),
      "Prompt-based edit of the source clip."
    ),
    elements: $("inputs.elements", 7, O, null, "Voices cannot be used with settings.preserveAudio.")
  },
  combinations: [
    {
      id: "image-cap",
      text: "Frame images and reference images share a cap of ten.",
      when: [],
      sharedMax: { inputs: ["firstFrame", "referenceImages"], max: 10 },
      source: O
    },
    {
      id: "video-cap",
      text: "Source video, reference videos and element videos share a cap of five files and 20 s in total.",
      when: [],
      sharedMax: { inputs: ["sourceVideo", "referenceVideos"], max: 5 },
      source: O
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
    source: O
  },
  prompting: {
    ...ie.prompting,
    addressing: { ...ie.prompting.addressing, source: O }
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.094, tier: "720p", mode: "no-video-input", label: "720p · No video input" },
      { usdPerSecond: 0.126, tier: "720p", mode: "video-input", label: "720p · Video input" }
    ],
    surcharges: [],
    source: Rt,
    note: "The model page shows two figures per rate ($0.0799 / $0.094, $0.107 / $0.126) without saying which applies; the schema's x-pricing gives the higher, used here."
  },
  notes: [
    "No Flash guides: prompt rules and camera vocabulary are from the Kling VIDEO 4.0 guides (same tag syntax per the schema).",
    "No resolution parameter: 720p only, as width/height pairs; with inputs the size follows the input.",
    "settings.preserveAudio keeps the input video's audio instead of generating new sound; it needs a video or reference video.",
    "Output fps: not stated. Frame-count rule: not stated.",
    "Seed: no request field; the response returns one."
  ]
}, io = "lightricks-ltx-2-5-pro", ur = "lightricks-ltx-2-5-fast", R = (e) => Ie(io, e), co = [
  { label: "720p (16:9)", width: 1280, height: 720 },
  { label: "720p (9:16)", width: 720, height: 1280 },
  { label: "1080p (16:9)", width: 1920, height: 1080 },
  { label: "1080p (9:16)", width: 1080, height: 1920 }
], lo = "No 8k+1 frame rule and no divisibility rule in the API or docs: durations, fps and width/height are fixed lists, so any frame padding is hidden server-side.";
function uo(e, t) {
  const o = fe(e), r = he(e);
  return {
    id: "ltx-2.5",
    name: "LTX-2.5 Pro",
    lab: "Lightricks",
    air: "lightricks:ltx@2.5-pro",
    slug: e,
    verifiedOn: "2026-11-10",
    sources: {
      model: o,
      schema: r,
      guides: [
        { title: "Prompting", url: R("prompting") },
        { title: "Camera movement", url: R("camera-movement") },
        { title: "First and last frame", url: R("first-and-last-frame") },
        { title: "Audio-driven", url: R("audio-driven") },
        { title: "Native audio", url: R("native-audio") },
        { title: "Multi-shot", url: R("multi-shot") }
      ]
    },
    inputs: {
      firstFrame: $("inputs.frameImages", 1, R("first-and-last-frame")),
      lastFrame: $("inputs.frameImages", 1, R("first-and-last-frame")),
      keyframes: V(r, "frameImages holds at most two items (first and last)."),
      referenceImages: $("inputs.referenceImages", 1, r, null, "Only in audio-driven mode, exactly one."),
      referenceVideos: V(r),
      referenceAudios: V(r),
      sourceVideo: V(r, "Capabilities list Edit/Extend on Pro, but the schema has no source-video field."),
      audioToVideo: $("inputs.audio", 1, R("audio-driven"), F({ secondsEach: x(2, t) }), "The clip runs as long as the audio."),
      elements: V(r)
    },
    combinations: [
      {
        id: "audio-mode",
        text: "With audio: no frameImages, no duration, no cameraMovement; exactly one reference image; size 1920×1080 or 1080×1920.",
        when: ["audioToVideo"],
        forbidsInputs: ["firstFrame", "lastFrame"],
        forbidsParams: ["duration", "settings.cameraMovement"],
        requiresExactly: { input: "referenceImages", count: 1 },
        source: o
      },
      {
        id: "reference-needs-audio",
        text: "A reference image is accepted only beside audio.",
        when: ["referenceImages"],
        requiresOneOf: ["audioToVideo"],
        source: r
      }
    ],
    output: {
      durations: { kind: "list", values: [6, 8, 10], auto: !0 },
      defaultDuration: 6,
      resolutionField: "width-height",
      resolutions: ["720p", "1080p"],
      sizes: co,
      fps: [24, 25, 50],
      frameCountRule: null,
      audio: { generates: !0, toggle: "settings.audio" },
      source: r
    },
    prompting: {
      minChars: 2,
      maxChars: 5e3,
      addressing: {
        style: "none",
        tokens: [],
        numbering: "Inputs are not named in the prompt: the image sets the look and the prompt says what happens; with audio, describe the performance, not the words.",
        source: R("first-and-last-frame")
      },
      rules: [
        { text: "Cover six layers: shot, scene, action, character, camera, audio.", source: R("prompting") },
        { text: "Write one flowing paragraph in the present tense, not a list.", source: R("prompting") },
        { text: "Keep camera and subject motion in separate clauses, with one main action arc.", source: R("prompting") },
        { text: "With a cameraMovement preset set, leave the move out of the prompt.", source: R("camera-movement") },
        { text: "The tighter the shot, the more concrete the nouns.", source: R("prompting") }
      ],
      seed: { supported: !1, max: null, source: o },
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
        { term: "orbit", source: R("camera-movement"), move: "orbit", phrase: "The camera orbits slowly around the subject and ends facing it." },
        { term: "handheld", source: R("camera-movement"), move: "handheld", phrase: "Handheld camera, following the subject closely." },
        { term: "push in, pull back, track, tilt, pan, over-the-shoulder, crane", source: R("camera-movement") },
        { term: "say where a described move ends", source: R("camera-movement") }
      ],
      source: r
    },
    pricing: {
      rates: [
        { usdPerSecond: 0.12, tier: "720p", mode: "any", label: "720p" },
        { usdPerSecond: 0.17, tier: "1080p", mode: "any", label: "1080p" }
      ],
      surcharges: [],
      source: o
    },
    notes: [
      lo,
      "Frame count = duration × fps (e.g. 6 s at 24 fps is 144 frames, not 8k+1).",
      "Seed: no request field; the response returns one.",
      "settings.audio has no stated default.",
      "Audio input: the schema says 2-10 s on Pro; the audio-driven guide says 2 to 20 s.",
      "The model description says up to 4K; the Pro schema allows 1080p at most."
    ]
  };
}
const mr = uo(io, 10), re = uo(ur, 20), pr = {
  ...re,
  id: "ltx-2.5-fast",
  name: "LTX-2.5 Fast",
  air: "lightricks:ltx@2.5-fast",
  inputs: { ...re.inputs, sourceVideo: V(re.sources.schema) },
  combinations: [
    ...re.combinations,
    {
      id: "long-clip-size",
      text: "Clips over 10 s: no 48/50 fps, no explicit width/height and no 2K/4K (the default 1920×1080 applies).",
      when: [],
      source: re.sources.schema
    }
  ],
  output: {
    ...re.output,
    durations: { kind: "list", values: [6, 8, 10, 12, 14, 16, 18, 20], auto: !0 },
    resolutions: ["720p", "1080p", "2K", "4K"],
    sizes: [
      ...co,
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
    source: re.sources.model
  },
  notes: [
    lo,
    "No Fast guides: prompting and camera rules are from the LTX-2.5 Pro guides, which say Fast shares the prompt structure.",
    "When width or height is sent, or fps is 48/50, duration must be at most 10 s; the page's own 12 s example at 1280×720 breaks this.",
    "Seed: no request field; the response returns one.",
    "settings.audio has no stated default."
  ]
}, Me = "minimax-h3", ke = fe(Me), z = he(Me), P = (e) => Ie(Me, e), He = F({ sidePx: x(256, 5760), maxBytesEach: 30 * D, aspect: x(0.4, 2.5) }), Tt = F({ secondsEach: x(2, 15), secondsTotalMax: 15, maxBytesEach: 15 * D }), fr = {
  id: "h3",
  name: "MiniMax H3",
  lab: "MiniMax",
  air: "minimax:h3@0",
  slug: Me,
  verifiedOn: "2026-11-10",
  sources: {
    model: ke,
    schema: z,
    guides: [
      { title: "Generating video", url: P("generating-video") },
      { title: "Reference-driven consistency", url: P("reference-driven-consistency") },
      { title: "Motion, camera and performance", url: P("motion-camera-performance") },
      { title: "First and last frame", url: P("first-and-last-frame") },
      { title: "Editing video", url: P("editing-video") },
      { title: "Sound and voice", url: P("sound-and-voice") }
    ]
  },
  inputs: {
    firstFrame: $("inputs.frameImages", 1, P("first-and-last-frame"), He),
    lastFrame: $("inputs.frameImages", 1, P("first-and-last-frame"), He),
    keyframes: V(z, "frameImages holds at most two items (first and last)."),
    referenceImages: $("inputs.referenceImages", 9, z, He, "The guide advises two well-described images over nine loose ones."),
    referenceVideos: $(
      "inputs.referenceVideos",
      3,
      z,
      F({
        secondsEach: x(2, 15),
        secondsTotalMax: 15,
        sidePx: x(256, 5760),
        fps: x(23.976, 60),
        maxBytesEach: 50 * D,
        aspect: x(0.4, 2.5)
      }),
      "Reference videos and reference audios share the 15 s total. Edits also go through this field."
    ),
    referenceAudios: $("inputs.referenceAudios", 3, z, Tt, "Needs a reference image or video beside it."),
    sourceVideo: V(z, "No inputs.video; the editing guide passes the clip to edit as a reference video."),
    audioToVideo: $("inputs.referenceAudios", 3, z, Tt, "Through reference audio, beside an image or video reference."),
    elements: V(z)
  },
  combinations: [
    {
      id: "frames-alone",
      text: "frameImages cannot be used with reference images, videos or audios.",
      when: ["firstFrame"],
      forbidsInputs: ["referenceImages", "referenceVideos", "referenceAudios"],
      source: ke
    },
    {
      id: "audio-needs-visual",
      text: "Reference audio needs a reference image or a reference video beside it.",
      when: ["referenceAudios"],
      requiresOneOf: ["referenceImages", "referenceVideos"],
      source: ke
    },
    {
      id: "reference-cap",
      text: "Reference images, videos and audios share a cap of twelve files and 64 MB.",
      when: [],
      sharedMax: { inputs: ["referenceImages", "referenceVideos", "referenceAudios"], max: 12 },
      source: z
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
    source: z
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
      source: P("reference-driven-consistency")
    },
    rules: [
      { text: "Give each reference a role by its number and say which features to keep.", source: P("reference-driven-consistency") },
      { text: "For motion transfer, name the reference and describe the subject, not the move.", source: P("motion-camera-performance") },
      { text: "Write like a cinematographer: camera move, lens, light, pace.", source: P("generating-video") },
      { text: "Describe the picture first, then close with a Sound: clause tied to moments with as, when, then.", source: P("sound-and-voice") },
      { text: "With anchor frames, prompt only the motion and the sound.", source: P("first-and-last-frame") }
    ],
    seed: { supported: !0, max: 4294967295, source: z },
    negativePrompt: !1
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "locked tripod", source: ke, move: "static", phrase: "Locked tripod; the camera does not move." },
      { term: "push-in", source: P("generating-video"), move: "push-in", phrase: "Slow cinematic push-in on the subject." },
      { term: "tracking shot", source: P("generating-video"), move: "track-left", phrase: "Slow tracking shot moving left alongside the subject." },
      { term: "tracking shot", source: P("generating-video"), move: "track-right", phrase: "Slow tracking shot moving right alongside the subject." },
      { term: "orbit", source: P("motion-camera-performance"), move: "orbit", phrase: "Smooth cinematic orbit around the subject." },
      { term: "handheld drift", source: P("first-and-last-frame"), move: "handheld", phrase: "Gentle handheld drift." },
      { term: "low-angle dolly-in", source: P("generating-video") },
      { term: "pan", source: P("sound-and-voice") },
      { term: "lens focal length (85mm, 50mm)", source: P("sound-and-voice") }
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
    source: ke
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
}, Ne = "bytedance-seedance-2-5", Xe = fe(Ne), te = he(Ne), I = (e) => Ie(Ne, e), Je = F({ sidePx: x(300, 6e3), maxBytesEach: 30 * D, aspect: x(0.4, 2.5) }), hr = F({ secondsEach: x(2, 30), secondsTotalMax: 30, sidePx: x(300, 6e3), maxBytesEach: 200 * D, aspect: x(0.4, 2.5) }), jt = F({ secondsEach: x(2, 30), secondsTotalMax: 30, maxBytesEach: 15 * D }), qe = (e, t) => t.map(([o, r, s]) => ({ label: `${e} (${o})`, width: r, height: s })), gr = {
  id: "seedance-2.5",
  name: "Seedance 2.5",
  lab: "ByteDance",
  air: "bytedance:seedance@2.5",
  slug: Ne,
  verifiedOn: "2026-11-10",
  sources: {
    model: Xe,
    schema: te,
    guides: [
      { title: "Prompting", url: I("prompting") },
      { title: "Image to video", url: I("image-to-video") },
      { title: "Motion control", url: I("motion-control") },
      { title: "Multi-reference production", url: I("multi-reference-production") },
      { title: "Editing", url: I("editing") },
      { title: "Long-form narrative", url: I("long-form-narrative") },
      { title: "Multilingual", url: I("multilingual") }
    ]
  },
  inputs: {
    firstFrame: $("inputs.frameImages", 1, I("image-to-video"), Je),
    lastFrame: $("inputs.frameImages", 1, I("image-to-video"), Je, "Only beside a first frame; a last frame alone is rejected."),
    keyframes: V(te, "frameImages holds at most two items (first and last)."),
    referenceImages: $("inputs.referenceImages", 30, te, Je, "The guide calls 1-8 the stable band."),
    referenceVideos: $("inputs.referenceVideos", 10, te, hr, "The guide calls 1-5 the stable band, each about 5-10 s."),
    referenceAudios: $("inputs.referenceAudios", 10, te, jt, "Audio can be used on its own."),
    sourceVideo: $(
      "inputs.video",
      1,
      I("editing"),
      F({ secondsEach: x(2, 30), sidePx: x(300, 6e3), maxBytesEach: 200 * D, aspect: x(0.4, 2.5) }),
      "Edit or extend; settings.operation picks, or the prompt decides."
    ),
    audioToVideo: $("inputs.referenceAudios", 10, Xe, jt, "Audio-to-video runs through reference audio; there is no separate driving-audio field."),
    elements: V(te)
  },
  combinations: [
    {
      id: "frames-alone",
      text: "frameImages cannot be combined with reference images, reference videos or a source video.",
      when: ["firstFrame"],
      forbidsInputs: ["referenceImages", "referenceVideos", "sourceVideo"],
      source: I("image-to-video")
    },
    {
      id: "last-needs-first",
      text: "A last frame needs a first frame.",
      when: ["lastFrame"],
      requiresOneOf: ["firstFrame"],
      source: I("image-to-video")
    },
    {
      id: "edit-auto-duration",
      text: "An edit (settings.operation edit) takes duration auto; an integer is rejected. width/height are not allowed beside a source video.",
      when: ["sourceVideo"],
      forbidsParams: ["width", "height"],
      source: I("editing")
    }
  ],
  output: {
    durations: { kind: "range", min: 4, max: 30, auto: !0 },
    defaultDuration: 5,
    resolutionField: "both",
    resolutions: ["480p", "720p", "1080p"],
    sizes: [
      ...qe("480p", [["~16:9", 854, 480], ["~4:3", 752, 560], ["1:1", 640, 640], ["~3:4", 560, 752], ["~9:16", 480, 854], ["~21:9", 992, 432]]),
      ...qe("720p", [["16:9", 1280, 720], ["4:3", 1112, 834], ["1:1", 960, 960], ["3:4", 834, 1112], ["9:16", 720, 1280], ["21:9", 1470, 630]]),
      ...qe("1080p", [["16:9", 1920, 1080], ["4:3", 1664, 1248], ["1:1", 1440, 1440], ["3:4", 1248, 1664], ["9:16", 1080, 1920], ["~21:9", 2206, 946]])
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: !0, toggle: "settings.audio" },
    source: te
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
      source: I("multi-reference-production")
    },
    rules: [
      { text: "Keep five concerns apart: shot, subject, action, light, audio.", source: I("prompting") },
      { text: "Open with the camera clause so motion goes to the camera, not idle subject animation.", source: I("prompting") },
      { text: "Give camera and subject separate clauses, with one main action arc per clip.", source: I("prompting") },
      { text: "Pace beats with time windows such as [0-3s].", source: I("prompting") },
      { text: "Bind each tag to a role, then use the role name; put audio and negatives at the end.", source: I("multi-reference-production") }
    ],
    seed: { supported: !0, max: 2147483647, source: te },
    negativePrompt: !1
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "static / locked-off", source: I("prompting"), move: "static", phrase: "Static, locked-off camera." },
      { term: "dolly-in / push-in", source: I("prompting"), move: "push-in", phrase: "Slow dolly-in towards the subject." },
      { term: "dolly-out / pull-back", source: I("prompting"), move: "pull-out", phrase: "Slow dolly-out, pulling back to reveal the setting." },
      { term: "tracking shot", source: I("prompting"), move: "track-left", phrase: "Tracking shot moving left with the subject." },
      { term: "tracking shot", source: I("prompting"), move: "track-right", phrase: "Tracking shot moving right with the subject." },
      { term: "crane / boom", source: I("prompting"), move: "crane-up", phrase: "Crane up, rising above the subject." },
      { term: "crane / boom", source: I("prompting"), move: "crane-down", phrase: "Crane down, lowering towards the subject." },
      { term: "orbit / arc", source: I("prompting"), move: "orbit", phrase: "Slow orbit around the subject." },
      { term: "handheld", source: I("prompting"), move: "handheld", phrase: "Handheld camera with subtle organic shake." },
      { term: "dolly zoom / Vertigo", source: I("prompting") },
      { term: "one-shot, FPV, bullet time, speed ramp", source: I("prompting") }
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
    source: Xe,
    note: "Which inputs bill at the Video-to-Video rate (a source video, reference videos, or both) is not stated."
  },
  notes: [
    "Output fps: not stated. Frame-count rule: not stated.",
    "Rack focus: not stated in the guide's camera vocabulary.",
    "The prompting guide says there is no 1080p output; the schema and model page offer 1080p. The schema is followed.",
    "Prompt limit: the guide says 10,000 characters, the schema 50,000.",
    "Seed maximum is 2^31-1 while the text says random seeds use the unsigned 32-bit range."
  ]
}, je = [
  ie,
  Y,
  gr,
  fr,
  mr,
  pr,
  lr
];
function mo(e) {
  const t = je.find((o) => o.id === e || o.air === e || o.slug === e);
  if (!t) throw new Error(`No spec for "${e}". Known: ${je.map((o) => o.id).join(", ")}.`);
  return t;
}
const br = {
  "first-frame": "firstFrame",
  "last-frame": "lastFrame",
  keyframe: "keyframes"
}, Ct = ["firstFrame", "lastFrame", "keyframes"];
function vr(e, t) {
  return t.kind === "image" ? br[t.role] ?? "referenceImages" : t.kind === "video" ? t.role === "source" ? "sourceVideo" : "referenceVideos" : e.inputs.referenceAudios.supported || !e.inputs.audioToVideo.supported ? "referenceAudios" : "audioToVideo";
}
function wr(e, t, o) {
  const r = [], s = [];
  let n = [];
  const a = (u, m) => {
    n = n.filter((f) => f !== u), r.push({ ref: u.ref.id, role: u.ref.role, wanted: u.convertedFrom ?? u.input, reason: m });
  }, c = (u) => n.some((m) => m.input === u), d = (u) => n.filter((m) => m.input === u).length, l = (u, m) => {
    u.convertedFrom || (u.convertedFrom = u.input), u.input = "referenceImages", s.push(`${u.ref.id}: sent as a reference image because ${m}`);
  };
  for (const u of t.references) {
    const m = vr(e, u), f = { ref: u, input: m };
    if (!e.inputs[m].supported) {
      r.push({ ref: u.id, role: u.role, wanted: m, reason: `${e.name} takes no ${Ut(m)}.` });
      continue;
    }
    const v = e.inputs[m].maxCount;
    if (v !== null && d(m) >= v) {
      r.push({ ref: u.id, role: u.role, wanted: m, reason: `${e.name} takes at most ${v} ${Ut(m)}.` });
      continue;
    }
    n.push(f);
  }
  const p = e.camera.kind === "parameter" ? e.camera.field : null;
  for (let u = 0; u < 4; u++)
    for (const m of e.combinations) {
      if (m.when.length === 0 || !m.when.every(c)) continue;
      const f = n.filter((b) => m.when.includes(b.input));
      if (p && m.forbidsParams?.includes(p) && (o.prefer ?? "camera-parameter") === "camera-parameter" && po(e, t.camera)) {
        for (const b of f) a(b, `${m.text} The camera parameter was kept.`);
        continue;
      }
      const v = n.filter((b) => m.forbidsInputs?.includes(b.input));
      if (v.length) {
        const b = e.inputs.referenceImages.supported;
        if (b && f.every((h) => Ct.includes(h.input)) && !v.every((h) => h.input === "referenceImages" && !h.convertedFrom))
          for (const h of f) l(h, `${e.name} does not take a frame beside references (${m.id}).`);
        else if (b && !m.forbidsInputs?.includes("referenceImages") && v.every((h) => Ct.includes(h.input)))
          for (const h of v) l(h, `frame images are not allowed here (${m.id}).`);
        else
          for (const h of v) a(h, m.text);
      }
      if (m.requiresExactly) {
        const { input: b, count: h } = m.requiresExactly;
        for (const g of n.filter((y) => y.input === b).slice(h)) a(g, m.text);
        if (d(b) < h) for (const g of n.filter((y) => m.when.includes(y.input))) a(g, m.text);
      }
      if (m.requiresOneOf && !m.requiresOneOf.some(c))
        for (const b of n.filter((h) => m.when.includes(h.input))) a(b, m.text);
    }
  for (const u of e.combinations) {
    if (!u.sharedMax) continue;
    const m = n.filter((f) => u.sharedMax.inputs.includes(f.input));
    for (const f of m.slice(u.sharedMax.max)) a(f, u.text);
  }
  return { slots: n, dropped: r, notes: s };
}
function po(e, t) {
  return e.camera.kind === "parameter" ? e.camera.values.find((o) => o.move === t)?.value : void 0;
}
const yr = {
  firstFrame: "first frame",
  lastFrame: "last frame",
  keyframes: "keyframes",
  referenceImages: "reference images",
  referenceVideos: "reference video",
  referenceAudios: "reference audio",
  sourceVideo: "source video",
  audioToVideo: "driving audio",
  elements: "elements"
}, Ut = (e) => yr[e];
function xr(e, t) {
  const o = /* @__PURE__ */ new Map(), { style: r, tokens: s } = e.prompting.addressing, n = (d) => s.find((l) => l.input === d)?.pattern, a = (d) => d.flatMap((l) => t.filter((p) => p.input === l)), c = (d, l) => {
    const p = n(l);
    d.forEach((u, m) => o.set(u, p ? p.replace("{n}", String(m + 1)) : null));
  };
  for (const d of t) o.set(d, null);
  return r === "tags" ? (c(a(["firstFrame", "lastFrame", "keyframes", "referenceImages"]), "image"), c(a(["sourceVideo", "referenceVideos"]), "video")) : (r === "at-mentions" || r === "plain-words") && (c(a(["referenceImages"]), "image"), c(a(["referenceVideos"]), "video"), c(a(["referenceAudios"]), "audio")), o;
}
function kr(e, t, o) {
  const r = e.output.durations;
  let s;
  return r.kind === "range" ? s = Math.min(r.max, Math.max(r.min, Math.round(t))) : s = r.values.reduce((n, a) => Math.abs(a - t) < Math.abs(n - t) ? a : n), s !== t && o.push(`Duration ${t} s is not offered; ${s} s is sent.`), s;
}
function $r(e, t, o = {}) {
  const r = typeof e == "string" ? mo(e) : e, { slots: s, dropped: n, notes: a } = wr(r, t, o), c = xr(r, s), d = s.map((g) => ({
    ref: g.ref.id,
    role: g.ref.role,
    input: g.input,
    field: r.inputs[g.input].field,
    address: c.get(g) ?? null,
    ...g.convertedFrom ? { convertedFrom: g.convertedFrom } : {}
  })), l = {}, p = po(r, t.camera), u = r.camera.kind === "parameter" ? r.camera.forbiddenWith.some((g) => d.some((y) => y.input === g)) : !0, m = d.some((g) => g.input === "referenceVideos" && g.role === "motion");
  let f;
  if (t.camera === "guide") {
    const g = d.find((y) => y.input === "referenceVideos" && y.role === "motion");
    if (g) {
      const y = r.prompting.addressing.style === "at-mentions" && g.address ? `Camera: follow the camera move of ${g.address}.` : null;
      a.push("The camera comes from the guide video: its camera path and pacing, named in the guide reference; no camera move is written."), f = { move: "guide", mode: "guide-video", text: y };
    } else
      a.push("No guide video reaches this model, so no camera move is written; set shot.camera to choose one."), f = { move: "guide", mode: "prompt", text: null };
  } else if (r.camera.kind === "parameter" && p && !u)
    l[r.camera.field] = p, f = { move: t.camera, mode: "parameter", field: r.camera.field, value: p, text: null };
  else {
    const g = sr(r, t.camera, t.focus);
    g.note && a.push(g.note), r.camera.kind === "parameter" && !p && a.push(`${r.camera.field} has no value for "${t.camera}"; the move is written into the prompt.`), r.camera.kind === "parameter" && p && u && a.push(`${r.camera.field} is not allowed beside these inputs; the move is written into the prompt.`);
    const y = m && r.prompting.addressing.style === "tags";
    y && a.push("The guide video carries the camera path; the prompt references it instead of describing the move."), f = { move: t.camera, mode: m ? "guide-video" : "prompt", text: y ? null : g.text };
  }
  const v = d.some((g) => g.input === "audioToVideo"), b = kr(r, t.duration, a);
  v ? a.push("Audio-driven: no duration is sent; the clip runs as long as the audio.") : l.duration = b;
  const h = cr(r, t, d, f);
  return r.prompting.maxChars !== null && h.length > r.prompting.maxChars && a.push(`The prompt is ${h.length} characters; ${r.name} takes ${r.prompting.maxChars}.`), {
    model: r.id,
    name: r.name,
    prompt: h,
    params: l,
    camera: f,
    used: d,
    dropped: n,
    cannotTake: Mo.filter((g) => !r.inputs[g].supported),
    duration: { requested: t.duration, sent: b },
    notes: a
  };
}
class fo extends Error {
  constructor(t) {
    super(t), this.name = "FitError";
  }
}
function $e(e, t, o, r) {
  const s = [], n = o.info;
  if (!n) return s;
  const { width: a, height: c, seconds: d, fps: l, bytes: p } = n, u = /image/.test(t);
  return r.minSide && a && c && (a < r.minSide || c < r.minSide) && s.push(
    `${e} needs ${t} at least ${r.minSide} px on each side; ${o.name} is ${a}×${c}. ` + (u ? `Use a larger image: export or resize it so its shorter side is at least ${r.minSide} px (1024 px is a safe size).` : `Scale it first, e.g. ffmpeg -i in.mp4 -vf scale=-2:${r.minSide <= 720 ? 720 : r.minSide} -c:a copy out.mp4`)
  ), r.maxSide && a && c && (a > r.maxSide || c > r.maxSide) && s.push(`${e} takes ${t} up to ${r.maxSide} px a side; ${o.name} is ${a}×${c}.${u ? ` Resize it so its longer side is ${r.maxSide} px or less.` : ""}`), r.minRatio && a && c && (a / c < r.minRatio || a / c > (r.maxRatio ?? 1 / 0)) && s.push(
    `${e} takes ${t} with aspect ${r.minRatio}-${r.maxRatio}; ${o.name} is ${(a / c).toFixed(2)}.${u ? " Crop it closer to square: no side more than 2.5 times the other." : ""}`
  ), d !== void 0 && r.minSeconds !== void 0 && d < r.minSeconds && s.push(`${e} needs ${t} of at least ${r.minSeconds} s; ${o.name} is ${d.toFixed(2)} s.`), d !== void 0 && r.maxSeconds !== void 0 && d > r.maxSeconds && s.push(`${e} takes ${t} up to ${r.maxSeconds} s; ${o.name} is ${d.toFixed(2)} s. Trim it first.`), l && r.minFps && (l < r.minFps || l > (r.maxFps ?? 1 / 0)) && s.push(`${e} takes ${t} at ${r.minFps}-${r.maxFps} fps; ${o.name} is ${l} fps.`), p && r.maxBytes && p > r.maxBytes && s.push(
    `${e} takes ${t} up to ${Math.round(r.maxBytes / 1048576)} MB; ${o.name} is ${(p / 1048576).toFixed(1)} MB.${u ? " Save it as a JPEG or at a smaller size." : ""}`
  ), s;
}
const Lt = (e) => e.reduce((t, o) => t === void 0 || o.info?.seconds === void 0 ? void 0 : t + o.info.seconds, 0);
function ho(e, t, o, r, s = !1) {
  const n = t.sharedSeconds?.max, a = Lt(o), c = Lt(r);
  if (n === void 0 || !r.length || a === void 0 || c === void 0 || a + c <= n) return { drop: !1 };
  const d = (l) => `${Math.round(l * 100) / 100} s`;
  return s ? {
    drop: !1,
    problem: `${e} takes reference video and audio up to ${n} s together; got ${d(a)} of video and ${d(c)} of audio, and the audio is required. Use a guide of ${d(Math.max(0, n - c))} or less, or allow the lane to run without the separate audio.`
  } : {
    drop: !0,
    note: `Music not sent to ${e}: video and audio together may not exceed ${n} s; timing comes from the guide video (${d(a)} of video, ${d(c)} of audio).`
  };
}
function Sr(e, t) {
  const o = t.modelName, r = { referenceVideos: [], referenceAudios: [], referenceImages: [], frameImages: [], notes: [] }, s = [], { guideVideo: n, firstFrame: a, character: c, environment: d, audio: l, keyframes: p = [] } = t, u = (m) => s.push(m);
  if (e.approach === "reference-video" || e.approach === "router") {
    !n && e.approach === "reference-video" && u(`${o} is a reference-video lane; pass the guide clip.`), n && (!e.referenceVideos && e.approach === "reference-video" ? u(`${o} takes no reference video.`) : (e.referenceVideos && s.push(...$e(o, "reference videos", n, e.referenceVideos)), r.referenceVideos.push(n))), c && (e.referenceImages ? (s.push(...$e(o, "reference images", c, e.referenceImages)), r.referenceImages.push(c)) : u(`${o} takes no reference image for the character.`)), d && (e.referenceImages ? (s.push(...$e(o, "reference images", d, e.referenceImages)), r.referenceImages.push(d)) : u(`${o} takes no reference image for the environment.`)), a && (e.startFrameWithReferences && e.frameImages ? r.frameImages.push({ media: a, frame: "first" }) : e.referenceImages ? (r.referenceImages.push(a), r.notes.push(
      `${o} refuses a start frame beside reference videos, so the first frame goes in as an image reference.`
    )) : u(`${o} cannot take the first frame with a reference video.`)), l && (e.referenceAudios ? (s.push(...$e(o, "reference audio", l, e.referenceAudios)), r.referenceAudios.push(l)) : u(`${o} takes no reference audio; drop --audio for this lane.`));
    const m = ho(o, e, r.referenceVideos, r.referenceAudios, t.requireAudio);
    m.problem && u(m.problem), m.drop && (r.referenceAudios = [], r.notes.push(m.note)), p.length && u(`${o} is fed the whole clip; keyframes belong to the FLUX 3 Video lane.`);
  } else if (e.approach === "audio-first-frame")
    c && u(`${o} takes no character reference beside a guide; pass the still as --first-frame instead.`), d && u(`${o} takes one image only; pass the environment still as --first-frame instead.`), n && u(`${o} takes no reference video. Pass --audio and --first-frame instead of --guide.`), p.length && u(`${o} takes a first frame (and optionally a last), not keyframes.`), l ? e.drivingAudio ? (a || u(`${o} needs a reference image beside the audio; pass --first-frame.`), s.push(...$e(o, "audio", l, e.drivingAudio)), r.drivingAudio = l, a && (r.referenceImages.push(a), r.notes.push(
      `${o} with audio takes the still as inputs.referenceImages (its schema forbids frameImages beside audio); the clip length follows the audio.`
    ))) : u(`${o} takes no audio input.`) : a ? r.frameImages.push({ media: a, frame: "first" }) : u(`${o} needs --first-frame (and --audio for the audio-driven mode).`);
  else {
    n && u(`${o} uses its video input only to extend a clip; send keyframes or a first frame instead.`), l && u(`${o} takes no audio input.`), (c || d) && u(`${o} takes no reference images; pass the still as --first-frame instead.`), a && r.frameImages.push({ media: a, frame: "first" });
    for (const m of p)
      typeof m.frame == "number" && !e.frameImages?.indexPositions && u(`${o} only places frames first or last.`), r.frameImages.push(m);
    r.frameImages.length || u(`${o} needs --first-frame or keyframes.`);
  }
  if (e.frameImages && r.frameImages.length > e.frameImages.max && u(`${o} takes at most ${e.frameImages.max} frame images; got ${r.frameImages.length}.`), e.referenceImages && r.referenceImages.length > e.referenceImages.max && u(`${o} takes at most ${e.referenceImages.max} reference images.`), s.length) throw new fo(s.join(`
`));
  return r;
}
const ge = (e) => `https://runware.ai/docs/models/${e}/schema.json`, ne = { max: 10, minSide: 300, maxBytes: 31457280, minRatio: 0.4, maxRatio: 2.5 }, Te = {
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
    referenceImages: ne,
    frameImages: { ...ne, indexPositions: !1 },
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
  schemaUrl: ge("klingai-video-4-0")
}, Ye = Y.inputs.referenceVideos.limits, Ir = {
  ...Te,
  key: Y.id,
  air: Y.air,
  slug: Y.slug,
  name: Y.name,
  caps: {
    ...Te.caps,
    referenceVideos: {
      ...Te.caps.referenceVideos,
      minSeconds: Ye.secondsEach.min,
      maxSeconds: Ye.secondsEach.max,
      totalMaxSeconds: Ye.secondsTotalMax
    },
    frameImages: { ...ne, max: Y.inputs.firstFrame.maxCount, indexPositions: !1 }
  },
  duration: { kind: "range", min: 3, max: 20, auto: !1 },
  resolutions: void 0,
  defaultResolution: "720p",
  rates: Y.pricing.rates.map((e) => ({
    usdPerSecond: e.usdPerSecond,
    label: e.label,
    resolution: e.tier,
    videoInput: e.mode === "video-input"
  })),
  schemaUrl: Y.sources.schema
}, Er = {
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
    referenceImages: { ...ne, max: 30, maxSide: 6e3 },
    frameImages: { ...ne, max: 2, maxSide: 6e3, indexPositions: !1 },
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
  schemaUrl: ge("bytedance-seedance-2-5")
}, Ar = {
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
    referenceImages: { ...ne, max: 9, minSide: 256, maxSide: 5760 },
    frameImages: { ...ne, max: 2, minSide: 256, maxSide: 5760, indexPositions: !1 },
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
  schemaUrl: ge("minimax-h3")
}, Pr = ["dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "static", "focus_shift"], rt = {
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
  cameraMovements: Pr,
  rates: [
    { usdPerSecond: 0.12, label: "720p", resolution: "720p" },
    { usdPerSecond: 0.17, label: "1080p", resolution: "1080p" }
  ],
  schemaUrl: ge("lightricks-ltx-2-5-pro")
}, Vr = {
  ...rt,
  key: "ltx-2.5-fast",
  air: "lightricks:ltx@2.5-fast",
  slug: "lightricks-ltx-2-5-fast",
  name: "LTX-2.5 Fast",
  caps: { ...rt.caps, drivingAudio: { max: 1, minSeconds: 2, maxSeconds: 20 } },
  duration: { kind: "enum", values: [6, 8, 10, 12, 14, 16, 18, 20], auto: !0 },
  rates: [
    { usdPerSecond: 0.09, label: "720p", resolution: "720p" },
    { usdPerSecond: 0.13, label: "1080p", resolution: "1080p" }
  ],
  schemaUrl: ge("lightricks-ltx-2-5-fast")
}, Rr = {
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
  schemaUrl: ge("bfl-flux-3-video")
}, Tr = {
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
}, Ft = [Te, Ir, Er, Ar, rt, Vr, Rr, Tr];
function pt(e) {
  const t = Ft.find((o) => o.key === e || o.air === e || o.slug === e);
  if (!t) throw new Error(`Unknown model "${e}". Use one of: ${Ft.map((o) => o.key).join(", ")}.`);
  return t;
}
const jr = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, Cr = (e, t) => `{{upload:${e}:${t.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80)}}}`;
function Ur() {
  return globalThis.crypto.randomUUID();
}
class A extends Error {
  constructor(t) {
    super(t), this.name = "PlanError";
  }
}
function Lr(e, t) {
  if (t === "auto") {
    if (!e.duration.auto) throw new A(`${e.name} needs a whole number of seconds; "auto" is not in its schema.`);
    return;
  }
  if (!Number.isInteger(t)) throw new A(`Duration must be a whole number of seconds; got ${t}.`);
  if (e.duration.kind === "range" && (t < e.duration.min || t > e.duration.max))
    throw new A(`${e.name} makes ${e.duration.min}-${e.duration.max} s clips; got ${t}.`);
  if (e.duration.kind === "enum" && !e.duration.values.includes(t))
    throw new A(`${e.name} makes clips of ${e.duration.values.join(", ")} s only; got ${t}.`);
}
function Fr(e, t, o) {
  const r = e.rates.filter((n) => n.resolution === t);
  return r.find((n) => n.videoInput === void 0 || n.videoInput === o) ?? r[0] ?? e.rates.reduce((n, a) => a.usdPerSecond > n.usdPerSecond ? a : n, e.rates[0]);
}
const Mr = (e) => e.duration.kind === "range" ? e.duration.max : Math.max(...e.duration.values);
function Nr(e, t) {
  if (e.key === "auto")
    return { usd: t.maxPrice ?? null, basis: "router: capped server-side by routing.maxPrice" };
  const o = t.seconds === "auto" ? Mr(e) : t.seconds, r = Fr(e, t.resolution, t.videoInput);
  let s = r.usdPerSecond * o, n = `${r.label} at $${r.usdPerSecond}/s × ${o} s${t.seconds === "auto" ? " (auto: bounded by the longest clip)" : ""}`;
  if (e.inputVideoUsdPerSecond && t.videoInput) {
    const a = t.inputVideoSeconds ?? e.caps.referenceVideos?.totalMaxSeconds ?? 15;
    s += e.inputVideoUsdPerSecond * a, n += ` + input video $${e.inputVideoUsdPerSecond}/s × ${a.toFixed(2)} s`;
  }
  return e.key === "h3" && (t.images ?? 0) > 5 && (s += 0.04 * ((t.images ?? 0) - 5), n += " + $0.04 per image beyond five"), { usd: Math.round(s * 1e4) / 1e4, basis: n };
}
function go(e, t = Ur()) {
  const o = pt(e.model), r = e.prompt.trim();
  if (r.length < o.prompt.min || r.length > o.prompt.max)
    throw new A(`${o.name} takes a prompt of ${o.prompt.min}-${o.prompt.max} characters.`);
  if (o.key === "auto" && !(e.routing && e.routing.maxPrice > 0))
    throw new A("The router lane needs a price cap (routing.maxPrice / --max-price).");
  let s;
  try {
    s = Sr(o.caps, {
      modelName: o.name,
      guideVideo: e.guideVideo,
      firstFrame: e.firstFrame,
      character: e.character,
      environment: e.environment,
      requireAudio: e.requireAudio,
      audio: e.audio,
      keyframes: e.keyframes
    });
  } catch (h) {
    throw h instanceof fo ? new A(h.message) : h;
  }
  const n = [], a = [], c = (h, g, y) => {
    if (a.push({
      role: g,
      src: h.displaySrc ?? h.name,
      label: h.name,
      ...y !== void 0 ? { frame: y } : {}
    }), jr.test(h.ref) || /^https:\/\//.test(h.ref)) return h.ref;
    if (!/^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(h.ref))
      throw new A(`${h.name}: media must be an https URL, a media UUID or a data URI.`);
    const j = n.find((Q) => Q.media === h);
    if (j) return j.placeholder;
    const C = Cr(n.length + 1, h.name);
    return n.push({ placeholder: C, media: h }), C;
  }, d = {};
  s.frameImages.length && (d.frameImages = s.frameImages.map((h) => ({ image: c(h.media, "frameImage", h.frame), frame: h.frame }))), s.referenceImages.length && (d.referenceImages = s.referenceImages.map((h) => c(h, "referenceImage"))), s.referenceVideos.length && (d.referenceVideos = s.referenceVideos.map((h) => c(h, "referenceVideo"))), s.referenceAudios.length && (d.referenceAudios = s.referenceAudios.map((h) => c(h, "referenceAudio"))), s.drivingAudio && (d.audio = c(s.drivingAudio, "audio"));
  const l = {
    taskType: "videoInference",
    taskUUID: t,
    model: o.air,
    positivePrompt: r
  }, p = !!s.drivingAudio, u = e.duration ?? (o.duration.kind === "range" ? Math.max(5, o.duration.min) : o.duration.values[0]);
  if (p) {
    if (e.duration !== void 0) throw new A(`${o.name} with audio takes its length from the audio; drop --duration.`);
  } else
    Lr(o, u), l.duration = u;
  let m = e.resolution ?? o.defaultResolution;
  if (o.resolutions) {
    if (m && !o.resolutions.includes(m))
      throw new A(`${o.name} resolutions: ${o.resolutions.join(", ")}.`);
    m && (l.resolution = m);
  } else if (o.sizes)
    if (p) m = "1080p";
    else {
      const h = m ? o.sizes[m] : void 0;
      if (!h) throw new A(`${o.name} sizes: ${Object.keys(o.sizes).join(", ")}.`);
      l.width = h.width, l.height = h.height;
    }
  else if (o.key !== "auto") {
    if (e.resolution && e.resolution !== o.defaultResolution)
      throw new A(`${o.name} makes ${o.defaultResolution} only; the size follows the input.`);
  } else if (e.resolution) throw new A(`${o.name}: resolution is not set on the router lane; describe it in --requirements.`);
  if (Object.keys(d).length && (l.inputs = d), e.camera !== void 0) {
    if (!o.cameraMovements)
      throw new A(`${o.name} declares no camera parameter in its schema; describe the camera in the prompt.`);
    if (!o.cameraMovements.includes(e.camera))
      throw new A(`${o.name} camera movements: ${o.cameraMovements.join(", ")}.`);
    if (p) throw new A(`${o.name} forbids cameraMovement beside audio.`);
    l.settings = { cameraMovement: e.camera };
  }
  if (o.key === "auto" && e.routing) {
    const h = { maxPrice: e.routing.maxPrice };
    if (e.routing.requirements) {
      if (e.routing.requirements.length > 3e3) throw new A("routing.requirements is limited to 3000 characters.");
      h.requirements = e.routing.requirements;
    }
    e.routing.preferences && (h.preferences = e.routing.preferences), l.routing = h;
  }
  l.deliveryMethod = "async", l.includeCost = !0;
  const f = s.referenceVideos.length > 0, v = Nr(o, {
    resolution: m,
    seconds: p ? s.drivingAudio?.info?.seconds ?? o.caps.drivingAudio?.maxSeconds ?? 10 : u,
    videoInput: f,
    inputVideoSeconds: s.referenceVideos.reduce(
      (h, g) => g.info?.seconds === void 0 || h === void 0 ? void 0 : h + g.info.seconds,
      0
    ),
    images: s.referenceImages.length + s.frameImages.length,
    maxPrice: e.routing?.maxPrice
  }), b = [...s.notes];
  return o.prompt.tokens && b.push(`${o.name} prompt tokens for inputs: ${o.prompt.tokens}.`), {
    provider: "runware-api",
    modelId: o.air,
    modelName: o.name,
    uploads: n,
    task: l,
    inputsSent: a,
    firstFrameVariant: e.firstFrame ? e.firstFrameVariant ?? "A" : "C",
    estimate: v,
    notes: b
  };
}
function Dr(e, t) {
  const o = JSON.stringify(e).replace(/\{\{upload:\d+:[^}]*\}\}/g, (r) => {
    const s = t.get(r);
    if (!s) throw new Error(`No media id for ${r}.`);
    return s;
  });
  return JSON.parse(o);
}
const me = ["kling-4", "seedance-2.5", "h3", "ltx-2.5"], Or = ["kling-4", "seedance-2.5", "h3"], Ze = (e, t) => e && (e.min !== null || e.max !== null) ? `${e.min ?? 0}-${e.max ?? "any"} ${t}` : null, Qe = (e, t, o) => {
  const r = e.prompting.addressing.tokens.find((s) => s.input === t);
  return r ? ` ${r.pattern.replace("{n}", String(o))}` : "";
};
function _r(e, t) {
  if (t === "audio-first-frame") {
    const d = Ze(e.inputs.audioToVideo.limits?.secondsEach, "s");
    return `Audio + first frame only: does not use the guide video. Takes the guide's audio${d ? ` (${d})` : ""} and exactly one image: frame 0, your character sheet or your environment image, not both. The clip runs as long as the audio.`;
  }
  const o = e.inputs.referenceVideos.limits, r = [Ze(o?.secondsEach, "s"), o?.sidePx?.min ? `${o.sidePx.min}+ px a side` : null, Ze(o?.fps, "fps")].filter(Boolean).join(", "), s = pt(e.id).caps.sharedSeconds?.max, n = e.inputs.referenceAudios.supported ? `its audio as reference audio${s ? ` when clip and audio fit ${s} s together` : ""}` : "no audio input", a = e.inputs.referenceImages, c = a.supported ? `; up to ${a.maxCount ?? "several"} reference images beside it: character sheet${Qe(e, "image", 1)}, environment${Qe(e, "image", 2)}` : "; no reference images";
  return `The whole guide clip as a reference video${Qe(e, "video", 1)} (${r}); ${n}${c}.`;
}
function Br(e) {
  const t = e.sources.guides;
  return t.find((o) => /prompt/i.test(o.title)) ?? t[0] ?? { title: "Model page", url: e.sources.model };
}
function ft(e) {
  if (!me.includes(e))
    throw new A(`The generate flow offers ${me.join(", ")}; "${e}" is not one of them.`);
  const t = mo(e), o = t.inputs.referenceVideos.supported ? "guide-video" : "audio-first-frame";
  return { key: e, name: t.name, use: o, line: _r(t, o), guide: Br(t) };
}
const bo = () => me.map(ft);
function zr(e, t, o) {
  const r = ft(t), s = [], n = [];
  if (r.use === "guide-video") {
    n.push({ id: "guide", kind: "video", role: "motion" }), o.hasCharacter && n.push({ id: "character", kind: "image", role: "character", replaces: "the figure in the guide" }), o.hasEnvironment && n.push({ id: "environment", kind: "image", role: "setting", replaces: "the guide's background" });
    const c = o.hasAudio ? ho(r.name, pt(r.key).caps, [{ name: "guide", info: { seconds: o.seconds, hasAudio: o.audioInVideo } }], [{ name: "audio", info: { seconds: o.audioSeconds ?? o.seconds } }], o.requireAudio) : { drop: !1 };
    if (c.problem) throw new A(c.problem);
    c.drop ? s.push(c.note) : o.hasAudio && n.push({ id: "audio", kind: "audio", role: "soundtrack" });
  } else {
    if (o.hasCharacter && o.hasEnvironment)
      throw new A(`${r.name} takes exactly one image beside the audio: send the character sheet or the environment image, not both.`);
    n.push({ id: o.hasCharacter ? "character" : o.hasEnvironment ? "environment" : "frame0", kind: "image", role: "first-frame" }), o.hasAudio && n.push({ id: "audio", kind: "audio", role: "soundtrack" });
  }
  return { shot: {
    subject: e.subject,
    action: e.action,
    ...e.environment ? { environment: e.environment } : {},
    ...e.legend ? { legend: e.legend } : {},
    // With no camera named, the guide video carries it (and LTX, without one, gets no camera words).
    camera: e.camera ?? "guide",
    references: n,
    duration: Math.max(1, Math.round(o.seconds))
  }, notes: s };
}
function De(e, t, o) {
  const r = ft(t), { shot: s, notes: n } = zr(e, t, o), a = $r(t, s, r.use === "audio-first-frame" ? { prefer: "inputs" } : {});
  return { model: r, composed: a, shot: s, notes: n };
}
const Gr = (e, t, o = Or) => o.map((r) => De(e, r, t));
function nn(e, t, o = {}, r = {}) {
  const s = "manifest" in r ? r : void 0, n = {
    seconds: s ? s.seconds : r.seconds ?? 5,
    hasAudio: s ? !!s.audio : r.hasAudio ?? !0,
    audioInVideo: s ? s.meta.audioInVideo === !0 : r.audioInVideo,
    hasCharacter: !!o.character,
    hasEnvironment: !!o.environment
  }, a = De(e, t, n);
  return {
    model: a.model,
    prompt: a.composed.prompt,
    tags: a.composed.used.filter((c) => c.address).map((c) => ({ tag: c.address, input: c.ref })),
    dropped: a.composed.dropped.map((c) => `${c.ref}: ${c.reason}`),
    notes: [...a.notes, ...a.composed.notes],
    shot: a.shot
  };
}
const an = () => bo();
function vo(e, t) {
  const { guide: o, character: r, environment: s } = e, n = e.prompt?.trim() || void 0, a = e.shot ?? o.shot ?? (n ? { subject: n, action: "" } : void 0);
  if (!a || !a.subject.trim()) throw new A("Describe the shot (subject and action), or write a prompt.");
  const c = { seconds: o.seconds, hasAudio: !!o.audio, hasCharacter: !!r, hasEnvironment: !!s, audioInVideo: o.meta.audioInVideo === !0, audioSeconds: o.audio?.info?.seconds, requireAudio: e.requireAudio }, { model: d, composed: l, shot: p, notes: u } = De(a, e.model, c);
  if (d.use === "audio-first-frame" && !o.audio)
    throw new A(`${d.name} is driven by the guide's audio, and this bundle has no audio file.`);
  const m = { guide: o.video, audio: o.audio, character: r, environment: s, frame0: o.firstFrame }, f = { model: d.key, prompt: n ?? l.prompt };
  for (const h of l.used) {
    const g = m[h.ref];
    g && (h.role === "motion" ? f.guideVideo = g : h.role === "soundtrack" ? f.audio = g : h.role === "character" ? f.character = g : h.role === "setting" ? f.environment = g : h.role === "first-frame" && (f.firstFrame = g, f.firstFrameVariant = h.ref === "frame0" ? "A" : "B"));
  }
  typeof l.params.duration == "number" && (f.duration = l.params.duration);
  const v = l.params["settings.cameraMovement"];
  typeof v == "string" && (f.camera = v), e.resolution && (f.resolution = e.resolution), e.requireAudio && (f.requireAudio = !0);
  const b = go(f, t);
  return {
    plan: b,
    request: f,
    composed: l,
    shot: p,
    ...n ? {} : { marker: _o(l) },
    model: d,
    notes: [...u, ...l.notes, ...b.notes]
  };
}
function Kr(e) {
  const t = typeof e == "string" ? Number(e) : e;
  return typeof t == "number" && Number.isFinite(t) && t >= 0 ? t : null;
}
const Wr = (e) => new Promise((t) => setTimeout(t, e));
function Hr(e, t, o, r = "videoURL") {
  const s = o.filter((l) => l.taskUUID === e || !l.taskUUID);
  if (s.length) return { state: "error", error: new se(200, s) };
  const n = t.filter((l) => l.taskUUID === e), a = n.find((l) => l.status === "success" || typeof l[r] == "string");
  if (a && typeof a[r] == "string")
    return {
      state: "success",
      result: {
        taskUUID: e,
        videoURL: a[r],
        ...typeof a.videoUUID == "string" ? { videoUUID: a.videoUUID } : {},
        cost: Kr(a.cost),
        ...typeof a.seed == "number" ? { seed: a.seed } : {},
        ...typeof a.model == "string" ? { model: a.model } : {}
      }
    };
  const c = n.find((l) => l.status === "error");
  if (c) {
    const l = c.error ?? {};
    return {
      state: "error",
      error: new se(200, [{ code: l.code ?? "error", message: l.message ?? "Task failed.", taskUUID: e }])
    };
  }
  const d = n.find((l) => l.status === "processing");
  return d ? { state: "processing", progress: typeof d.progress == "number" ? d.progress : void 0 } : { state: "absent" };
}
async function Xr(e, t, o = {}) {
  const r = o.sleep ?? Wr, s = o.now ?? Date.now, n = o.timeoutMs ?? 45 * 6e4, a = s();
  let c = o.intervalMs ?? 2e3;
  const d = o.maxIntervalMs ?? 15e3;
  for (await r(o.initialDelayMs ?? 5e3); ; ) {
    if (o.signal?.aborted) throw new Error(`Stopped polling. Resume with taskUUID ${t}.`);
    const { data: l, errors: p } = await e.post([{ taskType: "getResponse", taskUUID: t }], o.signal), u = Hr(t, l, p, o.urlField);
    if (u.state === "success") return u.result;
    if (u.state === "error") throw u.error;
    if (o.onProgress?.(u.state, u.state === "processing" ? u.progress : void 0), s() - a > n)
      throw new Error(`Still running after ${Math.round(n / 6e4)} min. Resume with taskUUID ${t}; do not resubmit.`);
    await r(c), c = Math.min(d, Math.round(c * 1.5));
  }
}
async function Jr(e, t, o, r, s) {
  if (r && r !== "auto") return r;
  if (t.modelId !== "auto") return t.modelId;
  try {
    const n = await e.taskDetails(o, s), a = Array.isArray(n?.request) ? n.request : [], c = a.find((d) => d.taskUUID === o)?.model ?? a[0]?.model;
    return typeof c == "string" && c !== "auto" ? c : null;
  } catch {
    return null;
  }
}
function qr(e) {
  const t = new Fo({ getKey: e.getKey, fetch: e.fetch });
  async function o(r, s, n, a) {
    const c = String(s.taskUUID), d = await Xr(t, c, {
      ...e.poll,
      signal: a.signal,
      onProgress: (p, u) => a.onProgress?.({ stage: "poll", message: p, progress: u })
    }), l = await Jr(t, r, c, d.model, a.signal);
    return a.onProgress?.({ stage: "done", message: "done" }), {
      taskUUID: c,
      videoURL: d.videoURL,
      costUsd: d.cost,
      generationSeconds: (Date.now() - n) / 1e3,
      modelRan: l,
      task: s
    };
  }
  return {
    id: "runware-api",
    client: t,
    plan: (r) => go(r),
    async run(r, s = {}) {
      const n = Date.now(), a = /* @__PURE__ */ new Map();
      for (const p of r.uploads) {
        s.onProgress?.({ stage: "upload", message: `uploading ${p.media.name}` });
        const { mediaUUID: u } = await t.upload(p.media.ref, s.signal);
        a.set(p.placeholder, u);
      }
      const c = Dr(r.task, a);
      s.onProgress?.({ stage: "submit", message: "submitting" });
      const { errors: d } = await t.post([c], s.signal), l = d.filter((p) => !p.taskUUID || p.taskUUID === c.taskUUID);
      if (l.length) throw new se(400, l);
      return o(r, c, n, s);
    },
    /** Polls an already-submitted task without sending it again. */
    resume(r, s, n = {}) {
      return o(r, { ...r.task, taskUUID: s }, Date.now(), n);
    }
  };
}
class T extends Error {
  constructor(t, o, r) {
    super(o), this.code = t, this.taskUUID = r, this.name = "GenerateError";
  }
  code;
  taskUUID;
}
const Yr = /^[\x21-\x7e]{16,512}$/, Zr = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }, Qr = (e) => typeof e == "object" && e !== null && "manifest" in e && "video" in e, es = ["image/png", "image/jpeg", "image/webp"], ts = 30 * 1048576;
async function st(e, t) {
  if (!e) return;
  const o = e instanceof Blob ? e : e.blob;
  if (!(o instanceof Blob)) throw new T("refused", `The ${t} reference must be an image Blob.`);
  if (!es.includes(o.type)) throw new T("refused", `The ${t} image must be PNG, JPEG or WebP; got ${o.type || "an unknown type"}.`);
  if (o.size > ts) throw new T("refused", `The ${t} image is over 30 MB.`);
  let s = ((e instanceof Blob ? e.name : e.name ?? e.blob.name) || t).split(/[\\/]/).pop();
  lt(s) !== o.type && (s = `${s.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${Zr[o.type]}`);
  const n = e instanceof Blob ? void 0 : e.src;
  try {
    return await or(nt(o, s), n && /^https?:\/\//.test(n) ? n : void 0);
  } catch (a) {
    throw new T("refused", `The ${t} image: ${a.message}`);
  }
}
function nt(e, t) {
  return { name: t, size: e.size, bytes: async () => new Uint8Array(await e.arrayBuffer()) };
}
function wo(e) {
  const t = typeof e[Symbol.iterator] == "function" || "length" in e ? Array.from(e) : [];
  return t.length ? t.map((o, r) => nt(o, o.name ?? `file-${r}`)) : Object.entries(e).map(([o, r]) => nt(r, o));
}
function os(e, t, o, r) {
  if (e instanceof T) return e;
  const s = r(e?.message ?? String(e)), n = o ? ` The task was already submitted and may still finish and be billed (taskUUID ${o}); do not resubmit.` : " Nothing was submitted.";
  return t?.aborted || e?.name === "AbortError" || s.startsWith("Stopped polling") ? new T("aborted", `Stopped.${n}`, o) : s.startsWith("Still running after") ? new T("timeout", s, o) : e instanceof B ? new T("bad-bundle", s) : e instanceof A ? new T("refused", s) : e instanceof se && (e.status === 401 || e.status === 403 || e.errors.some((c) => /key|auth/i.test(c.code))) || /No Runware API key|does not look like a Runware API key/.test(s) ? new T("invalid-key", "The key was refused. Check it in the key panel; it is sent only to api.runware.ai.") : new T("provider", s, o);
}
async function rs(e) {
  const t = e.key, o = typeof t == "function" ? t : typeof t == "string" ? () => t : () => t.getKey(), r = qr({
    getKey: o,
    fetch: e.fetch,
    poll: { timeoutMs: 20 * 6e4, ...e.poll }
  }), s = (c) => r.client.redact(c), n = (c) => e.onProgress?.(c);
  let a;
  try {
    if (!(typeof e.maxPrice == "number" && Number.isFinite(e.maxPrice) && e.maxPrice > 0 && e.maxPrice <= 100))
      throw new T("refused", "maxPrice must be a positive number of USD up to 100.");
    const c = o();
    if (!c || !Yr.test(c)) throw new T("invalid-key", "Connect a Runware API key first (16-512 characters, no spaces).");
    n({ stage: "plan", message: "reading the guide" });
    const d = Qr(e.guide) ? e.guide : await ao(wo(e.guide)), l = await st(e.references?.character, "character"), p = await st(e.references?.environment, "environment"), u = vo({ guide: d, model: e.model, shot: e.shot, prompt: e.prompt, character: l, environment: p, resolution: e.resolution, requireAudio: e.requireAudio }, e.taskUUID), { plan: m } = u;
    if (m.estimate.usd === null) throw new T("no-estimate", `No price estimate for ${m.modelName}; it cannot be checked against maxPrice.`);
    if (m.estimate.usd > e.maxPrice)
      throw new T("over-price", `Estimated $${m.estimate.usd.toFixed(2)} (${m.estimate.basis}) is over your cap of $${e.maxPrice.toFixed(2)}.`);
    if (n({ stage: "confirm", message: `estimated $${m.estimate.usd.toFixed(2)}` }), !await e.confirm({
      model: m.modelId,
      modelName: m.modelName,
      usd: m.estimate.usd,
      basis: m.estimate.basis,
      maxPrice: e.maxPrice,
      inputs: m.inputsSent,
      prompt: u.request.prompt
    })) throw new T("not-confirmed", "Not confirmed; nothing was sent.");
    if (e.signal?.aborted) throw new T("aborted", "Stopped. Nothing was submitted.");
    const v = await r.run(m, {
      signal: e.signal,
      onProgress: (C) => {
        (C.stage === "submit" || C.stage === "poll") && (a = String(m.task.taskUUID)), n(C);
      }
    }), b = Co(e.laneId ?? "lane-1", m, u.request, v, v.videoURL);
    u.marker && (b.composed = u.marker, b.shot = u.shot);
    const h = (/* @__PURE__ */ new Date()).toISOString(), g = {
      schemaVersion: 1,
      id: `gen-${v.taskUUID.slice(0, 8).toLowerCase()}`,
      title: `${m.modelName}: ${(u.shot.subject || u.request.prompt).slice(0, 80)}`,
      createdAt: h,
      guide: d.guide,
      lanes: [b],
      ...u.marker ? { shot: u.shot } : {}
    }, y = {
      date: h.slice(0, 10),
      model: m.modelId,
      modelRan: v.modelRan,
      taskUUID: v.taskUUID,
      duration: String(u.request.duration ?? "audio length"),
      resolution: jo(m.task),
      inputs: m.inputsSent.map((C) => C.role).join("+"),
      estimateUsd: m.estimate.usd,
      costUsd: v.costUsd,
      seconds: v.generationSeconds,
      output: v.videoURL,
      status: "ok (browser)"
    }, j = [...u.notes];
    return v.costUsd !== null && v.costUsd > e.maxPrice && j.push(`Reported cost $${v.costUsd} is over the cap of $${e.maxPrice}.`), n({ stage: "done", message: "done" }), {
      videoURL: v.videoURL,
      costUsd: v.costUsd,
      generationSeconds: v.generationSeconds,
      taskUUID: v.taskUUID,
      modelRan: v.modelRan,
      estimate: m.estimate,
      inputsSent: m.inputsSent,
      lane: b,
      record: g,
      costRow: y,
      costRowText: To(y),
      notes: j,
      task: v.task
    };
  } catch (c) {
    throw os(c, e.signal, a, s);
  }
}
function i(e, t = {}, ...o) {
  const r = document.createElement(e);
  for (const [s, n] of Object.entries(t)) r.setAttribute(s, n);
  for (const s of o) s != null && r.append(s);
  return r;
}
function K(e, t) {
  try {
    const o = new URL(e, t);
    return o.protocol === "https:" || o.protocol === "http:" || o.protocol === "blob:" ? o.href : o.protocol === "data:" && /^data:(image|video|audio)\//.test(e) ? e : null;
  } catch {
    return null;
  }
}
const ss = {
  A: "A · raw frame 0",
  B: "B · restyled still",
  C: "C · none"
}, ns = {
  referenceVideo: "reference video",
  referenceImage: "reference image",
  referenceAudio: "reference audio",
  frameImage: "frame image",
  audio: "audio",
  video: "video"
}, W = (e) => e === null ? "not recorded" : `$${e.toFixed(e < 1 ? 3 : 2)}`, Oe = (e) => e == null ? "not recorded" : `${e.toFixed(1)} s`;
function as(e, t) {
  const o = K(e.src, t), r = e.role === "referenceImage" || e.role === "frameImage", s = e.role === "referenceVideo" || e.role === "video";
  let n;
  if (o && r) n = i("img", { src: o, alt: e.label ?? e.role, loading: "lazy" });
  else if (o && s) {
    const c = i("video", { src: o, muted: "", playsinline: "", preload: "metadata", "aria-label": e.label ?? e.role });
    c.muted = !0, n = c;
  } else n = i("div", { class: "ph" }, e.role.includes("udio") ? "audio" : "media");
  const a = `${ns[e.role]}${e.frame !== void 0 ? ` @ ${e.frame}` : ""}`;
  return i("div", { class: "input", title: e.label ?? e.src }, n, i("span", {}, a));
}
function is(e) {
  const t = i("button", { class: "small", type: "button" }, "Copy prompt");
  return t.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(e), t.textContent = "Copied";
    } catch {
      t.textContent = "Select and copy";
    }
    setTimeout(() => t.textContent = "Copy prompt", 1500);
  }), t;
}
function ds(e, t, o) {
  const r = i("button", { class: "small", type: "button", "aria-pressed": "false" }, "Play alone");
  r.addEventListener("click", o);
  const n = [
    ["Model ran", e.modelRan ?? (e.status === "placeholder" ? "nothing ran (placeholder)" : "not reported by the provider")],
    ["First frame", ss[e.firstFrameVariant]],
    ["Cost", W(e.costUsd)],
    ["Seconds", Oe(e.generationSeconds)]
  ];
  e.durationSeconds !== void 0 && n.push(["Clip length", e.durationSeconds === "auto" ? "auto" : `${e.durationSeconds} s asked`]), e.routing && n.push([
    "Routing",
    [e.routing.maxPrice !== void 0 ? `cap $${e.routing.maxPrice}` : "", e.routing.requirements ?? ""].filter(Boolean).join(" · ")
  ]);
  const a = i("dl");
  for (const [l, p] of n) a.append(i("dt", {}, l), i("dd", {}, p));
  const c = e.inputsSent.length ? i("div", { class: "inputs" }, ...e.inputsSent.map((l) => as(l, t))) : i("div", { class: "note" }, "Inputs sent: prompt only");
  return { node: i(
    "div",
    { class: "caption" },
    i(
      "div",
      { class: "row" },
      i("span", { class: "model" }, e.label ?? e.modelName ?? e.model),
      i("span", { class: "id" }, `${e.provider} · ${e.model}`)
    ),
    e.prompt ? i("div", { class: "prompt" }, i("pre", {}, e.prompt), i("div", { class: "row" }, is(e.prompt), r)) : i("div", { class: "row" }, r),
    i("div", {}, i("div", { class: "id" }, "Inputs sent"), c),
    a,
    e.note ? i("div", { class: "note" }, e.note) : null
  ), solo: r };
}
const Ve = "model-arena:runware-key";
class cs {
  constructor(t = ls()) {
    this.storage = t;
    try {
      this.key = this.storage?.getItem(Ve) ?? void 0;
    } catch {
      this.key = void 0;
    }
  }
  storage;
  key;
  get = () => this.key;
  set(t, o = "memory") {
    this.key = t.trim() || void 0;
    try {
      o === "session" && this.key ? this.storage?.setItem(Ve, this.key) : this.storage?.removeItem(Ve);
    } catch {
    }
  }
  clear() {
    this.key = void 0;
    try {
      this.storage?.removeItem(Ve);
    } catch {
    }
  }
}
function ls() {
  try {
    return typeof sessionStorage > "u" ? void 0 : sessionStorage;
  } catch {
    return;
  }
}
const us = `
  --ma-bg: #18181b; --ma-card: #1f1f23; --ma-fg: #f4f4f5; --ma-muted: #a1a1aa;
  --ma-line: #3f3f46; --ma-input: #27272a; --ma-chip: #2e2e33;
  --ma-accent: #e4e4e7; --ma-accent-fg: #18181b; --ma-warn: #fbbf24; --ma-ok: #86efac;`, Mt = `
  --ma-bg: #ffffff; --ma-card: #f7f7f8; --ma-fg: #18181b; --ma-muted: #52525b;
  --ma-line: #d4d4d8; --ma-input: #efeff1; --ma-chip: #e7e7ea;
  --ma-accent: #27272a; --ma-accent-fg: #ffffff; --ma-warn: #9a5800; --ma-ok: #166534;`, ms = `
  --ma-radius: 7px; --ma-radius-lg: 12px; --ma-gap: 8px;
  --ma-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --ma-mono: ui-monospace, SFMono-Regular, Menlo, monospace;`, _e = (
  /* css */
  `
:host {${us}${ms} }
:host([theme="light"]) {${Mt} }
@media (prefers-color-scheme: light) { :host([theme="auto"]) {${Mt} } }
`
), ps = [
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
], fs = /^[\x21-\x7e]{16,512}$/, Nt = "https://runware.ai/";
function Dt(e) {
  return e ? /\s/.test(e) ? "A key has no spaces or line breaks." : e.length < 16 ? "That is too short for an API key." : e.length > 512 ? "That is too long for an API key." : fs.test(e) ? null : "A key uses plain printable characters only." : "Paste your key first.";
}
const Ot = (
  /* css */
  `
${_e}
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
.state::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: var(--ma-ok); }
a { color: var(--ma-fg); }
`
);
class hs extends HTMLElement {
  static observedAttributes = ["signup-url"];
  store;
  root;
  remembered = !1;
  constructor() {
    super(), this.root = this.attachShadow({ mode: "open" }), this.store = new cs();
    const t = this.store.get();
    t && Dt(t) && this.store.clear(), this.remembered = !!this.store.get();
  }
  connectedCallback() {
    this.render();
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
  connect(t, o = !1) {
    const r = t.trim(), s = Dt(r);
    return s || (this.store.set(r, o ? "session" : "memory"), this.remembered = o, this.changed(), null);
  }
  changed() {
    this.render(), this.dispatchEvent(new CustomEvent("arena-key-change", { bubbles: !0, composed: !0, detail: { connected: this.connected, remembered: this.remembered } }));
  }
  signup() {
    let t = Nt;
    try {
      const o = new URL(this.getAttribute("signup-url") ?? Nt);
      o.protocol === "https:" && (t = o.href);
    } catch {
    }
    return i("a", { href: t, target: "_blank", rel: "noopener noreferrer" }, "Get a key");
  }
  render() {
    const t = i("p", { class: "note" }, "Your key stays in your browser and is sent only to api.runware.ai.");
    if (this.connected) {
      const c = i("button", { type: "button", "data-action": "disconnect" }, "Disconnect");
      c.addEventListener("click", () => this.disconnect()), this.root.replaceChildren(
        i("style", {}, Ot),
        i(
          "div",
          { class: "panel", part: "panel", "data-state": "connected" },
          i("div", { class: "row" }, i("span", { class: "state" }, "Key connected"), i("span", { class: "note" }, this.remembered ? "remembered for this tab" : "held in memory until you leave"), c),
          t
        )
      );
      return;
    }
    const o = i("input", {
      type: "password",
      autocomplete: "off",
      spellcheck: "false",
      autocapitalize: "off",
      maxlength: "512",
      "aria-describedby": "where",
      "data-field": "key"
    }), r = i("input", { type: "checkbox", "data-field": "remember" }), s = i("p", { class: "err", role: "alert" }), n = i("button", { type: "submit", class: "primary", "data-action": "connect" }, "Connect"), a = i(
      "form",
      { class: "panel", part: "panel", "data-state": "disconnected" },
      i("div", { class: "row" }, i("label", { class: "field" }, i("span", { class: "lbl" }, "Runware API key"), o), n),
      i("div", { class: "row" }, i("label", { class: "note" }, r, " Remember for this tab"), this.signup()),
      s,
      t
    );
    t.id = "where", o.addEventListener("input", () => s.textContent = ""), a.addEventListener("submit", (c) => {
      c.preventDefault();
      const d = this.connect(o.value, r.checked);
      d ? s.textContent = d : o.value = "";
    }), this.root.replaceChildren(i("style", {}, Ot), a);
  }
}
function yo(e = "arena-key") {
  customElements.get(e) || customElements.define(e, hs);
}
const at = [
  ["subject", "Subject", "Who or what moves"],
  ["environment", "Environment", "Where it happens"],
  ["action", "Action", "What it does along the path"],
  ["legend", "Colour legend", "e.g. The orange figure is the character"]
], gs = ["image/png", "image/jpeg", "image/webp"];
function _t(e, t) {
  const o = i("input", { type: "file", accept: gs.join(","), "data-field": e }), r = i("span", { class: "row", "data-ref": e }), n = i("div", { class: "drop", "data-drop": e }, i("span", { class: "note" }, `${e === "character" ? "Character sheet (optional)" : "Environment image (optional)"}: drop an image or`), o, r);
  return n.addEventListener("dragover", (a) => (a.preventDefault(), n.classList.add("over"))), n.addEventListener("dragleave", () => n.classList.remove("over")), n.addEventListener("drop", (a) => {
    a.preventDefault(), n.classList.remove("over"), t(a.dataTransfer?.files[0]);
  }), o.addEventListener("change", () => t(o.files?.[0])), { node: n, input: o, shown: r };
}
function bs(e) {
  const t = bo(), o = t.some((b) => b.key === e("model")) ? e("model") : t[0].key, r = t.map((b) => {
    const h = i("input", { type: "radio", name: "model", value: b.key, "data-model": b.key });
    return h.checked = b.key === o, { m: b, r: h };
  }), s = i(
    "fieldset",
    {},
    i("legend", {}, "Model"),
    i(
      "div",
      { class: "models" },
      ...r.map(
        ({ m: b, r: h }) => i(
          "label",
          { class: "model-opt" },
          h,
          i("span", {}, b.name, b.use === "audio-first-frame" ? i("span", { class: "badge" }, "audio + first frame only") : null),
          i("span", { class: "line" }, b.line)
        )
      )
    )
  ), n = {}, a = i("div", { class: "fields" });
  for (const [b, h, g] of at)
    n[b] = i("input", { type: "text", maxlength: b === "legend" ? "300" : "500", placeholder: g, "data-field": b, value: e(b) ?? "" }), a.append(i("label", { class: "f" }, h, n[b]));
  const c = i("textarea", { maxlength: "5000", "data-field": "prompt", placeholder: "Leave empty to use the composed prompt" });
  c.value = e("prompt") ?? "";
  const d = i("details", {}, i("summary", {}, "Write my own prompt instead"), c);
  d.open = !!c.value;
  const l = i("fieldset", {}, i("legend", {}, "Shot description"), a, d), p = i("input", { type: "file", multiple: "", accept: ".json,.mp4,.wav,.mp3,.png,.jpg", "data-field": "bundle" }), u = i("p", { class: "note", "data-guide": "" }, "No guide yet: choose the bundle's files."), m = i("input", { type: "number", min: "0.1", max: "100", step: "0.1", value: e("max-price") ?? "2", "data-field": "max-price" }), f = i("button", { type: "button", class: "primary", "data-action": "run" }, "Run"), v = i("button", { type: "button", "data-action": "stop" }, "Stop");
  return v.hidden = !0, {
    radios: r,
    model: () => r.find(({ r: b }) => b.checked)?.m.key ?? o,
    setModel: (b) => r.forEach(({ m: h, r: g }) => g.checked = h.key === b),
    modelSet: s,
    fields: n,
    override: c,
    own: d,
    shotSet: l,
    bundleInput: p,
    guideInfo: u,
    maxPrice: m,
    run: f,
    stop: v,
    preview: i("div", { "data-preview": "" }),
    estimate: i("p", { class: "note", "data-estimate": "" }),
    confirmSlot: i("div"),
    status: i("p", { class: "status", role: "status" }),
    error: i("p", { class: "err", role: "alert" }),
    result: i("div", { "data-result": "" })
  };
}
const vs = /^[A-Za-z0-9._-]{1,255}$/, Bt = (e) => typeof e == "object" && e !== null && !Array.isArray(e), zt = (e) => typeof e == "string" && e.length > 0 && e.length <= 2048 && !/^(javascript|data):/i.test(e.trim());
function ws(e) {
  if (!Bt(e)) throw new Error("preset must be an object");
  if (!zt(e.bundle)) throw new Error("preset.bundle must be a bundle directory URL");
  const t = { bundle: e.bundle };
  if (e.references !== void 0) {
    if (!Bt(e.references)) throw new Error("preset.references must be an object");
    t.references = {};
    for (const o of ["character", "environment"]) {
      const r = e.references[o];
      if (r !== void 0) {
        if (!zt(r)) throw new Error(`preset.references.${o} must be an image URL`);
        t.references[o] = r;
      }
    }
  }
  if (e.shot !== void 0) {
    const o = no(e.shot);
    if (!o) throw new Error("preset.shot needs a subject (and an action)");
    t.shot = o;
  }
  if (e.model !== void 0) {
    if (!me.includes(e.model)) throw new Error(`preset.model must be one of ${me.join(", ")}`);
    t.model = e.model;
  }
  if (e.prompt !== void 0) {
    if (typeof e.prompt != "string" || e.prompt.length > 5e3) throw new Error("preset.prompt must be text up to 5000 characters");
    t.prompt = e.prompt;
  }
  return t;
}
async function it(e) {
  const t = await fetch(e);
  if (!t.ok) throw new Error(`${new URL(e).pathname.split("/").pop()}: HTTP ${t.status}`);
  return t.blob();
}
async function Gt(e) {
  const t = e.endsWith("/") ? e : `${e}/`, o = JSON.parse(await (await it(new URL("bundle.json", t).href)).text()), r = { "bundle.json": new Blob([JSON.stringify(o)], { type: "application/json" }) }, s = /* @__PURE__ */ new Set([o.recipe, o.camera, o.firstFrameStyled]);
  for (const n of ["video", "audio", "firstFrame", "beats", "recipe", "meta", "camera"]) {
    const a = o[n];
    if (!(typeof a != "string" || !vs.test(a)))
      try {
        r[a] = await it(new URL(a, t).href);
      } catch (c) {
        if (!s.has(a)) throw c;
      }
  }
  return { files: r, dir: t };
}
async function ys(e) {
  return { blob: await it(e), src: e, name: new URL(e).pathname.split("/").pop() || "reference.png" };
}
function xs(e, t) {
  if (!e.guide) return null;
  const o = e.lanes.find((d) => d.shot || d.composed) ?? e.lanes[0];
  if (!o) return null;
  const r = je.find((d) => d.air === o.model || d.id === o.model || d.id === o.composed?.model), s = r && me.includes(r.id) ? r.id : void 0;
  if (!s) return null;
  const n = new URL(e.guide.video.src, t), a = { bundle: new URL(".", n).href, model: s }, c = o.shot ?? e.shot;
  if (c) {
    a.shot = { subject: c.subject, action: c.action, ...c.environment ? { environment: c.environment } : {}, ...c.legend ? { legend: c.legend } : {}, camera: c.camera };
    const d = o.inputsSent.filter((p) => p.role === "referenceImage" || p.role === "frameImage"), l = c.references.filter((p) => p.kind === "image").map((p) => p.id);
    d.forEach((p, u) => {
      const m = l[u];
      (m === "character" || m === "environment") && (a.references = { ...a.references, [m]: new URL(p.src, t).href });
    });
  }
  return o.composed || (a.prompt = o.prompt), a;
}
const ks = {
  guide: "the guide clip",
  audio: "the guide's audio",
  character: "your character sheet",
  environment: "your environment image",
  frame0: "the guide's frame 0"
};
function $s(e) {
  const t = e.composed.used.filter((o) => o.address).map((o) => `${o.address} = ${ks[o.ref] ?? o.ref}`);
  return t.length ? `Reference tags: ${t.join(", ")}` : "Reference tags: none; this model is not addressed by tags.";
}
function Kt(e, t = !1) {
  const o = e.composed.dropped.map((s) => `${s.ref}: ${s.reason}`), r = [...e.notes, ...o];
  return i(
    "div",
    { class: t ? "prompt-card compact" : "prompt-card", "data-model": e.model.key },
    i("div", { class: "row spread" }, i("strong", {}, e.model.name), i("a", { href: e.model.guide.url, target: "_blank", rel: "noopener noreferrer" }, /^prompting$/i.test(e.model.guide.title) ? "Prompting guide" : `Prompting guide: ${e.model.guide.title}`)),
    t ? null : i("p", { class: "line" }, e.model.line),
    i("pre", { "data-prompt": e.model.key }, e.composed.prompt),
    i("p", { class: "tags" }, $s(e)),
    r.length ? i("ul", { class: "notes" }, ...r.map((s) => i("li", {}, s))) : null
  );
}
function Ss(e) {
  if (e.override.trim())
    return i(
      "div",
      { class: "preview" },
      i("p", { class: "note" }, "Your own prompt replaces the composed one; the model gets exactly this text."),
      i("pre", { "data-prompt": e.model }, e.override.trim())
    );
  if (!e.shot || !e.shot.subject.trim()) return i("div", { class: "preview" }, i("p", { class: "note" }, "Describe the subject to see the prompt each model gets."));
  let t;
  try {
    t = Kt(De(e.shot, e.model, e.facts));
  } catch (r) {
    t = i("p", { class: "err" }, r.message);
  }
  const o = i(
    "details",
    { class: "compare" },
    i("summary", {}, "Compare prompts"),
    i("div", { class: "compare-grid" }, ...Gr(e.shot, e.facts).map((r) => Kt(r, !0)))
  );
  return i("div", { class: "preview" }, t, o);
}
const Is = 0.025;
class Wt {
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
    this.maxDrift = t.maxDrift ?? 1 / 48, this.publishEvery = t.publishEvery ?? 100, this.raf = t.raf ?? ((o) => requestAnimationFrame(o)), this.caf = t.caf ?? ((o) => cancelAnimationFrame(o));
  }
  subscribe(t) {
    return this.listeners.add(t), t(this.state), () => this.listeners.delete(t);
  }
  set(t) {
    this.state = { ...this.state, ...t }, this.listeners.forEach((o) => o(this.state));
  }
  add(t, o) {
    this.media.set(t, o), this.loaded();
  }
  remove(t) {
    this.media.get(t)?.pause(), this.media.delete(t), this.loaded();
  }
  /** Call on `loadedmetadata`: the shared length is the shortest clip. */
  loaded() {
    const t = [...this.media.values()].map((o) => o.duration).filter((o) => Number.isFinite(o) && o > 0);
    this.set({ duration: t.length ? Math.min(...t) : 0 });
  }
  pause() {
    this.generation++, this.stopLoop(), this.media.forEach((t) => t.pause()), this.set({ playing: !1, soloing: void 0 });
  }
  seek(t) {
    this.pause();
    const o = Math.max(0, Math.min(t, this.state.duration || t));
    this.media.forEach((r) => {
      r.readyState >= 1 && (r.currentTime = Math.min(o, r.duration));
    }), this.set({ time: o });
  }
  async play() {
    if (this.state.playing) return this.pause();
    this.state.soloing && this.pause();
    const t = ++this.generation;
    this.set({ error: "" });
    const o = [...this.media.values()];
    if (!o.length || o.some((a) => a.readyState < 2 || a.error)) {
      this.set({ error: "Wait for every video to load, or replace the unavailable clip." });
      return;
    }
    const { time: r, duration: s } = this.state, n = r >= s - 0.04 ? 0 : r;
    o.forEach((a) => a.currentTime = n);
    try {
      if (await Promise.all(o.map((a) => a.play())), t !== this.generation) return void o.forEach((a) => a.pause());
      this.set({ playing: !0 }), this.startLoop();
    } catch {
      if (t !== this.generation) return;
      this.pause(), this.set({ error: "Playback was interrupted. Press Play to try again." });
    }
  }
  async solo(t) {
    const o = this.media.get(t);
    if (!o) return;
    if (this.state.soloing === t) return this.pause();
    this.pause();
    const r = this.generation;
    if (this.set({ error: "" }), o.readyState < 2 || o.error) {
      this.set({ error: "Wait for this video to load, or replace the clip." });
      return;
    }
    (o.ended || o.currentTime >= o.duration - 0.04) && (o.currentTime = 0);
    try {
      if (await o.play(), r !== this.generation) return o.pause();
      this.set({ soloing: t }), o.addEventListener("pause", () => this.state.soloing === t && this.set({ soloing: void 0 }), {
        once: !0
      }), this.startSoloLoop(t, o);
    } catch {
      r === this.generation && this.set({ error: "Playback was interrupted. Press Play to try again." });
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
    const o = [...this.media.values()], r = o[0], { duration: s } = this.state;
    if (!r || r.ended || r.currentTime >= s - Is)
      return o.forEach((n) => n.pause()), this.stopLoop(), this.set({ playing: !1, time: s }), !1;
    for (const n of o.slice(1))
      Math.abs(n.currentTime - r.currentTime) > this.maxDrift && (n.currentTime = r.currentTime);
    return t - this.published >= this.publishEvery && (this.published = t, this.set({ time: r.currentTime })), !0;
  }
  published = -1 / 0;
  startLoop() {
    this.stopLoop(), this.published = -1 / 0;
    const t = (o) => {
      this.tick(o) && (this.frame = this.raf(t));
    };
    this.frame = this.raf(t);
  }
  startSoloLoop(t, o) {
    this.stopLoop();
    const r = () => {
      this.state.soloing === t && (this.set({ time: o.currentTime }), this.frame = this.raf(r));
    };
    this.frame = this.raf(r);
  }
}
const Ht = /^[a-z0-9][a-z0-9-]{0,63}$/, dt = (e) => typeof e == "object" && e !== null && !Array.isArray(e), Es = (e) => dt(e) && Array.isArray(e.tabs);
function As(e) {
  if (!dt(e)) throw new w("set", "must be an object");
  if (e.schemaVersion !== 1) throw new w("schemaVersion", "must be 1");
  if (typeof e.id != "string" || !Ht.test(e.id)) throw new w("id", "must be a slug");
  if (typeof e.title != "string" || e.title.length < 1 || e.title.length > 200) throw new w("title", "must be 1-200 characters");
  if (!Array.isArray(e.tabs) || e.tabs.length < 1 || e.tabs.length > 8) throw new w("tabs", "must hold 1-8 tabs");
  const t = /* @__PURE__ */ new Set();
  return e.tabs.forEach((o, r) => {
    const s = `tabs[${r}]`;
    if (!dt(o)) throw new w(s, "must be an object");
    if (typeof o.id != "string" || !Ht.test(o.id)) throw new w(`${s}.id`, "must be a slug");
    if (t.has(o.id)) throw new w(`${s}.id`, "tab ids must be distinct");
    if (t.add(o.id), typeof o.label != "string" || o.label.length < 1 || o.label.length > 40) throw new w(`${s}.label`, "must be 1-40 characters");
    if (o.record !== void 0) ce(o.record);
    else if (typeof o.src != "string" || o.src.length < 1 || o.src.length > 2048) throw new w(`${s}.src`, "must be a record URL, or give an inline record");
  }), e;
}
const Ps = (
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
), Xt = (
  /* css */
  `
${_e}
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
${Ps}
`
);
function Ee(e) {
  return je.find((t) => t.air === e.model || t.id === e.model);
}
function xo(e) {
  const o = e.settings?.settings?.cameraMovement;
  return typeof o == "string" ? o : void 0;
}
const Jt = [
  { id: "parameter", title: "Camera parameter", text: "The move is a request field the model reads directly." },
  { id: "guide-video", title: "Guide video", text: "A reference video carries the move; the prompt names it." },
  { id: "prompt", title: "Prompt words", text: "The move is written into the prompt and nothing else." }
];
function Vs(e) {
  return xo(e) ? "parameter" : e.inputsSent.some((t) => t.role === "referenceVideo") ? "guide-video" : "prompt";
}
function Rs(e, t = Ee(e)) {
  const o = (f) => e.inputsSent.find((v) => v.role === f), r = e.inputsSent.find((f) => f.role === "frameImage" && (f.frame === void 0 || f.frame === "first" || f.frame === 0)), s = e.firstFrameVariant !== "C" ? o("referenceImage") : void 0, n = o("referenceVideo"), a = o("referenceAudio") ?? o("audio"), c = xo(e), d = (f) => f === !1 ? "cannot" : "not-sent", l = r ? { key: "firstFrame", label: "First frame", state: "sent", detail: "as the first frame" } : s ? { key: "firstFrame", label: "First frame", state: "sent", detail: "as a reference image" } : { key: "firstFrame", label: "First frame", state: d(t?.inputs.firstFrame.supported), detail: t?.inputs.firstFrame.supported === !1 ? "cannot take it" : "not sent" }, p = t ? t.inputs.referenceVideos.supported : void 0, u = t ? t.inputs.referenceAudios.supported || t.inputs.audioToVideo.supported : void 0, m = t ? t.camera.kind === "parameter" : void 0;
  return [
    l,
    n ? { key: "guideVideo", label: "Guide video", state: "sent", detail: "as a reference video" } : { key: "guideVideo", label: "Guide video", state: d(p), detail: p === !1 ? "cannot take it" : "not sent" },
    a ? { key: "audio", label: "Audio", state: "sent", detail: a.role === "audio" ? "drives the clip" : "as reference audio" } : { key: "audio", label: "Audio", state: d(u), detail: u === !1 ? "cannot take it" : "not sent" },
    c ? { key: "cameraParam", label: "Camera parameter", state: "sent", detail: c } : { key: "cameraParam", label: "Camera parameter", state: d(m), detail: m === !1 ? "none on this model" : "not sent" },
    e.prompt ? { key: "prompt", label: "Prompt text", state: "sent", detail: c ? "no camera words" : "carries the move" } : { key: "prompt", label: "Prompt text", state: "not-sent", detail: "no prompt" }
  ];
}
function ko(e, t = Ee(e)) {
  if (!t || typeof e.durationSeconds != "number") return null;
  const o = e.inputsSent.some((d) => d.role === "referenceVideo" || d.role === "video"), r = t.pricing.rates.filter((d) => !d.mode.startsWith("draft")), s = r.filter((d) => d.mode === "any" || d.mode === (o ? "video-input" : "no-video-input")), n = s.length ? s : r;
  if (!n.length) return null;
  const a = Math.round(Math.min(...n.map((d) => d.usdPerSecond)) * e.durationSeconds * 1e3) / 1e3, c = o ? t.pricing.surcharges.find((d) => d.per === "input-video-second") : void 0;
  return c ? { usd: a, excludes: `${c.label} at $${c.usd}/s` } : { usd: a };
}
const qt = (e) => {
  const t = Math.floor(e / 60), o = e - t * 60;
  return `${t}:${o.toFixed(1).padStart(4, "0")}`;
};
function Be(e, t = "Play all") {
  const o = i("button", { class: "primary", type: "button" }, t);
  o.addEventListener("click", () => {
    e().play();
  });
  const r = i("input", { type: "range", min: "0", max: "0", step: String(1 / 24), value: "0", "aria-label": "Playhead" });
  let s = !1;
  r.addEventListener("input", () => {
    s = !0, e().seek(Number(r.value));
  }), r.addEventListener("change", () => s = !1);
  const n = i("span", { class: "time" }, "0:00.0 / 0:00.0");
  return {
    node: i("div", { class: "transport" }, o, r, n),
    update(a) {
      o.textContent = a.playing ? "Pause" : t, r.max = String(a.duration || 0), s || (r.value = String(a.time)), n.textContent = `${qt(a.time)} / ${qt(a.duration)}`;
    }
  };
}
function pe(e, t, o, r) {
  const s = i("div", { class: "screen" });
  let n;
  e ? (n = i("video", { src: e, muted: "", playsinline: "", preload: "auto", "aria-label": t }), n.muted = !0, n.addEventListener("error", () => o(`${t}: the clip did not load.`)), s.append(n)) : s.append(i("div", { class: "badge" }, "No output")), r && s.append(i("div", { class: "badge" }, r));
  const a = i("span");
  return s.append(i("div", { class: "playhead" }, a)), { node: s, video: n, bar: a };
}
const ze = (e) => e.duration ? `${Math.min(100, e.time / e.duration * 100)}%` : "0%", $o = {
  2: [["2-side", "Side by side"], ["2-stack", "Stacked"]],
  3: [["3-row", "Row of 3"], ["3-hero", "1 big + 2"]],
  4: [["4-grid", "2 × 2"], ["4-row", "Row of 4"]],
  5: [["5-3-2", "3 + 2"], ["5-hero", "1 big + 4"]]
};
function ht(e) {
  if (e.costUsd !== null) return `${W(e.costUsd)} per clip`;
  const t = ko(e, Ee(e));
  return t ? `List price from ${W(t.usd)} per clip${t.excludes ? ` plus ${t.excludes}` : ""} (not run)` : "Cost not recorded";
}
function Ts(e) {
  const t = e.costUsd === null ? ko(e, Ee(e)) : null, o = e.costUsd !== null ? W(e.costUsd) : t ? `from ${W(t.usd)}` : "$ —", r = e.generationSeconds !== null ? Oe(e.generationSeconds) : "— s";
  return `${o} · ${r}`;
}
function gt(e) {
  const t = typeof e.durationSeconds == "number" ? `${e.durationSeconds} s clip` : null, o = e.generationSeconds !== null ? `${Oe(e.generationSeconds)} to generate` : "generation time not recorded";
  return [t, o].filter(Boolean).join(" · ");
}
function So(e, t) {
  const o = e.lanes.map((l) => l.id), r = Math.max(1, Math.min(5, o.length)), s = Math.min(r, Math.max(Math.min(2, r), t?.count ?? Math.min(3, r))), n = $o[s] ?? [["single", "Single"]], a = n.some(([l]) => l === t?.layout) ? t.layout : n[0][0], c = [], d = (t?.picks ?? []).filter((l) => o.includes(l));
  for (let l = 0; l < s; l++) c.push(d[l] ?? o.find((p) => !c.includes(p) && !d.includes(p)) ?? o[l % o.length]);
  return { count: s, layout: a, picks: c };
}
function Yt(e, t, o, r) {
  const s = i("div", { class: "seg", role: "group", "aria-label": e });
  for (const [n, a] of t) {
    const c = i("button", { type: "button", "aria-pressed": String(n === o) }, a);
    c.addEventListener("click", () => r(n)), s.append(c);
  }
  return s;
}
function js(e, t, o) {
  const { record: r, base: s } = e, n = Be(e.clock), a = i("div", { class: "stage", "data-layout": t.layout }), c = [], d = /* @__PURE__ */ new Map(), l = new Map(r.lanes.map((f) => [f.id, f])), p = [2, 3, 4, 5].filter((f) => f <= r.lanes.length), u = p.length > 0 ? [
    Yt("How many models", p.map((f) => [String(f), `${f} models`]), String(t.count), (f) => o(So(r, { ...t, count: Number(f), layout: void 0 }))),
    Yt("Layout", $o[t.count] ?? [], t.layout, (f) => o({ ...t, layout: f }))
  ] : [];
  t.picks.forEach((f, v) => {
    const b = l.get(f), h = `tile-${v}`, g = b.label ?? b.modelName ?? b.model, y = b.output ? K(b.output.src, s) : null, j = pe(y, g, e.error, b.status === "placeholder" ? "Placeholder" : void 0);
    j.video && (j.video.addEventListener("loadedmetadata", () => e.clock().loaded()), e.clock().add(h, j.video)), c.push(j.bar);
    const C = i("select", { "aria-label": `Model for tile ${v + 1}` });
    for (const H of r.lanes) {
      const oe = i("option", { value: H.id }, H.label ?? H.modelName ?? H.model);
      oe.selected = H.id === f, C.append(oe);
    }
    C.addEventListener("change", () => o({ ...t, picks: t.picks.map((H, oe) => oe === v ? C.value : H) }));
    const Q = i("button", { class: "small solo", type: "button", "aria-pressed": "false" }, "Play alone");
    Q.addEventListener("click", () => {
      e.clock().solo(h);
    }), j.video || (Q.disabled = !0), d.set(h, Q);
    const be = i("span", { class: "meta", title: `${ht(b)} · ${gt(b)}` }, Ts(b));
    a.append(
      i(
        "figure",
        { class: `tile${r.preferredLane === b.id ? " preferred" : ""}`, "data-lane": b.id },
        j.node,
        i("figcaption", { class: "overlay" }, C, Q, be)
      )
    );
  });
  const m = r.observations?.length ? i("ul", { class: "note" }, ...r.observations.map((f) => i("li", {}, f))) : null;
  return {
    controls: u,
    nodes: [n.node, a, ...m ? [m] : []],
    update(f) {
      n.update(f);
      const v = ze(f);
      c.forEach((b) => b.style.width = v);
      for (const [b, h] of d)
        h.textContent = f.soloing === b ? "Stop" : "Play alone", h.setAttribute("aria-pressed", String(f.soloing === b));
    }
  };
}
const Cs = (e) => e.model === "guide" || e.provider === "none";
function Us(e) {
  const t = i("button", { class: "small", type: "button" }, "Copy prompt");
  return t.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(e()), t.textContent = "Copied";
    } catch {
      t.textContent = "Select and copy";
    }
    setTimeout(() => t.textContent = "Copy prompt", 1500);
  }), t;
}
function Ls(e, t) {
  const { record: o, base: r } = e, s = o.lanes.filter((k) => !Cs(k));
  let n = s.find((k) => k.id === t) ?? s[0];
  const a = Be(e.clock, "Play both"), c = o.guide ? K(o.guide.video.src, r) : null, d = pe(c, "Guide", e.error);
  d.video && (d.video.addEventListener("loadedmetadata", () => e.clock().loaded()), e.clock().add("guide-clip", d.video));
  const l = i(
    "figure",
    { class: "side" },
    d.node,
    i("figcaption", {}, i("span", { class: "model" }, "Guide"), i("span", { class: "id" }, o.guide ? o.guide.title ?? "The clip every model was given" : "No guide clip in this record"))
  ), p = i("div", { class: "side-screen" }), u = i("span", { class: "model" }), m = i("span", { class: "id" }), f = i("figure", { class: "side" }, p, i("figcaption", {}, u, m));
  let v = i("span");
  const b = i("div", { class: "switcher", role: "group", "aria-label": "Model" }), h = /* @__PURE__ */ new Map();
  for (const k of s) {
    const U = i("button", { type: "button", "aria-pressed": "false", "data-lane": k.id }, k.label ?? k.modelName ?? k.model);
    U.addEventListener("click", () => H(k)), h.set(k.id, U), b.append(U);
  }
  const g = i("ol", { class: "modes", "aria-label": "Three ways a model is steered" }), y = new Map(
    Jt.map((k) => {
      const U = i("li", { "data-mode": k.id }, i("strong", {}, k.title), i("span", {}, k.text));
      return g.append(U), [k.id, U];
    })
  ), j = i("ul", { class: "strip", "aria-label": "Inputs this model received" }), C = i("pre"), Q = i(
    "div",
    { class: "composed" },
    i("div", { class: "row spread" }, i("span", { class: "id" }, "Composed prompt"), Us(() => n?.prompt ?? "")),
    C
  ), be = i("p", { class: "note" });
  function H(k) {
    n = k;
    const U = e.clock(), Eo = U.state.time;
    U.pause(), U.remove("output");
    const Ao = k.output ? K(k.output.src, r) : null, Ge = k.label ?? k.modelName ?? k.model, ve = pe(Ao, Ge, e.error, k.status === "placeholder" ? "Placeholder clip" : void 0);
    ve.video && (ve.video.addEventListener("loadedmetadata", () => {
      U.loaded(), U.seek(Eo);
    }), U.add("output", ve.video)), p.replaceChildren(ve.node), v = ve.bar;
    const Ke = Vs(k), Po = Jt.find((M) => M.id === Ke).title;
    u.textContent = Ge, m.textContent = `Steered by: ${Po} · ${ht(k)} · ${gt(k)}`;
    for (const [M, we] of h) we.setAttribute("aria-pressed", String(M === k.id));
    for (const [M, we] of y)
      we.classList.toggle("on", M === Ke), M === Ke ? we.setAttribute("aria-current", "true") : we.removeAttribute("aria-current");
    const Vo = Ee(k);
    j.replaceChildren(
      ...Rs(k, Vo).map(
        (M) => i(
          "li",
          { class: `slot ${M.state}`, "data-slot": M.key, title: M.state === "cannot" ? `${Ge} cannot take this input` : M.detail },
          i("strong", {}, M.label),
          i("span", {}, M.detail)
        )
      )
    ), C.textContent = k.prompt || "(no prompt)", be.textContent = k.note ?? "", be.hidden = !k.note;
  }
  n && H(n);
  const oe = s.length ? null : i("p", { class: "note" }, "This record has no model lanes to compare with the guide.");
  return {
    nodes: [i("div", { class: "pair" }, l, f), a.node, b, g, j, Q, be, ...oe ? [oe] : []],
    update(k) {
      a.update(k);
      const U = ze(k);
      d.bar.style.width = U, v.style.width = U;
    }
  };
}
const Fs = (e) => e.model === "guide" || e.provider === "none", Ms = /* @__PURE__ */ new Set(["referenceImage", "frameImage"]), Ns = { character: "Character sheet", environment: "Environment", frame0: "Guide frame 0" };
function Ds(e) {
  const t = /* @__PURE__ */ new Map();
  for (const o of e) {
    const r = (o.shot?.references ?? []).filter((s) => s.kind === "image").map((s) => s.id);
    o.inputsSent.filter((s) => Ms.has(s.role)).forEach((s, n) => {
      t.has(s.src) || t.set(s.src, Ns[r[n] ?? ""] ?? s.label ?? "Reference image");
    });
  }
  return [...t].map(([o, r]) => ({ src: o, label: r }));
}
function Os(e) {
  const { record: t, base: o } = e, r = e.clock(), s = Be(e.clock, "Play all"), n = [], a = t.lanes.filter((g) => !Fs(g) && g.output).slice(0, 3), c = Ds(t.lanes), d = c.length ? i(
    "ul",
    { class: "ref-strip", "aria-label": "Reference images sent" },
    ...c.map((g) => {
      const y = K(g.src, o);
      return i("li", {}, y ? i("img", { src: y, alt: g.label, loading: "lazy" }) : i("div", { class: "ph" }, "image"), i("span", {}, g.label));
    })
  ) : null, l = i("div", { class: "inputs-row" });
  l.style.setProperty("--ma-columns", String(1 + Math.max(1, a.length)));
  const p = t.guide ? K(t.guide.video.src, o) : null, u = pe(p, "Guide", e.error);
  u.video && (u.video.addEventListener("loadedmetadata", () => r.loaded()), r.add("guide-clip", u.video)), n.push(u.bar), l.append(i("figure", { class: "side", "data-lane": "guide" }, u.node, i("figcaption", {}, i("span", { class: "model" }, "Guide"), i("span", { class: "id" }, t.guide?.title ?? "The clip every model was given"))));
  const m = t.guide?.audio ? K(t.guide.audio.src, o) : null;
  let f;
  m && (f = i("audio", { src: m, preload: "auto", "data-track": "guide-audio" }), f.addEventListener("loadedmetadata", () => r.loaded()), r.add("guide-audio", f));
  const v = [];
  for (const g of a) {
    const y = pe(K(g.output.src, o), g.label ?? g.modelName ?? g.model, e.error, g.status === "placeholder" ? "Placeholder clip" : void 0);
    y.video && (y.video.addEventListener("loadedmetadata", () => r.loaded()), r.add(g.id, y.video), v.push(y.video)), n.push(y.bar), l.append(
      i(
        "figure",
        { class: "side", "data-lane": g.id },
        y.node,
        i("figcaption", {}, i("span", { class: "model" }, g.label ?? g.modelName ?? g.model), i("span", { class: "id" }, `${ht(g)} · ${gt(g)}`)),
        i("details", { class: "lane-prompt" }, i("summary", {}, g.composed ? "Composed prompt" : "Prompt"), i("pre", {}, g.prompt || "(no prompt)"))
      )
    );
  }
  a.length || l.append(i("p", { class: "note" }, "This record has no outputs yet."));
  const b = i("button", { type: "button", class: "small", "aria-pressed": "false", "data-action": "clip-sound" }, "Clip sound: off"), h = (g) => {
    for (const y of v) y.muted = !g;
    f && (f.muted = g), b.setAttribute("aria-pressed", String(g)), b.textContent = `Clip sound: ${g ? "on" : "off"}`;
  };
  return b.addEventListener("click", () => h(b.getAttribute("aria-pressed") !== "true")), h(!1), {
    controls: [b],
    nodes: [...d ? [d] : [], l, s.node, ...f ? [f] : []],
    update(g) {
      s.update(g);
      const y = ze(g);
      n.forEach((j) => j.style.width = y);
    }
  };
}
function _s(e, t) {
  const { record: o, base: r } = e, s = Be(e.clock), n = [], a = /* @__PURE__ */ new Map(), c = i("div", { class: "lanes" });
  c.style.setProperty("--ma-columns", String(t === "three-up" ? Math.min(3, o.lanes.length) : 3));
  for (const l of o.lanes) {
    const p = l.output ? K(l.output.src, r) : null, u = pe(p, l.label ?? l.model, e.error, l.status === "placeholder" ? "Placeholder clip" : l.status === "pending" ? "Not run yet" : void 0);
    u.video && (u.video.addEventListener("loadedmetadata", () => e.clock().loaded()), e.clock().add(l.id, u.video)), n.push(u.bar);
    const { node: m, solo: f } = ds(l, r, () => {
      e.clock().solo(l.id);
    });
    u.video || (f.disabled = !0), a.set(l.id, f), c.append(i("article", { class: `lane${o.preferredLane === l.id ? " preferred" : ""}`, "data-lane": l.id }, u.node, m));
  }
  const d = o.observations?.length ? i("ul", { class: "note" }, ...o.observations.map((l) => i("li", {}, l))) : null;
  return {
    nodes: [s.node, c, ...d ? [d] : []],
    update(l) {
      s.update(l);
      const p = ze(l);
      n.forEach((u) => u.style.width = p);
      for (const [u, m] of a)
        m.textContent = l.soloing === u ? "Stop" : "Play alone", m.setAttribute("aria-pressed", String(l.soloing === u));
    }
  };
}
const et = () => typeof location > "u" ? "http://localhost/" : location.href;
class Bs extends HTMLElement {
  static observedAttributes = ["src", "layout", "tab"];
  root;
  clock = new Wt();
  unsubscribe;
  current;
  set;
  tabId;
  arenaState;
  base = et();
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
  attributeChangedCallback(t, o, r) {
    t === "src" && r && r !== o && this.fetchSource(r), t === "layout" && this.current && this.render(this.current), t === "tab" && r && this.set && r !== this.tabId && this.showTab(r);
  }
  get record() {
    return this.current;
  }
  set record(t) {
    this.setRecord(t);
  }
  /** Hands in a record or a record set; media and tab paths resolve against `baseUrl` (default: the page). */
  setRecord(t, o = et()) {
    const r = ++this.load, s = (n) => this.message(`This record cannot be shown: ${n.message}`);
    try {
      this.accept(t, o, r).catch(s);
    } catch (n) {
      s(n);
    }
  }
  /** Not async on purpose: a bad record throws synchronously, so the message shows at once. */
  accept(t, o, r) {
    if (Es(t))
      return this.set = { data: As(t), base: o, cache: /* @__PURE__ */ new Map() }, this.showTab(this.getAttribute("tab") ?? this.set.data.tabs[0].id, r);
    const s = ce(t);
    return this.set = void 0, this.tabId = void 0, this.base = o, this.render(s), Promise.resolve();
  }
  async fetchJson(t) {
    const o = await fetch(t);
    if (!o.ok) throw new Error(`HTTP ${o.status}`);
    return o.json();
  }
  async fetchSource(t) {
    const o = ++this.load;
    this.message("Loading…");
    try {
      const r = new URL(t, et()).href, s = await this.fetchJson(r);
      if (o !== this.load) return;
      await this.accept(s, r, o);
    } catch (r) {
      o === this.load && this.message(`Could not load ${t}: ${r.message}`);
    }
  }
  async showTab(t, o = ++this.load) {
    const r = this.set;
    if (!r) return;
    const s = r.data.tabs.find((n) => n.id === t) ?? r.data.tabs[0];
    this.tabId = s.id;
    try {
      let n = r.cache.get(s.id);
      if (!n) {
        if (s.record) n = { record: ce(s.record), base: r.base };
        else {
          const a = new URL(s.src, r.base).href;
          n = { record: ce(await this.fetchJson(a)), base: a };
        }
        r.cache.set(s.id, n);
      }
      if (o !== this.load) return;
      this.base = n.base, this.render(n.record);
    } catch (n) {
      o === this.load && this.message(`Could not load the "${s.label}" tab: ${n.message}`);
    }
  }
  message(t) {
    this.teardown();
    const o = this.tabs();
    this.root.replaceChildren(
      i("style", {}, Xt),
      ...o ? [i("div", { class: "head" }, i("div", { class: "controls" }, o))] : [],
      i("div", { class: "body" }, i("p", { class: "note" }, t))
    );
  }
  teardown() {
    this.unsubscribe?.(), this.clock.hide(), this.clock = new Wt();
  }
  tabs() {
    const t = this.set;
    if (!t || t.data.tabs.length < 2) return null;
    const o = i("div", { class: "seg tabs", role: "tablist", "aria-label": "Test" }), r = t.data.tabs.map((s) => s.id);
    for (const s of t.data.tabs) {
      const n = s.id === this.tabId, a = i("button", { type: "button", role: "tab", "aria-selected": String(n), tabindex: n ? "0" : "-1", "data-tab": s.id }, s.label);
      a.addEventListener("click", () => {
        this.showTab(s.id);
      }), a.addEventListener("keydown", (c) => {
        const d = c.key === "ArrowRight" ? 1 : c.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        c.preventDefault();
        const l = r[(r.indexOf(s.id) + d + r.length) % r.length];
        this.showTab(l).then(() => this.root.querySelector(`[data-tab="${l}"]`)?.focus());
      }), o.append(a);
    }
    return o;
  }
  render(t) {
    this.teardown(), this.current = t;
    const o = this.getAttribute("layout") ?? "three-up", r = i("div", { class: "error", role: "status" }), s = { record: t, base: this.base, clock: () => this.clock, error: (p) => r.textContent = p };
    let n;
    o === "arena" ? (this.arenaState = So(t, this.arenaState), n = js(s, this.arenaState, (p) => {
      this.arenaState = p, this.render(t);
    })) : o === "inputs" ? n = Os(s) : n = o === "guidance" ? Ls(s, this.getAttribute("model")) : _s(s, o);
    const a = this.tabs(), c = [...a ? [a] : [], ...n.controls ?? []], d = i(
      "div",
      { class: "head" },
      i("div", { class: "title" }, i("h2", {}, t.title), i("span", { class: "meta" }, `${t.lanes.length} lanes`)),
      c.length ? i("div", { class: "controls" }, ...c) : null
    ), l = t.shot ? i("p", { class: "intent" }, i("span", { class: "id" }, "One shot description, composed per model: "), Oo(t.shot)) : null;
    this.root.replaceChildren(i("style", {}, Xt), d, ...l ? [l] : [], r, i("div", { class: "body" }, ...n.nodes)), this.dataset.layout = o, this.unsubscribe = this.clock.subscribe((p) => {
      n.update(p), p.error && (r.textContent = p.error);
    });
  }
}
function bt(e = "model-arena") {
  customElements.get(e) || customElements.define(e, Bs);
}
const zs = {
  referenceVideo: "reference video",
  referenceImage: "reference image",
  referenceAudio: "reference audio",
  frameImage: "frame image",
  audio: "driving audio",
  video: "video"
};
function Gs(e, t) {
  const o = (n) => t.get(n.replace(/^\.\//, "")) ?? n, r = JSON.parse(JSON.stringify(e)), s = r.guide;
  if (s)
    for (const n of ["video", "audio", "firstFrame", "firstFrameStyled", "camera"]) s[n] && (s[n].src = o(s[n].src));
  for (const n of r.lanes) for (const a of n.inputsSent) a.src = o(a.src);
  return r;
}
function Ks(e) {
  return [
    `Inputs sent: ${e.inputsSent.map((o) => `${zs[o.role] ?? o.role} ${o.label ?? o.src}`).join(", ") || "prompt only"}`,
    `Cost: ${W(e.costUsd)}${e.costUsd === null ? "" : " reported"} (estimate ${W(e.estimate.usd)})`,
    `Seconds: ${Oe(e.generationSeconds)} to generate`,
    `Model ran: ${e.modelRan ?? "not reported by the provider"}`,
    // An input the model was not sent belongs in the caption itself, not only in the notes.
    ...e.notes.filter((o) => o.startsWith("Music not sent"))
  ].join(" · ");
}
function Ws(e) {
  const t = i("a", { class: "btn", download: `${e.id}.json`, "data-action": "record-json" }, "Download record JSON");
  try {
    t.href = URL.createObjectURL(new Blob([JSON.stringify(e, null, 2)], { type: "application/json" }));
  } catch {
    t.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(e))}`;
  }
  return t;
}
function Hs(e, t, o, r) {
  bt();
  const s = document.createElement("model-arena");
  s.setAttribute("layout", "guidance"), s.setRecord(Gs(e.record, t), o);
  const n = i("a", { class: "btn", href: K(e.videoURL, o) ?? "#", download: "", target: "_blank", rel: "noopener noreferrer", "data-action": "download" }, "Download"), a = i("button", { type: "button", "data-action": "add" }, "Add to gallery"), c = i("span");
  a.addEventListener("click", () => {
    r(e.record), a.textContent = "Added", a.disabled = !0, c.replaceChildren(Ws(e.record));
  });
  const d = i("details", { class: "cost-row" }, i("summary", {}, "Cost row for docs/costs.md"), i("pre", {}, e.costRowText.trim()));
  return i(
    "section",
    { class: "result", "aria-label": "Result" },
    s,
    i("p", { class: "caption", "data-caption": "" }, Ks(e)),
    e.notes.length ? i("ul", { class: "notes" }, ...e.notes.map((l) => i("li", {}, l))) : null,
    i("div", { class: "row" }, n, a, c),
    d
  );
}
const Xs = ps.map((e) => `${e}: inherit;`).join(" "), Io = (
  /* css */
  `
${_e}
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
model-arena, arena-key { ${Xs} }
`
), ae = () => typeof location > "u" ? "http://localhost/" : location.href;
class Js extends HTMLElement {
  static observedAttributes = ["guide-src", "preset"];
  /** A fake or wrapped fetch for the provider; the page's fetch otherwise. */
  fetch;
  pollOptions;
  /** Replaces the inline "spend up to" check. */
  confirm;
  root;
  urls = /* @__PURE__ */ new Map();
  base = ae();
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
    const t = this.getAttribute("preset"), o = this.getAttribute("guide-src");
    t && !this.loaded ? this.fetchPreset(t) : o && !this.loaded && this.loadFrom(o);
  }
  attributeChangedCallback(t, o, r) {
    !this.ui || !r || r === o || (t === "preset" ? this.fetchPreset(r) : this.loadFrom(r));
  }
  /** A bundle: FileList, File[] or name → Blob. */
  set guide(t) {
    this.pending = this.setGuide(t, ae());
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
  async loadPreset(t, o = ae()) {
    this.ui || this.build();
    const r = this.ui;
    try {
      const s = ws(t), n = (d) => new URL(d, o).href, { files: a, dir: c } = await Gt(n(s.bundle));
      await this.setGuide(a, c, !0);
      for (const d of ["character", "environment"]) {
        const l = s.references?.[d];
        await this.setRef(d, l ? await ys(n(l)) : void 0);
      }
      if (s.shot) for (const [d] of at) r.fields[d].value = s.shot[d] ?? "";
      s.model && r.setModel(s.model), r.override.value = s.prompt ?? "", r.own.open = !!r.override.value, this.refresh();
    } catch (s) {
      this.fail(`Could not load the preset: ${s.message}`);
    }
  }
  async fetchPreset(t) {
    try {
      const o = new URL(t, ae()).href, r = await fetch(o);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.pending = this.loadPreset(await r.json(), o), await this.pending;
    } catch (o) {
      this.fail(`Could not load the preset: ${o.message}`);
    }
  }
  async loadFrom(t) {
    try {
      const { files: o, dir: r } = await Gt(new URL(t, ae()).href);
      this.pending = this.setGuide(o, r, !0), await this.pending;
    } catch (o) {
      this.fail(`Could not load the guide bundle: ${o.message}`);
    }
  }
  keySource() {
    const t = this.getAttribute("key-panel"), o = t ? document.getElementById(t) : null;
    if (o && typeof o.getKey == "function") return o;
    const r = document.querySelector("arena-key");
    return r && typeof r.getKey == "function" ? r : this.ownKey;
  }
  shot() {
    const t = this.ui.fields, o = (r) => t[r].value.trim();
    return o("subject") ? { subject: o("subject"), action: o("action"), ...o("environment") ? { environment: o("environment") } : {}, ...o("legend") ? { legend: o("legend") } : {} } : null;
  }
  async setGuide(t, o, r = !1) {
    const s = this.ui ?? (this.build(), this.ui);
    try {
      const n = /* @__PURE__ */ new Map(), a = Array.isArray(t) || t.length !== void 0 ? Array.from(t) : null;
      if (a) for (const l of a) n.set(l.name.split(/[\\/]/).pop(), l);
      else for (const [l, p] of Object.entries(t)) n.set(l, p);
      const c = await ao(wo(t), r ? { base: o } : {});
      for (const [l, p] of this.urls) Object.values(this.refs).some((u) => u?.media.displaySrc === l) || URL.revokeObjectURL(p);
      this.urls = new Map([...n].filter(([l]) => !l.endsWith(".json")).map(([l, p]) => [l, URL.createObjectURL(p)]));
      for (const l of Object.values(this.refs)) l && this.urls.set(l.media.displaySrc ?? l.media.name, l.url);
      this.base = o, this.loaded = c;
      for (const [l] of at) {
        const p = c.shot?.[l];
        p && !s.fields[l].value && !this.getAttribute(l) && (s.fields[l].value = p);
      }
      const d = c.meta;
      s.guideInfo.textContent = `Guide: ${c.video.name} · ${d.width}×${d.height} · ${d.fps} fps · ${c.seconds} s${c.audio ? ` · audio ${c.audio.name}` : " · no audio"}`, s.error.textContent = "", this.refresh();
    } catch (n) {
      this.fail(n.message);
    }
  }
  async setRef(t, o) {
    this.ui || this.build();
    const r = this.slots[t], s = this.refs[t];
    if (s && URL.revokeObjectURL(s.url), delete this.refs[t], r.shown.replaceChildren(), o)
      try {
        const n = await st(o, t), a = o instanceof Blob ? o : o.blob, c = URL.createObjectURL(a);
        this.refs[t] = { input: o, media: n, url: c }, this.urls.set(n.displaySrc ?? n.name, c);
        const d = i("button", { type: "button", "data-action": `clear-${t}` }, "Remove");
        d.addEventListener("click", () => {
          this.setRef(t, void 0).then(() => this.refresh());
        }), r.shown.append(i("img", { src: c, alt: t === "character" ? "Character sheet" : "Environment" }), i("span", { class: "note" }, `${n.name}${n.info?.width ? ` · ${n.info.width}×${n.info.height}` : ""}`), d);
      } catch (n) {
        this.fail(n.message, "refused");
      }
    this.refresh();
  }
  fail(t, o = "bad-bundle") {
    this.ui && (this.ui.error.textContent = t), this.dispatchEvent(new CustomEvent("arena-generate-error", { bubbles: !0, composed: !0, detail: { code: o, message: t } }));
  }
  refresh() {
    const t = this.ui, o = {
      seconds: this.loaded?.seconds ?? 5,
      hasAudio: this.loaded ? !!this.loaded.audio : !0,
      hasCharacter: !!this.refs.character,
      hasEnvironment: !!this.refs.environment,
      audioInVideo: this.loaded?.meta.audioInVideo === !0,
      audioSeconds: this.loaded?.audio?.info?.seconds
    };
    t.preview.replaceChildren(Ss({ shot: this.shot(), override: t.override.value, model: t.model(), facts: o }));
    let r = "Load a guide bundle to see the estimate.";
    if (this.loaded)
      try {
        const s = vo({ guide: this.loaded, model: t.model(), shot: this.shot() ?? void 0, prompt: t.override.value, character: this.refs.character?.media, environment: this.refs.environment?.media });
        r = `Estimated ${W(s.plan.estimate.usd)} (${s.plan.estimate.basis}). Sends: ${s.plan.inputsSent.map((n) => `${n.role} ${n.label}`).join(", ")}.`;
      } catch (s) {
        r = s.message;
      }
    t.estimate.textContent = r, t.run.disabled = !this.loaded || !!this.abort;
  }
  askInline(t) {
    const o = this.ui.confirmSlot;
    return new Promise((r) => {
      const s = i("button", { type: "button", class: "primary", "data-action": "confirm" }, `Spend up to ${W(t.usd)}`), n = i("button", { type: "button", "data-action": "cancel" }, "Cancel"), a = (c) => (o.replaceChildren(), r(c));
      s.addEventListener("click", () => a(!0)), n.addEventListener("click", () => a(!1)), o.replaceChildren(
        i("div", { class: "confirm", role: "group", "aria-label": "Confirm cost" }, i("p", { class: "caption" }, `${t.modelName}: estimated ${W(t.usd)} (${t.basis}); your cap is ${W(t.maxPrice)}.`), i("div", { class: "row" }, s, n))
      ), s.focus();
    });
  }
  async run() {
    const t = this.ui;
    if (!this.loaded) return;
    const o = this.keySource();
    if (!o?.connected) return this.fail("Connect your Runware key first.", "invalid-key");
    this.abort = new AbortController(), t.run.disabled = !0, t.stop.hidden = !1, t.error.textContent = "", t.result.replaceChildren();
    try {
      const r = await rs({
        guide: this.loaded,
        model: t.model(),
        shot: this.shot() ?? void 0,
        prompt: t.override.value,
        references: this.references,
        maxPrice: Number(t.maxPrice.value),
        key: o.getKey,
        confirm: this.confirm ?? ((a) => this.askInline(a)),
        signal: this.abort.signal,
        fetch: this.fetch,
        poll: this.pollOptions,
        onProgress: (a) => {
          t.status.textContent = `${a.stage}: ${a.message}${a.progress !== void 0 ? ` ${a.progress}%` : ""}`, this.dispatchEvent(new CustomEvent("arena-generate-progress", { bubbles: !0, composed: !0, detail: { ...a } }));
        }
      });
      t.result.replaceChildren(
        Hs(
          r,
          this.urls,
          this.base,
          (a) => this.dispatchEvent(new CustomEvent("arena-gallery-add", { bubbles: !0, composed: !0, detail: { record: a, base: this.base } }))
        )
      );
      const { task: s, ...n } = r;
      this.dispatchEvent(new CustomEvent("arena-generate-result", { bubbles: !0, composed: !0, detail: n }));
    } catch (r) {
      const s = r instanceof T ? r : new T("provider", r.message);
      this.fail(s.message, s.code);
    } finally {
      this.abort = void 0, t.stop.hidden = !0, t.confirmSlot.replaceChildren(), this.refresh();
    }
  }
  build() {
    const t = bs((r) => this.getAttribute(r));
    this.ui = t, this.slots = {
      character: _t("character", (r) => {
        this.setRef("character", r);
      }),
      environment: _t("environment", (r) => {
        this.setRef("environment", r);
      })
    }, t.bundleInput.addEventListener("change", () => t.bundleInput.files?.length && void (this.pending = this.setGuide(t.bundleInput.files, ae()))), t.run.addEventListener("click", () => {
      this.run();
    }), t.stop.addEventListener("click", () => this.abort?.abort());
    for (const r of [...Object.values(t.fields), t.override]) r.addEventListener("input", () => this.refresh());
    for (const { r } of t.radios) r.addEventListener("change", () => this.refresh());
    const o = i("div");
    this.keySource() || (yo(), this.ownKey = document.createElement("arena-key"), o.append(this.ownKey)), this.root.replaceChildren(
      i("style", {}, Io),
      i(
        "div",
        { class: "wrap" },
        i("h3", {}, "Generate from this guide"),
        o,
        i("div", { class: "row" }, t.bundleInput, t.guideInfo),
        t.modelSet,
        t.shotSet,
        i("fieldset", {}, i("legend", {}, "Reference images"), this.slots.character.node, this.slots.environment.node),
        t.preview,
        i("div", { class: "row" }, i("label", { class: "f" }, "Price cap, USD", t.maxPrice), t.run, t.stop),
        t.estimate,
        t.confirmSlot,
        t.status,
        t.error,
        t.result
      )
    ), this.refresh();
  }
}
function qs(e = "arena-generate") {
  customElements.get(e) || customElements.define(e, Js);
}
const tt = () => typeof location > "u" ? "http://localhost/" : location.href, Zt = 50;
function Ys(e) {
  return e ? [`${e.subject} ${e.action}`.trim(), e.environment, e.legend].filter(Boolean).join(" · ") : null;
}
class Zs extends HTMLElement {
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
    bt(), this.getAttribute("src") || this.render();
  }
  attributeChangedCallback(t, o, r) {
    r && r !== o && this.fetchList(r);
  }
  get records() {
    return this.entries.map((t) => t.record);
  }
  set records(t) {
    this.entries = [], this.skipped = [];
    for (const o of Array.isArray(t) ? t.slice(0, Zt) : []) this.accept(o, tt());
    this.index = 0, this.render();
  }
  /** Adds a record and shows it. Returns false when it does not validate. */
  add(t, o = tt()) {
    const r = this.accept(t, o);
    return r && (this.index = this.entries.length - 1), this.render(), r;
  }
  accept(t, o) {
    try {
      const r = ce(t), s = this.entries.findIndex((n) => n.record.id === r.id);
      return s >= 0 ? this.entries[s] = { record: r, base: o } : this.entries.push({ record: r, base: o }), !0;
    } catch (r) {
      return this.skipped.push(r.message), !1;
    }
  }
  async fetchList(t) {
    const o = ++this.load;
    try {
      const r = new URL(t, tt()).href, s = await fetch(r);
      if (!s.ok) throw new Error(`HTTP ${s.status}`);
      const n = await s.json(), a = Array.isArray(n) ? n : Array.isArray(n.records) ? n.records : null;
      if (!a) throw new Error("expected an array of records");
      const c = [];
      this.skipped = [];
      for (const d of a.slice(0, Zt))
        if (typeof d == "string") {
          const l = new URL(d, r).href, p = await fetch(l);
          if (!p.ok) {
            this.skipped.push(`${d}: HTTP ${p.status}`);
            continue;
          }
          c.push(...this.tryParse(await p.json(), l));
        } else c.push(...this.tryParse(d, r));
      if (o !== this.load) return;
      this.entries = c, this.index = 0, this.render();
    } catch (r) {
      o === this.load && this.render(`Could not load ${t}: ${r.message}`);
    }
  }
  tryParse(t, o) {
    try {
      return [{ record: ce(t), base: o }];
    } catch (r) {
      return this.skipped.push(r.message), [];
    }
  }
  render(t) {
    const o = i("style", {}, Io);
    if (!this.entries.length) {
      this.root.replaceChildren(
        o,
        i("div", { class: "empty", "data-empty": "" }, i("strong", {}, "No published runs yet"), t ?? "Runs added to the gallery show up here, playable without a key.")
      );
      return;
    }
    const r = this.entries[Math.min(this.index, this.entries.length - 1)], s = !!r.record.guide, n = s ? this.view : "arena", a = i("div", { class: "switch", role: "group", "aria-label": "Run" });
    this.entries.forEach((f, v) => {
      const b = i("button", { type: "button", "aria-pressed": String(f === r), "data-record": f.record.id }, f.record.title.slice(0, 48));
      b.addEventListener("click", () => (this.index = v, this.render())), a.append(b);
    });
    const c = i("div", { class: "switch", role: "group", "aria-label": "View" });
    for (const [f, v] of [["inputs", "Inputs and outputs"], ["guidance", "Guide beside output"], ["arena", "All outputs"]]) {
      const b = i("button", { type: "button", "aria-pressed": String(n === f), "data-view": f }, v);
      b.disabled = f !== "arena" && !s, b.addEventListener("click", () => (this.view = f, this.render())), c.append(b);
    }
    const d = document.createElement("model-arena");
    d.setAttribute("layout", n), d.setRecord(r.record, r.base);
    const l = r.record.lanes.find((f) => f.shot) ?? r.record.lanes[0], p = Ys(l?.shot ?? r.record.shot), u = xs(r.record, r.base);
    let m = null;
    u && (m = i("button", { type: "button", "data-action": "run-yourself" }, "Run this yourself"), m.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("arena-run-yourself", { bubbles: !0, composed: !0, detail: { preset: u, record: r.record } }));
      const f = this.getAttribute("generate"), v = f ? document.getElementById(f) : null;
      v?.loadPreset && (v.loadPreset(u), v.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    })), this.root.replaceChildren(
      o,
      i(
        "div",
        { class: "wrap" },
        i("div", { class: "row spread" }, a, c),
        d,
        i("div", { class: "row spread" }, p ? i("p", { class: "caption", "data-shot": "" }, i("strong", {}, "Shot: "), p) : i("span"), m),
        this.skipped.length ? i("p", { class: "note" }, `${this.skipped.length} record(s) skipped: ${this.skipped[0]}`) : null
      )
    );
  }
}
function Qs(e = "arena-gallery") {
  customElements.get(e) || customElements.define(e, Zs);
}
const en = () => typeof location > "u" ? "http://localhost/" : location.href;
function tn(e, t, o, r = 24) {
  return Number.isFinite(t) ? o ? Math.abs(e - t) > 1e-3 : Math.abs(e - t) > 1 / r : !1;
}
const on = (
  /* css */
  `
${_e}
:host { display: block; position: relative; background: #000; border-radius: var(--ma-radius); overflow: hidden; aspect-ratio: 16 / 9; }
video { width: 100%; height: 100%; display: block; object-fit: contain; }
.err { position: absolute; inset: auto 8px 8px 8px; margin: 0; font: 12px var(--ma-font); color: var(--ma-warn); }
.err:empty { display: none; }
`
);
class rn extends HTMLElement {
  static observedAttributes = ["src", "controls", "muted", "label"];
  video;
  root;
  err;
  target = 0;
  constructor() {
    super(), this.root = this.attachShadow({ mode: "open" }), this.video = i("video", { playsinline: "", preload: "auto", "data-player": "" }), this.video.muted = !0, this.video.controls = !0, this.err = i("p", { class: "err", role: "status" }), this.video.addEventListener("loadedmetadata", () => {
      this.dispatchEvent(new CustomEvent("arena-player-ready", { bubbles: !0, composed: !0, detail: { duration: this.video.duration } })), this.target && (this.video.currentTime = Math.min(this.target, this.video.duration || this.target));
    }), this.video.addEventListener("error", () => {
      this.err.textContent = "The clip did not load.", this.dispatchEvent(new CustomEvent("arena-player-error", { bubbles: !0, composed: !0, detail: { message: this.err.textContent } }));
    }), this.root.replaceChildren(i("style", {}, on), this.video, this.err);
  }
  attributeChangedCallback(t) {
    if (t === "src") {
      const o = K(this.getAttribute("src") ?? "", en());
      this.err.textContent = "", o ? this.video.src = o : this.video.removeAttribute("src");
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
    const o = this.video.duration, r = Math.max(0, Number.isFinite(o) && o > 0 ? Math.min(t, o) : t);
    this.target = r, tn(this.video.currentTime, r, this.video.paused, this.fps) && (this.video.currentTime = r);
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
function sn(e = "arena-player") {
  customElements.get(e) || customElements.define(e, rn);
}
bt();
yo();
sn();
qs();
Qs();
export {
  Zs as ArenaGallery,
  Js as ArenaGenerate,
  hs as ArenaKey,
  rn as ArenaPlayer,
  Or as COMPARE_MODEL_KEYS,
  me as GUIDE_MODEL_KEYS,
  T as GenerateError,
  Bs as ModelArena,
  ps as TOKEN_NAMES,
  Gr as comparePrompts,
  nn as composePrompt,
  wo as entriesOf,
  rs as generateFromGuide,
  bo as guideModels,
  Dt as keyProblem,
  ao as loadGuideBundle,
  tn as needsSeek,
  an as offeredModels,
  no as parseGuideShot,
  ws as parsePreset,
  ce as parseRecord,
  vo as planGuideLane,
  xs as presetFromRecord,
  De as previewPrompt
};
