const is = (e) => String(e ?? "").replace(/[|\r\n]+/g, " ").trim() || "-", Pt = (e) => e === null ? "-" : `$${e.toFixed(4)}`;
function ho(e) {
  return `| ${[
    e.date,
    e.model,
    e.modelRan ?? "unknown",
    e.taskUUID,
    e.duration,
    e.resolution,
    e.inputs,
    Pt(e.estimateUsd),
    Pt(e.costUsd),
    e.seconds === null ? "-" : e.seconds.toFixed(1),
    e.output,
    e.status
  ].map(is).join(" | ")} |
`;
}
const go = (e) => String(e.resolution ?? `${e.width ?? ""}x${e.height ?? ""}`);
function as(e, t, o, s, n) {
  const { inputs: r, taskUUID: i, positivePrompt: d, ...a } = s?.task ?? t.task;
  return {
    id: e,
    label: t.modelName,
    provider: t.provider,
    model: t.modelId,
    modelName: t.modelName,
    modelRan: s?.modelRan ?? null,
    prompt: o.prompt,
    inputsSent: t.inputsSent,
    firstFrameVariant: t.firstFrameVariant,
    output: n ? { src: n, contentType: "video/mp4", remoteUrl: s?.videoURL } : null,
    costUsd: s?.costUsd ?? null,
    generationSeconds: s ? Math.round(s.generationSeconds * 10) / 10 : null,
    ...o.duration !== void 0 ? { durationSeconds: o.duration } : {},
    ...s ? { taskUUID: s.taskUUID } : {},
    ...o.routing ? { routing: { maxPrice: o.routing.maxPrice, requirements: o.routing.requirements } } : {},
    settings: a,
    status: s ? "ready" : "pending"
  };
}
const ds = "https://api.runware.ai/v1";
class Q extends Error {
  constructor(t, o) {
    super(
      o.length ? o.map((s) => `${s.code}: ${s.message}${s.parameter ? ` (${s.parameter})` : ""}`).join("; ") : `Runware API returned HTTP ${t}.`
    ), this.status = t, this.errors = o, this.name = "RunwareApiError";
  }
  status;
  errors;
}
const cs = /^[\x21-\x7e]{8,512}$/;
class Ne {
  getKey;
  fetchImpl;
  constructor(t) {
    this.getKey = t.getKey, this.fetchImpl = t.fetch ?? ((o, s) => globalThis.fetch(o, s));
  }
  /** Redacts the key from any text before it is shown. */
  redact(t) {
    const o = this.getKey();
    return o ? t.split(o).join("[key]") : t;
  }
  async post(t, o) {
    const s = this.getKey();
    if (!s) throw new Error("No Runware API key. Set RUNWARE_API_KEY, or paste it into the key panel.");
    if (!cs.test(s)) throw new Error("That does not look like a Runware API key.");
    const n = await this.fetchImpl(ds, {
      method: "POST",
      headers: { Authorization: `Bearer ${s}`, "Content-Type": "application/json" },
      body: JSON.stringify(t),
      signal: o
    });
    let r;
    try {
      r = await n.json();
    } catch {
      throw new Q(n.status, []);
    }
    const i = r ?? {}, d = Array.isArray(i.data) ? i.data : [], a = Array.isArray(i.errors) ? i.errors.map((l) => ({
      code: String(l.code ?? "error"),
      message: this.redact(String(l.message ?? "")),
      ...l.parameter ? { parameter: String(l.parameter) } : {},
      ...l.taskUUID ? { taskUUID: String(l.taskUUID) } : {}
    })) : [];
    if (!n.ok && !d.length) throw new Q(n.status, a);
    return { data: d, errors: a };
  }
  /** Stores media (data URI, base64 or public URL) and returns its UUID and URL. */
  async upload(t, o) {
    const s = globalThis.crypto.randomUUID(), { data: n, errors: r } = await this.post([{ taskType: "mediaStorage", taskUUID: s, operation: "upload", media: t }], o), i = r.filter((a) => !a.taskUUID || a.taskUUID === s);
    if (i.length) throw new Q(400, i);
    const d = n.find((a) => a.taskUUID === s) ?? n[0];
    if (!d || typeof d.mediaUUID != "string") throw new Error("mediaStorage upload returned no mediaUUID.");
    return { mediaUUID: d.mediaUUID, mediaURL: String(d.mediaURL ?? "") };
  }
  /**
   * The account's current balance in USD. The same response lists the team and
   * the API keys; only the number is read and nothing else is kept or returned.
   */
  async balance(t) {
    const o = globalThis.crypto.randomUUID(), { data: s, errors: n } = await this.post([{ taskType: "accountManagement", taskUUID: o, operation: "getDetails" }], t), r = n.filter((a) => !a.taskUUID || a.taskUUID === o);
    if (r.length) throw new Q(400, r);
    const i = (s.find((a) => a.taskUUID === o) ?? s[0])?.balance, d = typeof i == "string" ? Number(i) : i;
    if (typeof d != "number" || !Number.isFinite(d)) throw new Error("Runware returned no balance.");
    return d;
  }
  /** Reads back the stored request for a task; used to learn which model the router chose. */
  async taskDetails(t, o) {
    const { data: s } = await this.post([{ taskType: "getTaskDetails", taskUUID: t }], o);
    return s[0];
  }
}
const ls = [
  "firstFrame",
  "lastFrame",
  "keyframes",
  "referenceImages",
  "referenceVideos",
  "referenceAudios",
  "sourceVideo",
  "audioToVideo",
  "elements"
], lt = [
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
], At = ["image", "video", "audio"], Ut = [
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
], us = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
class K extends Error {
  constructor(t, o) {
    super(`${t}: ${o}`), this.path = t, this.name = "ShotError";
  }
  path;
}
const et = (e) => typeof e == "object" && e !== null && !Array.isArray(e);
function Y(e, t, o, s = !1) {
  if (!(s && e === void 0) && (typeof e != "string" || e.length > o || us.test(e)))
    throw new K(t, `must be plain text up to ${o} characters`);
}
function ms(e, t = "shot") {
  if (!et(e)) throw new K(t, "must be an object");
  if (Y(e.subject, `${t}.subject`, 500), Y(e.action, `${t}.action`, 500), Y(e.environment, `${t}.environment`, 500, !0), Y(e.legend, `${t}.legend`, 300, !0), Y(e.focus, `${t}.focus`, 200, !0), Y(e.audio, `${t}.audio`, 500, !0), e.camera !== "guide" && !lt.includes(e.camera))
    throw new K(`${t}.camera`, `must be "guide" or one of ${lt.join(", ")}`);
  if (typeof e.duration != "number" || !(e.duration > 0 && e.duration <= 60)) throw new K(`${t}.duration`, "must be 1-60 seconds");
  if (!Array.isArray(e.references) || e.references.length > 20) throw new K(`${t}.references`, "must be an array of up to 20");
  if (e.references.forEach((o, s) => {
    const n = `${t}.references[${s}]`;
    if (!et(o) || typeof o.id != "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(o.id)) throw new K(`${n}.id`, "must be a short id");
    if (!At.includes(o.kind)) throw new K(`${n}.kind`, `must be one of ${At.join(", ")}`);
    if (!Ut.includes(o.role)) throw new K(`${n}.role`, `must be one of ${Ut.join(", ")}`);
    Y(o.keep, `${n}.keep`, 200, !0), Y(o.replaces, `${n}.replaces`, 200, !0);
  }), e.beats !== void 0) {
    if (!Array.isArray(e.beats) || e.beats.length > 20) throw new K(`${t}.beats`, "must be an array of up to 20");
    e.beats.forEach((o, s) => {
      if (!et(o) || typeof o.start != "number" || typeof o.end != "number" || !(o.end > o.start && o.start >= 0))
        throw new K(`${t}.beats[${s}]`, "must have start < end, in seconds");
      Y(o.text, `${t}.beats[${s}].text`, 300);
    });
  }
  return e;
}
function ps(e) {
  const t = e.references.map((o) => `${o.role} ${o.kind}`).join(", ");
  return `${e.subject} ${e.action}${e.environment ? `, ${e.environment}` : ""}. Camera: ${e.camera === "guide" ? "from the guide" : e.camera}. ${e.duration} s${t ? `. References: ${t}` : ""}${e.audio ? `. Sound: ${e.audio}` : ""}.`;
}
function fs(e) {
  return {
    model: e.model,
    ...e.notes.length ? { notes: e.notes.slice(0, 40) } : {},
    ...e.dropped.length ? { dropped: e.dropped.slice(0, 40).map((t) => `${t.ref}: ${t.reason}`) } : {}
  };
}
const Rt = 1, bo = /^[a-z0-9][a-z0-9-]{0,63}$/, Mt = [
  "referenceVideo",
  "referenceImage",
  "referenceAudio",
  "frameImage",
  "audio",
  "video"
], hs = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
class v extends Error {
  constructor(t, o) {
    super(`${t}: ${o}`), this.path = t, this.name = "RecordError";
  }
  path;
}
const q = (e) => typeof e == "object" && e !== null && !Array.isArray(e);
function B(e, t, o, s = 0) {
  if (typeof e != "string") throw new v(t, "must be a string");
  if (e.length < s || e.length > o)
    throw new v(t, `must be ${s}-${o} characters`);
  if (hs.test(e)) throw new v(t, "must be plain text");
  return e;
}
function Tt(e, t, o) {
  e !== void 0 && B(e, t, o);
}
function Ft(e, t) {
  if (e !== null && (typeof e != "number" || !Number.isFinite(e) || e < 0))
    throw new v(t, "must be a non-negative number or null");
}
function Lt(e, t) {
  if (!q(e)) throw new v(t, "must be an object");
  B(e.src, `${t}.src`, 2048, 1);
  for (const o of ["width", "height", "fps", "seconds", "bytes"])
    if (e[o] !== void 0 && (typeof e[o] != "number" || !(e[o] >= 0)))
      throw new v(`${t}.${o}`, "must be a non-negative number");
}
function gs(e, t = "guide") {
  if (!q(e)) throw new v(t, "must be an object");
  if (e.schemaVersion !== 1) throw new v(`${t}.schemaVersion`, "must be 1");
  Lt(e.video, `${t}.video`);
  for (const o of ["audio", "firstFrame", "firstFrameStyled", "camera"])
    e[o] !== void 0 && Lt(e[o], `${t}.${o}`);
  if (e.beats !== void 0 && (!Array.isArray(e.beats) || e.beats.some((o) => typeof o != "number" || o < 0)))
    throw new v(`${t}.beats`, "must be non-negative seconds");
  return e.onsets !== void 0 && wo(e.onsets, `${t}.onsets`), e.peaks !== void 0 && vt(e.peaks, `${t}.peaks`), e;
}
function vt(e, t) {
  if (!Array.isArray(e) || e.length > 2e4) throw new v(t, "must be an array");
  return e.forEach((o, s) => {
    if (!q(o) || typeof o.seconds != "number" || !(o.seconds >= 0))
      throw new v(`${t}[${s}].seconds`, "must be non-negative seconds");
    if (typeof o.strength != "number" || !(o.strength >= 0 && o.strength <= 1))
      throw new v(`${t}[${s}].strength`, "must be 0-1");
  }), e;
}
function wo(e, t) {
  if (!q(e)) throw new v(t, "must be an object");
  for (const o of ["low", "mid", "high"]) vt(e[o], `${t}.${o}`);
  return e;
}
function bs(e, t) {
  if (!q(e)) throw new v(t, "must be an object");
  if (typeof e.id != "string" || !bo.test(e.id)) throw new v(`${t}.id`, "must be a slug");
  if (Tt(e.label, `${t}.label`, 120), B(e.provider, `${t}.provider`, 40, 1), B(e.model, `${t}.model`, 120, 1), e.modelRan !== null && B(e.modelRan, `${t}.modelRan`, 120, 1), B(e.prompt, `${t}.prompt`, 5e4), !Array.isArray(e.inputsSent)) throw new v(`${t}.inputsSent`, "must be an array");
  if (e.inputsSent.forEach((o, s) => {
    const n = `${t}.inputsSent[${s}]`;
    if (!q(o) || !Mt.includes(o.role))
      throw new v(n, `role must be one of ${Mt.join(", ")}`);
    B(o.src, `${n}.src`, 2048, 1);
  }), !["A", "B", "C"].includes(e.firstFrameVariant))
    throw new v(`${t}.firstFrameVariant`, "must be A, B or C");
  if (e.output !== null) {
    if (!q(e.output)) throw new v(`${t}.output`, "must be an object or null");
    B(e.output.src, `${t}.output.src`, 2048, 1);
  }
  if (Ft(e.costUsd, `${t}.costUsd`), Ft(e.generationSeconds, `${t}.generationSeconds`), Tt(e.note, `${t}.note`, 2e3), e.composed !== void 0) {
    if (!q(e.composed)) throw new v(`${t}.composed`, "must be an object");
    B(e.composed.model, `${t}.composed.model`, 120, 1);
    for (const o of ["notes", "dropped"]) {
      const s = e.composed[o];
      if (s !== void 0) {
        if (!Array.isArray(s) || s.length > 40) throw new v(`${t}.composed.${o}`, "must be an array");
        s.forEach((n, r) => B(n, `${t}.composed.${o}[${r}]`, 1e3));
      }
    }
  }
  return e.shot !== void 0 && vo(e.shot, `${t}.shot`), e;
}
function vo(e, t) {
  try {
    ms(e, t);
  } catch (o) {
    throw o instanceof K ? new v(o.path, o.message.slice(o.path.length + 2)) : o;
  }
}
function ue(e) {
  if (!q(e)) throw new v("record", "must be an object");
  if (e.schemaVersion !== Rt)
    throw new v("schemaVersion", `must be ${Rt}`);
  if (typeof e.id != "string" || !bo.test(e.id)) throw new v("id", "must be a slug");
  if (B(e.title, "title", 200, 1), e.guide !== void 0 && gs(e.guide), e.shot !== void 0 && vo(e.shot, "shot"), !Array.isArray(e.lanes) || e.lanes.length < 1 || e.lanes.length > 12)
    throw new v("lanes", "must hold 1-12 lanes");
  const t = e.lanes.map((s, n) => bs(s, `lanes[${n}]`)), o = new Set(t.map((s) => s.id));
  if (o.size !== t.length) throw new v("lanes", "lane ids must be distinct");
  if (e.preferredLane !== void 0 && !o.has(e.preferredLane))
    throw new v("preferredLane", "must name a lane in this record");
  if (e.observations !== void 0) {
    if (!Array.isArray(e.observations)) throw new v("observations", "must be an array");
    e.observations.forEach((s, n) => B(s, `observations[${n}]`, 2e3));
  }
  return e;
}
const jt = ["mannequin", "block", "stick", "blob", "glider", "file", "rigged"], ws = [
  "video",
  "audio",
  "firstFrame",
  "character",
  "motion",
  "recipe",
  "beats",
  "camera"
], vs = /^\d+\.\d+\.\d+$/, ys = ["schemaVersion", "video", "audio", "firstFrame", "firstFrameStyled", "beats", "recipe", "meta", "camera"], Ae = (e) => typeof e == "object" && e !== null && !Array.isArray(e);
function Se(e, t, o) {
  if (typeof e != "string" || e.length < 1 || e.length > 255 || /[\\/]|^\.\.?$/.test(e))
    throw new v(t, "must be a file name inside the bundle");
  if (o && !o.test(e)) throw new v(t, `must match ${o}`);
  return e;
}
function Vt(e, t) {
  if (!Array.isArray(e) || e.some((o) => typeof o != "number" || !(o >= 0)))
    throw new v(t, "must be non-negative seconds");
  return e;
}
function yo(e, t = "bundle") {
  if (!Ae(e)) throw new v(t, "must be an object");
  if (typeof e.schemaVersion != "string" || !vs.test(e.schemaVersion))
    throw new v(`${t}.schemaVersion`, "must be x.y.z");
  for (const o of Object.keys(e))
    if (!ys.includes(o)) throw new v(`${t}.${o}`, "is not a bundle key");
  Se(e.video, `${t}.video`, /\.mp4$/), Se(e.firstFrame, `${t}.firstFrame`, /\.png$/);
  for (const o of ["beats", "recipe", "meta"]) Se(e[o], `${t}.${o}`, /\.json$/);
  e.camera !== void 0 && Se(e.camera, `${t}.camera`, /\.json$/);
  for (const o of ["audio", "firstFrameStyled"]) e[o] !== void 0 && Se(e[o], `${t}.${o}`);
  return e;
}
function xo(e, t = "beats") {
  if (!Ae(e)) throw new v(t, "must be an object");
  if (typeof e.bpm != "number" || !(e.bpm >= 40 && e.bpm <= 240)) throw new v(`${t}.bpm`, "must be 40-240");
  if (typeof e.offsetSeconds != "number" || !(e.offsetSeconds >= 0))
    throw new v(`${t}.offsetSeconds`, "must be non-negative");
  if (!Number.isInteger(e.beatsPerBar) || e.beatsPerBar < 1)
    throw new v(`${t}.beatsPerBar`, "must be a positive integer");
  if (e.source !== "manual" && e.source !== "analysis") throw new v(`${t}.source`, "must be manual or analysis");
  return Vt(e.beats, `${t}.beats`), Vt(e.downbeats, `${t}.downbeats`), e.onsets !== void 0 && wo(e.onsets, `${t}.onsets`), e.peaks !== void 0 && vt(e.peaks, `${t}.peaks`), e;
}
function $o(e, t = "meta") {
  if (!Ae(e)) throw new v(t, "must be an object");
  for (const s of ["width", "height", "frames"])
    if (!Number.isInteger(e[s]) || e[s] < 1) throw new v(`${t}.${s}`, "must be a positive integer");
  if (e.fps !== 24) throw new v(`${t}.fps`, "must be 24");
  const o = e.character;
  if (!Ae(o) || !jt.includes(o.kind) || typeof o.name != "string")
    throw new v(`${t}.character`, `kind must be one of ${jt.join(", ")}`);
  if (!Array.isArray(e.assets) || e.assets.length < 1) throw new v(`${t}.assets`, "must list at least one asset");
  return e.assets.forEach((s, n) => {
    if (!Ae(s) || !ws.includes(s.role)) throw new v(`${t}.assets[${n}].role`, "unknown role");
    if (typeof s.licence != "string" || s.licence.length < 1) throw new v(`${t}.assets[${n}].licence`, "is required");
  }), e;
}
function xs(e, t, o) {
  const s = yo(e.manifest), n = xo(e.beats), r = $o(e.meta), i = t.endsWith("/") ? t : `${t}/`, d = (m) => `${i}${m}`, a = r.fps, l = {
    schemaVersion: 1,
    video: { src: d(s.video), contentType: "video/mp4", width: r.width, height: r.height, fps: a, seconds: r.durationSeconds },
    firstFrame: { src: d(s.firstFrame), contentType: "image/png", width: r.width, height: r.height },
    beats: n.beats,
    ...n.onsets ? { onsets: n.onsets } : {},
    ...n.peaks ? { peaks: n.peaks } : {},
    ...e.recipe ? { recipe: e.recipe } : {},
    meta: {
      licences: r.assets.map((m) => ({ asset: m.file ?? m.name, licence: m.licence })),
      bundleSchemaVersion: s.schemaVersion,
      character: r.character,
      generator: r.generator,
      bpm: n.bpm,
      downbeats: n.downbeats
    }
  };
  return s.audio && (l.audio = { src: d(s.audio) }), s.firstFrameStyled && (l.firstFrameStyled = { src: d(s.firstFrameStyled) }), s.camera && (l.camera = { src: d(s.camera), contentType: "application/json" }), l;
}
class G extends Error {
  constructor(t) {
    super(t), this.name = "GuideError";
  }
}
const $s = {
  mp4: "video/mp4",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4"
}, ks = 2 * 1048576, Ss = 300 * 1048576, Is = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
function Ue(e) {
  return $s[e.toLowerCase().split(".").pop() ?? ""];
}
function Es(e) {
  let t = "";
  for (let o = 0; o < e.length; o += 32768) t += String.fromCharCode(...e.subarray(o, o + 32768));
  return btoa(t);
}
function Ps(e) {
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
      const s = e[o + 1], n = t.getUint16(o + 2);
      if (s >= 192 && s <= 207 && ![196, 200, 204].includes(s))
        return { height: t.getUint16(o + 5), width: t.getUint16(o + 7) };
      o += 2 + n;
    }
  }
}
async function Ve(e, t, o = {}, s = e.name) {
  const n = Ue(e.name);
  if (!n?.startsWith(t)) throw new G(`${e.name}: expected a ${t} file.`);
  if (e.size > Ss) throw new G(`${e.name} is over 300 MB.`);
  const r = await e.bytes(), i = t === "image" ? Ps(r) : void 0;
  return {
    name: e.name,
    contentType: n,
    ref: `data:${n};base64,${Es(r)}`,
    displaySrc: s,
    info: { ...o, ...i, bytes: e.size }
  };
}
const As = ["image/png", "image/jpeg", "image/webp"];
async function ko(e, t) {
  const o = Ue(e.name);
  if (!o || !As.includes(o))
    throw new G(`${e.name}: a reference image must be a PNG, JPEG or WebP file (the name ends in .png, .jpg, .jpeg or .webp).`);
  const s = await Ve(e, "image", {}, t ?? e.name);
  if (!s.info?.width || !s.info.height)
    throw new G(`${e.name}: its width and height could not be read, so the model's size limits cannot be checked. Re-save it as a PNG or JPEG.`);
  return s;
}
async function Fe(e, t) {
  if (!e) throw new G(`The bundle has no ${t}.`);
  if (e.size > ks) throw new G(`${t} is over 2 MB.`);
  try {
    return JSON.parse(new TextDecoder().decode(await e.bytes()));
  } catch {
    throw new G(`${t} is not valid JSON.`);
  }
}
const Le = (e, t) => typeof e == "string" && e.trim().length > 0 && e.length <= t && !Is.test(e);
function So(e) {
  if (typeof e != "object" || e === null) return;
  const t = e;
  if (!Le(t.subject, 500) || !(t.action === void 0 || t.action === "" || Le(t.action, 500))) return;
  const o = { subject: t.subject.trim(), action: typeof t.action == "string" ? t.action.trim() : "" };
  return Le(t.environment, 500) && (o.environment = t.environment.trim()), Le(t.legend, 300) && (o.legend = t.legend.trim()), (t.camera === "guide" || lt.includes(t.camera)) && (o.camera = t.camera), o;
}
async function Io(e, t = {}) {
  const o = t.base ? t.base.endsWith("/") ? t.base : `${t.base}/` : "./", s = (b) => /^https?:\/\//.test(o) ? new URL(b, o).href : b, n = /* @__PURE__ */ new Map();
  for (const b of e) n.set(b.name.split(/[\\/]/).pop(), b);
  let r, i, d;
  try {
    r = yo(await Fe(n.get("bundle.json"), "bundle.json")), i = $o(await Fe(n.get(r.meta), r.meta)), d = xo(await Fe(n.get(r.beats), r.beats));
  } catch (b) {
    throw b instanceof G ? b : new G(`The bundle does not match the guide-bundle schema: ${b.message}`);
  }
  const a = n.get(r.recipe), l = a ? await Fe(a, r.recipe) : void 0, m = (b) => {
    const y = n.get(b);
    if (!y) throw new G(`The bundle names ${b}, but that file is missing.`);
    return y;
  }, u = i.durationSeconds;
  if (typeof u != "number" || !(u > 0 && u <= 600)) throw new G("meta.json: durationSeconds must be 0-600 seconds.");
  const p = await Ve(m(r.video), "video", { width: i.width, height: i.height, seconds: u, fps: i.fps, hasAudio: i.audioInVideo === !0 }, s(r.video)), h = await Ve(m(r.firstFrame), "image", {}, s(r.firstFrame)), w = r.audio ? await Ve(m(r.audio), "audio", { seconds: u }, s(r.audio)) : void 0, f = xs({ manifest: r, beats: d, meta: i, ...l ? { recipe: l } : {} }, o), g = So(l?.shot);
  return { manifest: r, meta: i, beats: d, ...l ? { recipe: l } : {}, ...g ? { shot: g } : {}, video: p, audio: w, firstFrame: h, seconds: u, guide: f };
}
const pe = {
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
}, Us = {
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
function Rs(e, t, o = "the subject") {
  const s = e.camera.vocabulary.find((n) => n.move === t && n.phrase);
  if (s?.phrase) return { text: s.phrase.replaceAll("{subject}", o) };
  if (e.camera.kind === "parameter") {
    const n = e.camera.values.find((r) => r.move === t);
    if (n) return { text: n.meaning };
  }
  return { text: Us[t], note: `"${t}" is not in ${e.name}'s guide vocabulary; plain words are used.` };
}
const J = (e) => {
  const t = e.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const o = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(o) ? o : `${o}.`;
}, fe = (e, t) => t.references.find((o) => o.id === e.ref)?.keep ?? pe[e.role].keep, N = (e, t = " ") => e.filter(Boolean).join(t), Be = (e, t = J(`${e.subject} ${e.action}`)) => N([t, e.environment ? J(e.environment) : null]), Ge = (e) => e.legend ? J(e.legend) : null, Ms = (e) => `${e.start}–${e.end} s`;
function Ts(e, t, o, s) {
  const n = o.find((a) => a.input === "referenceVideos" && a.role === "motion" && a.address), r = [];
  if (n) {
    const a = t.references.find((l) => l.id === n.ref)?.keep;
    r.push(`Reference only the ${a ?? "motion, camera path and pacing"} of ${n.address}.`);
  }
  for (const a of o) {
    if (!a.address || a === n) continue;
    const l = t.references.find((m) => m.id === a.ref);
    a.input === "firstFrame" ? r.push(`${a.address} is the first frame.`) : a.input === "lastFrame" ? r.push(`${a.address} is the last frame.`) : n && l?.replaces ? r.push(`Replace ${l.replaces} with ${pe[a.role].noun} in ${a.address}; keep ${fe(a, t)}.`) : r.push(`${a.address} defines ${pe[a.role].noun}; keep ${fe(a, t)}.`);
  }
  const i = t.beats?.length ? t.beats.map((a) => `${Ms(a)}: ${J(a.text)}`).join(`
`) : null, d = t.audio ? `Audio: ${J(t.audio)} No subtitles.` : null;
  return N([N([...r, Ge(t)]), N([Be(t), s.text]), i, d], `

`);
}
function Fs(e, t, o, s) {
  const n = o.filter((a) => a.address && a.input !== "referenceAudios").map((a) => a.role === "motion" ? `${a.address} is ${pe.motion.noun}: follow its ${fe(a, t)}.` : `${a.address} is ${pe[a.role].noun}; keep ${fe(a, t)}.`), r = o.find((a) => a.input === "referenceAudios"), i = t.audio || r ? N(["Audio:", t.audio ? J(t.audio) : null, r?.address ? `Sync the motion to ${r.address}.` : null]) : null, d = t.beats?.length ? t.beats.map((a) => `[${a.start}-${a.end}s] ${J(a.text)}`).join(`
`) : null;
  return N([s.text, N([...n, Ge(t)]), Be(t), d, i], `

`);
}
function Ls(e, t, o, s) {
  const n = o.find((l) => l.role === "motion" && l.address), r = o.filter((l) => l.address && l.input !== "referenceAudios").map((l) => l === n ? `${l.address} is the motion reference: follow its ${fe(l, t)}.` : `${l.address} is ${pe[l.role].noun}; keep ${fe(l, t)}.`), i = Be(t, n ? J(`${t.subject}, moving as in ${n.address}`) : void 0), d = o.some((l) => l.input === "referenceAudios"), a = t.audio || d ? N(["Sound:", t.audio ? J(t.audio) : null, d ? "Follow the reference audio." : null]) : null;
  return N([N([...r, Ge(t)]), N([i, s.text]), a], `

`);
}
function Ct(e, t, o, s) {
  const n = e.id.startsWith("flux") ? o.map(
    (i) => i.input === "firstFrame" ? "Use this image as the first frame." : i.input === "lastFrame" ? "Use this image as the last frame." : i.input === "keyframes" ? "Use these images as keyframes, in order." : null
  ) : [], r = t.audio ? `Audio: ${J(t.audio)}` : null;
  return N([...new Set(n)], " ") + (n.some(Boolean) ? " " : "") + N([Be(t), Ge(t), s.text, r]);
}
function js(e, t, o, s) {
  switch (e.prompting.addressing.style) {
    case "tags":
      return Ts(e, t, o, s);
    case "at-mentions":
      return Fs(e, t, o, s);
    case "plain-words":
      return e.prompting.addressing.tokens.length ? Ls(e, t, o, s) : Ct(e, t, o, s);
    default:
      return Ct(e, t, o, s);
  }
}
const yt = "https://runware.ai/docs/models", we = (e) => `${yt}/${e}`, ve = (e) => `${yt}/${e}/schema.json`, Re = (e, t) => `${yt}/${e}/guides/${t}`, O = 1048576;
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
function S(e, t, o, s = null, n) {
  return { supported: !0, field: e, maxCount: t, limits: s, source: o, ...n ? { note: n } : {} };
}
function M(e, t) {
  return { supported: !1, field: null, maxCount: null, limits: null, source: e, ...t ? { note: t } : {} };
}
const _e = "bfl-flux-3-video", Ie = we(_e), oe = ve(_e), A = (e) => Re(_e, e), j = (e, t, o) => ({ label: e, width: t, height: o }), Vs = {
  id: "flux-3-video",
  name: "FLUX 3 Video",
  lab: "Black Forest Labs",
  air: "bfl:flux@3-video",
  slug: _e,
  verifiedOn: "2026-11-10",
  sources: {
    model: Ie,
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
    keyframes: S("inputs.frameImages", 10, Ie, null, "Placed by frame index (24 fps), timestamp, or first/last; unplaced images are spread evenly. Guidance, not a pixel-exact pin."),
    referenceImages: M(oe),
    referenceVideos: M(oe),
    referenceAudios: M(oe),
    sourceVideo: S("inputs.video", 1, A("video-continuation"), V({ secondsEach: $(null, 15), maxBytesEach: 50 * O }), "Extension only: the clip is continued, not used as a motion reference."),
    audioToVideo: M(oe, "No audio input; speech is a quoted line with a visible speaker."),
    elements: M(oe)
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
      source: Ie
    }
  ],
  output: {
    durations: { kind: "range", min: 5, max: 20, auto: !0 },
    defaultDuration: "auto",
    resolutionField: "both",
    resolutions: ["720p", "1080p"],
    sizes: [
      j("720p (~21:9)", 1440, 608),
      j("720p (2:1)", 1344, 672),
      j("720p (~16:9)", 1280, 704),
      j("720p (~4:3)", 1088, 800),
      j("720p (1:1)", 960, 960),
      j("720p (~3:4)", 800, 1088),
      j("720p (~9:16)", 704, 1280),
      j("1080p (~21:9)", 2176, 928),
      j("1080p (~2:1)", 2016, 1024),
      j("1080p (~16:9)", 1920, 1088),
      j("1080p (~4:3)", 1632, 1216),
      j("1080p (1:1)", 1440, 1440),
      j("1080p (~3:4)", 1216, 1632),
      j("1080p (~9:16)", 1088, 1920)
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
    seed: { supported: !1, max: null, source: Ie },
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
    source: Ie
  },
  notes: [
    "fps: no fps field; the keyframes guide states 24 fps.",
    "Crane and rack focus: not stated in the guides' camera vocabulary.",
    "Seed: no request field; the response returns one.",
    "The frame field lists only first/last as allowed values, yet the guides use numeric indices; the guide's index 240 on a 10 s clip is one past the last frame.",
    "Prompt length: not stated in the schema or on the model page (no minLength or maxLength); the guides say 10,000 characters.",
    "Draft mode applies to text-to-video only."
  ]
}, Ke = "klingai-video-4-0", Nt = we(Ke), X = ve(Ke), I = (e) => Re(Ke, e), le = V({ sidePx: $(300, null), maxBytesEach: 30 * O, aspect: $(0.4, 2.5) }), ce = {
  id: "kling-4",
  name: "Kling VIDEO 4.0",
  lab: "Kling AI",
  air: "klingai:kling-video@4.0",
  slug: Ke,
  verifiedOn: "2026-11-10",
  sources: {
    model: Nt,
    schema: X,
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
    firstFrame: S("inputs.frameImages", 1, X, le),
    lastFrame: S("inputs.frameImages", 1, X, le),
    keyframes: S(
      "inputs.frameImages",
      10,
      I("keyframes"),
      le,
      "3-10 frames (x-modes multiple-frames); only first and last are pinned, the rest are spaced evenly in array order."
    ),
    referenceImages: S("inputs.referenceImages", 10, X, le),
    referenceVideos: S(
      "inputs.referenceVideos",
      5,
      X,
      V({
        secondsEach: $(3, 30),
        secondsTotalMax: 30,
        sidePx: $(700, 4553),
        maxAreaPx: 8294400,
        fps: $(24, 60),
        maxBytesEach: 300 * O,
        aspect: $(0.4, 2.5)
      })
    ),
    referenceAudios: M(X, "No audio input in the schema."),
    sourceVideo: S(
      "inputs.video",
      1,
      I("editing-video"),
      V({ secondsEach: $(3, 30), sidePx: $(700, 4553), maxAreaPx: 8294400, fps: $(24, 60), maxBytesEach: 300 * O, aspect: $(0.4, 2.5) }),
      "Prompt-based edit of the source clip."
    ),
    audioToVideo: M(X),
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
    source: Nt
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
}, xt = "klingai-video-4-0-flash", Ot = we(xt), D = ve(xt), Z = {
  ...ce,
  id: "kling-4-flash",
  name: "Kling VIDEO 4.0 Flash",
  air: "klingai:kling-video@4.0-flash",
  slug: xt,
  sources: { model: Ot, schema: D, guides: ce.sources.guides },
  inputs: {
    ...ce.inputs,
    firstFrame: S("inputs.frameImages", 1, D, le, "This model only supports the first frame."),
    lastFrame: M(D, "First frame only."),
    keyframes: M(D, "First frame only."),
    referenceImages: S("inputs.referenceImages", 10, D, le),
    referenceVideos: S(
      "inputs.referenceVideos",
      5,
      D,
      V({
        secondsEach: $(3, 20),
        secondsTotalMax: 20,
        sidePx: $(700, 4553),
        maxAreaPx: 8294400,
        fps: $(24, 60),
        maxBytesEach: 300 * O,
        aspect: $(0.4, 2.5)
      })
    ),
    sourceVideo: S(
      "inputs.video",
      1,
      D,
      V({ secondsEach: $(3, 20), sidePx: $(700, 4553), maxAreaPx: 8294400, fps: $(24, 60), maxBytesEach: 300 * O, aspect: $(0.4, 2.5) }),
      "Prompt-based edit of the source clip."
    ),
    elements: S("inputs.elements", 7, D, null, "Voices cannot be used with settings.preserveAudio.")
  },
  combinations: [
    {
      id: "image-cap",
      text: "Frame images and reference images share a cap of ten.",
      when: [],
      sharedMax: { inputs: ["firstFrame", "referenceImages"], max: 10 },
      source: D
    },
    {
      id: "video-cap",
      text: "Source video, reference videos and element videos share a cap of five files and 20 s in total.",
      when: [],
      sharedMax: { inputs: ["sourceVideo", "referenceVideos"], max: 5 },
      source: D
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
    source: D
  },
  prompting: {
    ...ce.prompting,
    addressing: { ...ce.prompting.addressing, source: D }
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.094, tier: "720p", mode: "no-video-input", label: "720p · No video input" },
      { usdPerSecond: 0.126, tier: "720p", mode: "video-input", label: "720p · Video input" }
    ],
    surcharges: [],
    source: Ot,
    note: "The model page shows two figures per rate ($0.0799 / $0.094, $0.107 / $0.126) without saying which applies; the schema's x-pricing gives the higher, used here."
  },
  notes: [
    "No Flash guides: prompt rules and camera vocabulary are from the Kling VIDEO 4.0 guides (same tag syntax per the schema).",
    "No resolution parameter: 720p only, as width/height pairs; with inputs the size follows the input.",
    "settings.preserveAudio keeps the input video's audio instead of generating new sound; it needs a video or reference video.",
    "Output fps: not stated. Frame-count rule: not stated.",
    "Seed: no request field; the response returns one."
  ]
}, Eo = "lightricks-ltx-2-5-pro", Cs = "lightricks-ltx-2-5-fast", T = (e) => Re(Eo, e), Po = [
  { label: "720p (16:9)", width: 1280, height: 720 },
  { label: "720p (9:16)", width: 720, height: 1280 },
  { label: "1080p (16:9)", width: 1920, height: 1080 },
  { label: "1080p (9:16)", width: 1080, height: 1920 }
], Ao = "No 8k+1 frame rule and no divisibility rule in the API or docs: durations, fps and width/height are fixed lists, so any frame padding is hidden server-side.";
function Uo(e, t) {
  const o = we(e), s = ve(e);
  return {
    id: "ltx-2.5",
    name: "LTX-2.5 Pro",
    lab: "Lightricks",
    air: "lightricks:ltx@2.5-pro",
    slug: e,
    verifiedOn: "2026-11-10",
    sources: {
      model: o,
      schema: s,
      guides: [
        { title: "Prompting", url: T("prompting") },
        { title: "Camera movement", url: T("camera-movement") },
        { title: "First and last frame", url: T("first-and-last-frame") },
        { title: "Audio-driven", url: T("audio-driven") },
        { title: "Native audio", url: T("native-audio") },
        { title: "Multi-shot", url: T("multi-shot") }
      ]
    },
    inputs: {
      firstFrame: S("inputs.frameImages", 1, T("first-and-last-frame")),
      lastFrame: S("inputs.frameImages", 1, T("first-and-last-frame")),
      keyframes: M(s, "frameImages holds at most two items (first and last)."),
      referenceImages: S("inputs.referenceImages", 1, s, null, "Only in audio-driven mode, exactly one."),
      referenceVideos: M(s),
      referenceAudios: M(s),
      sourceVideo: M(s, "Capabilities list Edit/Extend on Pro, but the schema has no source-video field."),
      audioToVideo: S("inputs.audio", 1, T("audio-driven"), V({ secondsEach: $(2, t) }), "The clip runs as long as the audio."),
      elements: M(s)
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
        source: s
      }
    ],
    output: {
      durations: { kind: "list", values: [6, 8, 10], auto: !0 },
      defaultDuration: 6,
      resolutionField: "width-height",
      resolutions: ["720p", "1080p"],
      sizes: Po,
      fps: [24, 25, 50],
      frameCountRule: null,
      audio: { generates: !0, toggle: "settings.audio" },
      source: s
    },
    prompting: {
      minChars: 2,
      maxChars: 5e3,
      addressing: {
        style: "none",
        tokens: [],
        numbering: "Inputs are not named in the prompt: the image sets the look and the prompt says what happens; with audio, describe the performance, not the words.",
        source: T("first-and-last-frame")
      },
      rules: [
        { text: "Cover six layers: shot, scene, action, character, camera, audio.", source: T("prompting") },
        { text: "Write one flowing paragraph in the present tense, not a list.", source: T("prompting") },
        { text: "Keep camera and subject motion in separate clauses, with one main action arc.", source: T("prompting") },
        { text: "With a cameraMovement preset set, leave the move out of the prompt.", source: T("camera-movement") },
        { text: "The tighter the shot, the more concrete the nouns.", source: T("prompting") }
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
        { term: "orbit", source: T("camera-movement"), move: "orbit", phrase: "The camera orbits slowly around the subject and ends facing it." },
        { term: "handheld", source: T("camera-movement"), move: "handheld", phrase: "Handheld camera, following the subject closely." },
        { term: "push in, pull back, track, tilt, pan, over-the-shoulder, crane", source: T("camera-movement") },
        { term: "say where a described move ends", source: T("camera-movement") }
      ],
      source: s
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
      Ao,
      "Frame count = duration × fps (e.g. 6 s at 24 fps is 144 frames, not 8k+1).",
      "Seed: no request field; the response returns one.",
      "settings.audio has no stated default.",
      "Audio input: the schema says 2-10 s on Pro; the audio-driven guide says 2 to 20 s.",
      "The model description says up to 4K; the Pro schema allows 1080p at most."
    ]
  };
}
const Ns = Uo(Eo, 10), re = Uo(Cs, 20), Os = {
  ...re,
  id: "ltx-2.5-fast",
  name: "LTX-2.5 Fast",
  air: "lightricks:ltx@2.5-fast",
  inputs: { ...re.inputs, sourceVideo: M(re.sources.schema) },
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
      ...Po,
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
    Ao,
    "No Fast guides: prompting and camera rules are from the LTX-2.5 Pro guides, which say Fast shares the prompt structure.",
    "When width or height is sent, or fps is 48/50, duration must be at most 10 s; the page's own 12 s example at 1280×720 breaks this.",
    "Seed: no request field; the response returns one.",
    "settings.audio has no stated default."
  ]
}, ze = "minimax-h3", Ee = we(ze), _ = ve(ze), R = (e) => Re(ze, e), tt = V({ sidePx: $(256, 5760), maxBytesEach: 30 * O, aspect: $(0.4, 2.5) }), Dt = V({ secondsEach: $(2, 15), secondsTotalMax: 15, maxBytesEach: 15 * O }), Ds = {
  id: "h3",
  name: "MiniMax H3",
  lab: "MiniMax",
  air: "minimax:h3@0",
  slug: ze,
  verifiedOn: "2026-11-10",
  sources: {
    model: Ee,
    schema: _,
    guides: [
      { title: "Generating video", url: R("generating-video") },
      { title: "Reference-driven consistency", url: R("reference-driven-consistency") },
      { title: "Motion, camera and performance", url: R("motion-camera-performance") },
      { title: "First and last frame", url: R("first-and-last-frame") },
      { title: "Editing video", url: R("editing-video") },
      { title: "Sound and voice", url: R("sound-and-voice") }
    ]
  },
  inputs: {
    firstFrame: S("inputs.frameImages", 1, R("first-and-last-frame"), tt),
    lastFrame: S("inputs.frameImages", 1, R("first-and-last-frame"), tt),
    keyframes: M(_, "frameImages holds at most two items (first and last)."),
    referenceImages: S("inputs.referenceImages", 9, _, tt, "The guide advises two well-described images over nine loose ones."),
    referenceVideos: S(
      "inputs.referenceVideos",
      3,
      _,
      V({
        secondsEach: $(2, 15),
        secondsTotalMax: 15,
        sidePx: $(256, 5760),
        fps: $(23.976, 60),
        maxBytesEach: 50 * O,
        aspect: $(0.4, 2.5)
      }),
      "Reference videos and reference audios share the 15 s total. Edits also go through this field."
    ),
    referenceAudios: S("inputs.referenceAudios", 3, _, Dt, "Needs a reference image or video beside it."),
    sourceVideo: M(_, "No inputs.video; the editing guide passes the clip to edit as a reference video."),
    audioToVideo: S("inputs.referenceAudios", 3, _, Dt, "Through reference audio, beside an image or video reference."),
    elements: M(_)
  },
  combinations: [
    {
      id: "frames-alone",
      text: "frameImages cannot be used with reference images, videos or audios.",
      when: ["firstFrame"],
      forbidsInputs: ["referenceImages", "referenceVideos", "referenceAudios"],
      source: Ee
    },
    {
      id: "audio-needs-visual",
      text: "Reference audio needs a reference image or a reference video beside it.",
      when: ["referenceAudios"],
      requiresOneOf: ["referenceImages", "referenceVideos"],
      source: Ee
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
      source: R("reference-driven-consistency")
    },
    rules: [
      { text: "Give each reference a role by its number and say which features to keep.", source: R("reference-driven-consistency") },
      { text: "For motion transfer, name the reference and describe the subject, not the move.", source: R("motion-camera-performance") },
      { text: "Write like a cinematographer: camera move, lens, light, pace.", source: R("generating-video") },
      { text: "Describe the picture first, then close with a Sound: clause tied to moments with as, when, then.", source: R("sound-and-voice") },
      { text: "With anchor frames, prompt only the motion and the sound.", source: R("first-and-last-frame") }
    ],
    seed: { supported: !0, max: 4294967295, source: _ },
    negativePrompt: !1
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "locked tripod", source: Ee, move: "static", phrase: "Locked tripod; the camera does not move." },
      { term: "push-in", source: R("generating-video"), move: "push-in", phrase: "Slow cinematic push-in on the subject." },
      { term: "tracking shot", source: R("generating-video"), move: "track-left", phrase: "Slow tracking shot moving left alongside the subject." },
      { term: "tracking shot", source: R("generating-video"), move: "track-right", phrase: "Slow tracking shot moving right alongside the subject." },
      { term: "orbit", source: R("motion-camera-performance"), move: "orbit", phrase: "Smooth cinematic orbit around the subject." },
      { term: "handheld drift", source: R("first-and-last-frame"), move: "handheld", phrase: "Gentle handheld drift." },
      { term: "low-angle dolly-in", source: R("generating-video") },
      { term: "pan", source: R("sound-and-voice") },
      { term: "lens focal length (85mm, 50mm)", source: R("sound-and-voice") }
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
    source: Ee
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
}, We = "bytedance-seedance-2-5", ot = we(We), se = ve(We), E = (e) => Re(We, e), st = V({ sidePx: $(300, 6e3), maxBytesEach: 30 * O, aspect: $(0.4, 2.5) }), Bs = V({ secondsEach: $(2, 30), secondsTotalMax: 30, sidePx: $(300, 6e3), maxBytesEach: 200 * O, aspect: $(0.4, 2.5) }), Bt = V({ secondsEach: $(2, 30), secondsTotalMax: 30, maxBytesEach: 15 * O }), nt = (e, t) => t.map(([o, s, n]) => ({ label: `${e} (${o})`, width: s, height: n })), Gs = {
  id: "seedance-2.5",
  name: "Seedance 2.5",
  lab: "ByteDance",
  air: "bytedance:seedance@2.5",
  slug: We,
  verifiedOn: "2026-11-10",
  sources: {
    model: ot,
    schema: se,
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
    firstFrame: S("inputs.frameImages", 1, E("image-to-video"), st),
    lastFrame: S("inputs.frameImages", 1, E("image-to-video"), st, "Only beside a first frame; a last frame alone is rejected."),
    keyframes: M(se, "frameImages holds at most two items (first and last)."),
    referenceImages: S("inputs.referenceImages", 30, se, st, "The guide calls 1-8 the stable band."),
    referenceVideos: S("inputs.referenceVideos", 10, se, Bs, "The guide calls 1-5 the stable band, each about 5-10 s."),
    referenceAudios: S("inputs.referenceAudios", 10, se, Bt, "Audio can be used on its own."),
    sourceVideo: S(
      "inputs.video",
      1,
      E("editing"),
      V({ secondsEach: $(2, 30), sidePx: $(300, 6e3), maxBytesEach: 200 * O, aspect: $(0.4, 2.5) }),
      "Edit or extend; settings.operation picks, or the prompt decides."
    ),
    audioToVideo: S("inputs.referenceAudios", 10, ot, Bt, "Audio-to-video runs through reference audio; there is no separate driving-audio field."),
    elements: M(se)
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
      ...nt("480p", [["~16:9", 854, 480], ["~4:3", 752, 560], ["1:1", 640, 640], ["~3:4", 560, 752], ["~9:16", 480, 854], ["~21:9", 992, 432]]),
      ...nt("720p", [["16:9", 1280, 720], ["4:3", 1112, 834], ["1:1", 960, 960], ["3:4", 834, 1112], ["9:16", 720, 1280], ["21:9", 1470, 630]]),
      ...nt("1080p", [["16:9", 1920, 1080], ["4:3", 1664, 1248], ["1:1", 1440, 1440], ["3:4", 1248, 1664], ["9:16", 1080, 1920], ["~21:9", 2206, 946]])
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: !0, toggle: "settings.audio" },
    source: se
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
    seed: { supported: !0, max: 2147483647, source: se },
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
    source: ot,
    note: "Which inputs bill at the Video-to-Video rate (a source video, reference videos, or both) is not stated."
  },
  notes: [
    "Output fps: not stated. Frame-count rule: not stated.",
    "Rack focus: not stated in the guide's camera vocabulary.",
    "The prompting guide says there is no 1080p output; the schema and model page offer 1080p. The schema is followed.",
    "Prompt limit: the guide says 10,000 characters, the schema 50,000.",
    "Seed maximum is 2^31-1 while the text says random seeds use the unsigned 32-bit range."
  ]
}, Oe = [
  ce,
  Z,
  Gs,
  Ds,
  Ns,
  Os,
  Vs
];
function Ro(e) {
  const t = Oe.find((o) => o.id === e || o.air === e || o.slug === e);
  if (!t) throw new Error(`No spec for "${e}". Known: ${Oe.map((o) => o.id).join(", ")}.`);
  return t;
}
const _s = {
  "first-frame": "firstFrame",
  "last-frame": "lastFrame",
  keyframe: "keyframes"
}, Gt = ["firstFrame", "lastFrame", "keyframes"];
function Ks(e, t) {
  return t.kind === "image" ? _s[t.role] ?? "referenceImages" : t.kind === "video" ? t.role === "source" ? "sourceVideo" : "referenceVideos" : e.inputs.referenceAudios.supported || !e.inputs.audioToVideo.supported ? "referenceAudios" : "audioToVideo";
}
function zs(e, t, o) {
  const s = [], n = [];
  let r = [];
  const i = (u, p) => {
    r = r.filter((h) => h !== u), s.push({ ref: u.ref.id, role: u.ref.role, wanted: u.convertedFrom ?? u.input, reason: p });
  }, d = (u) => r.some((p) => p.input === u), a = (u) => r.filter((p) => p.input === u).length, l = (u, p) => {
    u.convertedFrom || (u.convertedFrom = u.input), u.input = "referenceImages", n.push(`${u.ref.id}: sent as a reference image because ${p}`);
  };
  for (const u of t.references) {
    const p = Ks(e, u), h = { ref: u, input: p };
    if (!e.inputs[p].supported) {
      s.push({ ref: u.id, role: u.role, wanted: p, reason: `${e.name} takes no ${_t(p)}.` });
      continue;
    }
    const w = e.inputs[p].maxCount;
    if (w !== null && a(p) >= w) {
      s.push({ ref: u.id, role: u.role, wanted: p, reason: `${e.name} takes at most ${w} ${_t(p)}.` });
      continue;
    }
    r.push(h);
  }
  const m = e.camera.kind === "parameter" ? e.camera.field : null;
  for (let u = 0; u < 4; u++)
    for (const p of e.combinations) {
      if (p.when.length === 0 || !p.when.every(d)) continue;
      const h = r.filter((f) => p.when.includes(f.input));
      if (m && p.forbidsParams?.includes(m) && (o.prefer ?? "camera-parameter") === "camera-parameter" && Mo(e, t.camera)) {
        for (const f of h) i(f, `${p.text} The camera parameter was kept.`);
        continue;
      }
      const w = r.filter((f) => p.forbidsInputs?.includes(f.input));
      if (w.length) {
        const f = e.inputs.referenceImages.supported;
        if (f && h.every((g) => Gt.includes(g.input)) && !w.every((g) => g.input === "referenceImages" && !g.convertedFrom))
          for (const g of h) l(g, `${e.name} does not take a frame beside references (${p.id}).`);
        else if (f && !p.forbidsInputs?.includes("referenceImages") && w.every((g) => Gt.includes(g.input)))
          for (const g of w) l(g, `frame images are not allowed here (${p.id}).`);
        else
          for (const g of w) i(g, p.text);
      }
      if (p.requiresExactly) {
        const { input: f, count: g } = p.requiresExactly;
        for (const b of r.filter((y) => y.input === f).slice(g)) i(b, p.text);
        if (a(f) < g) for (const b of r.filter((y) => p.when.includes(y.input))) i(b, p.text);
      }
      if (p.requiresOneOf && !p.requiresOneOf.some(d))
        for (const f of r.filter((g) => p.when.includes(g.input))) i(f, p.text);
    }
  for (const u of e.combinations) {
    if (!u.sharedMax) continue;
    const p = r.filter((h) => u.sharedMax.inputs.includes(h.input));
    for (const h of p.slice(u.sharedMax.max)) i(h, u.text);
  }
  return { slots: r, dropped: s, notes: n };
}
function Mo(e, t) {
  return e.camera.kind === "parameter" ? e.camera.values.find((o) => o.move === t)?.value : void 0;
}
const Ws = {
  firstFrame: "first frame",
  lastFrame: "last frame",
  keyframes: "keyframes",
  referenceImages: "reference images",
  referenceVideos: "reference video",
  referenceAudios: "reference audio",
  sourceVideo: "source video",
  audioToVideo: "driving audio",
  elements: "elements"
}, _t = (e) => Ws[e];
function Hs(e, t) {
  const o = /* @__PURE__ */ new Map(), { style: s, tokens: n } = e.prompting.addressing, r = (a) => n.find((l) => l.input === a)?.pattern, i = (a) => a.flatMap((l) => t.filter((m) => m.input === l)), d = (a, l) => {
    const m = r(l);
    a.forEach((u, p) => o.set(u, m ? m.replace("{n}", String(p + 1)) : null));
  };
  for (const a of t) o.set(a, null);
  return s === "tags" ? (d(i(["firstFrame", "lastFrame", "keyframes", "referenceImages"]), "image"), d(i(["sourceVideo", "referenceVideos"]), "video")) : (s === "at-mentions" || s === "plain-words") && (d(i(["referenceImages"]), "image"), d(i(["referenceVideos"]), "video"), d(i(["referenceAudios"]), "audio")), o;
}
function Xs(e, t, o) {
  const s = e.output.durations;
  let n;
  return s.kind === "range" ? n = Math.min(s.max, Math.max(s.min, Math.round(t))) : n = s.values.reduce((r, i) => Math.abs(i - t) < Math.abs(r - t) ? i : r), n !== t && o.push(`Duration ${t} s is not offered; ${n} s is sent.`), n;
}
function Js(e, t, o = {}) {
  const s = typeof e == "string" ? Ro(e) : e, { slots: n, dropped: r, notes: i } = zs(s, t, o), d = Hs(s, n), a = n.map((b) => ({
    ref: b.ref.id,
    role: b.ref.role,
    input: b.input,
    field: s.inputs[b.input].field,
    address: d.get(b) ?? null,
    ...b.convertedFrom ? { convertedFrom: b.convertedFrom } : {}
  })), l = {}, m = Mo(s, t.camera), u = s.camera.kind === "parameter" ? s.camera.forbiddenWith.some((b) => a.some((y) => y.input === b)) : !0, p = a.some((b) => b.input === "referenceVideos" && b.role === "motion");
  let h;
  if (t.camera === "guide") {
    const b = a.find((y) => y.input === "referenceVideos" && y.role === "motion");
    if (b) {
      const y = s.prompting.addressing.style === "at-mentions" && b.address ? `Camera: follow the camera move of ${b.address}.` : null;
      i.push("The camera comes from the guide video: its camera path and pacing, named in the guide reference; no camera move is written."), h = { move: "guide", mode: "guide-video", text: y };
    } else
      i.push("No guide video reaches this model, so no camera move is written; set shot.camera to choose one."), h = { move: "guide", mode: "prompt", text: null };
  } else if (s.camera.kind === "parameter" && m && !u)
    l[s.camera.field] = m, h = { move: t.camera, mode: "parameter", field: s.camera.field, value: m, text: null };
  else {
    const b = Rs(s, t.camera, t.focus);
    b.note && i.push(b.note), s.camera.kind === "parameter" && !m && i.push(`${s.camera.field} has no value for "${t.camera}"; the move is written into the prompt.`), s.camera.kind === "parameter" && m && u && i.push(`${s.camera.field} is not allowed beside these inputs; the move is written into the prompt.`);
    const y = p && s.prompting.addressing.style === "tags";
    y && i.push("The guide video carries the camera path; the prompt references it instead of describing the move."), h = { move: t.camera, mode: p ? "guide-video" : "prompt", text: y ? null : b.text };
  }
  const w = a.some((b) => b.input === "audioToVideo"), f = Xs(s, t.duration, i);
  w ? i.push("Audio-driven: no duration is sent; the clip runs as long as the audio.") : l.duration = f;
  const g = js(s, t, a, h);
  return s.prompting.maxChars !== null && g.length > s.prompting.maxChars && i.push(`The prompt is ${g.length} characters; ${s.name} takes ${s.prompting.maxChars}.`), {
    model: s.id,
    name: s.name,
    prompt: g,
    params: l,
    camera: h,
    used: a,
    dropped: r,
    cannotTake: ls.filter((b) => !s.inputs[b].supported),
    duration: { requested: t.duration, sent: f },
    notes: i
  };
}
class To extends Error {
  constructor(t) {
    super(t), this.name = "FitError";
  }
}
function Pe(e, t, o, s) {
  const n = [], r = o.info;
  if (!r) return n;
  const { width: i, height: d, seconds: a, fps: l, bytes: m } = r, u = /image/.test(t);
  return s.minSide && i && d && (i < s.minSide || d < s.minSide) && n.push(
    `${e} needs ${t} at least ${s.minSide} px on each side; ${o.name} is ${i}×${d}. ` + (u ? `Use a larger image: export or resize it so its shorter side is at least ${s.minSide} px (1024 px is a safe size).` : `Scale it first, e.g. ffmpeg -i in.mp4 -vf scale=-2:${s.minSide <= 720 ? 720 : s.minSide} -c:a copy out.mp4`)
  ), s.maxSide && i && d && (i > s.maxSide || d > s.maxSide) && n.push(`${e} takes ${t} up to ${s.maxSide} px a side; ${o.name} is ${i}×${d}.${u ? ` Resize it so its longer side is ${s.maxSide} px or less.` : ""}`), s.minRatio && i && d && (i / d < s.minRatio || i / d > (s.maxRatio ?? 1 / 0)) && n.push(
    `${e} takes ${t} with aspect ${s.minRatio}-${s.maxRatio}; ${o.name} is ${(i / d).toFixed(2)}.${u ? " Crop it closer to square: no side more than 2.5 times the other." : ""}`
  ), a !== void 0 && s.minSeconds !== void 0 && a < s.minSeconds && n.push(`${e} needs ${t} of at least ${s.minSeconds} s; ${o.name} is ${a.toFixed(2)} s.`), a !== void 0 && s.maxSeconds !== void 0 && a > s.maxSeconds && n.push(`${e} takes ${t} up to ${s.maxSeconds} s; ${o.name} is ${a.toFixed(2)} s. Trim it first.`), l && s.minFps && (l < s.minFps || l > (s.maxFps ?? 1 / 0)) && n.push(`${e} takes ${t} at ${s.minFps}-${s.maxFps} fps; ${o.name} is ${l} fps.`), m && s.maxBytes && m > s.maxBytes && n.push(
    `${e} takes ${t} up to ${Math.round(s.maxBytes / 1048576)} MB; ${o.name} is ${(m / 1048576).toFixed(1)} MB.${u ? " Save it as a JPEG or at a smaller size." : ""}`
  ), n;
}
const Kt = (e) => e.reduce((t, o) => t === void 0 || o.info?.seconds === void 0 ? void 0 : t + o.info.seconds, 0);
function Fo(e, t, o, s, n = !1) {
  const r = t.sharedSeconds?.max, i = Kt(o), d = Kt(s);
  if (r === void 0 || !s.length || i === void 0 || d === void 0 || i + d <= r) return { drop: !1 };
  const a = (l) => `${Math.round(l * 100) / 100} s`;
  return n ? {
    drop: !1,
    problem: `${e} takes reference video and audio up to ${r} s together; got ${a(i)} of video and ${a(d)} of audio, and the audio is required. Use a guide of ${a(Math.max(0, r - d))} or less, or allow the lane to run without the separate audio.`
  } : {
    drop: !0,
    note: `Music not sent to ${e}: video and audio together may not exceed ${r} s; timing comes from the guide video (${a(i)} of video, ${a(d)} of audio).`
  };
}
function Ys(e, t) {
  const o = t.modelName, s = { referenceVideos: [], referenceAudios: [], referenceImages: [], frameImages: [], notes: [] }, n = [], { guideVideo: r, firstFrame: i, character: d, environment: a, audio: l, keyframes: m = [] } = t, u = (p) => n.push(p);
  if (e.approach === "reference-video" || e.approach === "router") {
    !r && e.approach === "reference-video" && u(`${o} is a reference-video lane; pass the guide clip.`), r && (!e.referenceVideos && e.approach === "reference-video" ? u(`${o} takes no reference video.`) : (e.referenceVideos && n.push(...Pe(o, "reference videos", r, e.referenceVideos)), s.referenceVideos.push(r))), d && (e.referenceImages ? (n.push(...Pe(o, "reference images", d, e.referenceImages)), s.referenceImages.push(d)) : u(`${o} takes no reference image for the character.`)), a && (e.referenceImages ? (n.push(...Pe(o, "reference images", a, e.referenceImages)), s.referenceImages.push(a)) : u(`${o} takes no reference image for the environment.`)), i && (e.startFrameWithReferences && e.frameImages ? s.frameImages.push({ media: i, frame: "first" }) : e.referenceImages ? (s.referenceImages.push(i), s.notes.push(
      `${o} refuses a start frame beside reference videos, so the first frame goes in as an image reference.`
    )) : u(`${o} cannot take the first frame with a reference video.`)), l && (e.referenceAudios ? (n.push(...Pe(o, "reference audio", l, e.referenceAudios)), s.referenceAudios.push(l)) : u(`${o} takes no reference audio; drop --audio for this lane.`));
    const p = Fo(o, e, s.referenceVideos, s.referenceAudios, t.requireAudio);
    p.problem && u(p.problem), p.drop && (s.referenceAudios = [], s.notes.push(p.note)), m.length && u(`${o} is fed the whole clip; keyframes belong to the FLUX 3 Video lane.`);
  } else if (e.approach === "audio-first-frame")
    d && u(`${o} takes no character reference beside a guide; pass the still as --first-frame instead.`), a && u(`${o} takes one image only; pass the environment still as --first-frame instead.`), r && u(`${o} takes no reference video. Pass --audio and --first-frame instead of --guide.`), m.length && u(`${o} takes a first frame (and optionally a last), not keyframes.`), l ? e.drivingAudio ? (i || u(`${o} needs a reference image beside the audio; pass --first-frame.`), n.push(...Pe(o, "audio", l, e.drivingAudio)), s.drivingAudio = l, i && (s.referenceImages.push(i), s.notes.push(
      `${o} with audio takes the still as inputs.referenceImages (its schema forbids frameImages beside audio); the clip length follows the audio.`
    ))) : u(`${o} takes no audio input.`) : i ? s.frameImages.push({ media: i, frame: "first" }) : u(`${o} needs --first-frame (and --audio for the audio-driven mode).`);
  else {
    r && u(`${o} uses its video input only to extend a clip; send keyframes or a first frame instead.`), l && u(`${o} takes no audio input.`), (d || a) && u(`${o} takes no reference images; pass the still as --first-frame instead.`), i && s.frameImages.push({ media: i, frame: "first" });
    for (const p of m)
      typeof p.frame == "number" && !e.frameImages?.indexPositions && u(`${o} only places frames first or last.`), s.frameImages.push(p);
    s.frameImages.length || u(`${o} needs --first-frame or keyframes.`);
  }
  if (e.frameImages && s.frameImages.length > e.frameImages.max && u(`${o} takes at most ${e.frameImages.max} frame images; got ${s.frameImages.length}.`), e.referenceImages && s.referenceImages.length > e.referenceImages.max && u(`${o} takes at most ${e.referenceImages.max} reference images.`), n.length) throw new To(n.join(`
`));
  return s;
}
const ye = (e) => `https://runware.ai/docs/models/${e}/schema.json`, ie = { max: 10, minSide: 300, maxBytes: 31457280, minRatio: 0.4, maxRatio: 2.5 }, Ce = {
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
    referenceImages: ie,
    frameImages: { ...ie, indexPositions: !1 },
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
  schemaUrl: ye("klingai-video-4-0")
}, rt = Z.inputs.referenceVideos.limits, Zs = {
  ...Ce,
  key: Z.id,
  air: Z.air,
  slug: Z.slug,
  name: Z.name,
  caps: {
    ...Ce.caps,
    referenceVideos: {
      ...Ce.caps.referenceVideos,
      minSeconds: rt.secondsEach.min,
      maxSeconds: rt.secondsEach.max,
      totalMaxSeconds: rt.secondsTotalMax
    },
    frameImages: { ...ie, max: Z.inputs.firstFrame.maxCount, indexPositions: !1 }
  },
  duration: { kind: "range", min: 3, max: 20, auto: !1 },
  resolutions: void 0,
  defaultResolution: "720p",
  rates: Z.pricing.rates.map((e) => ({
    usdPerSecond: e.usdPerSecond,
    label: e.label,
    resolution: e.tier,
    videoInput: e.mode === "video-input"
  })),
  schemaUrl: Z.sources.schema
}, Qs = {
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
    referenceImages: { ...ie, max: 30, maxSide: 6e3 },
    frameImages: { ...ie, max: 2, maxSide: 6e3, indexPositions: !1 },
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
  schemaUrl: ye("bytedance-seedance-2-5")
}, qs = {
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
    referenceImages: { ...ie, max: 9, minSide: 256, maxSide: 5760 },
    frameImages: { ...ie, max: 2, minSide: 256, maxSide: 5760, indexPositions: !1 },
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
  schemaUrl: ye("minimax-h3")
}, en = ["dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "static", "focus_shift"], ut = {
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
  cameraMovements: en,
  rates: [
    { usdPerSecond: 0.12, label: "720p", resolution: "720p" },
    { usdPerSecond: 0.17, label: "1080p", resolution: "1080p" }
  ],
  schemaUrl: ye("lightricks-ltx-2-5-pro")
}, tn = {
  ...ut,
  key: "ltx-2.5-fast",
  air: "lightricks:ltx@2.5-fast",
  slug: "lightricks-ltx-2-5-fast",
  name: "LTX-2.5 Fast",
  caps: { ...ut.caps, drivingAudio: { max: 1, minSeconds: 2, maxSeconds: 20 } },
  duration: { kind: "enum", values: [6, 8, 10, 12, 14, 16, 18, 20], auto: !0 },
  rates: [
    { usdPerSecond: 0.09, label: "720p", resolution: "720p" },
    { usdPerSecond: 0.13, label: "1080p", resolution: "1080p" }
  ],
  schemaUrl: ye("lightricks-ltx-2-5-fast")
}, on = {
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
  schemaUrl: ye("bfl-flux-3-video")
}, sn = {
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
}, zt = [Ce, Zs, Qs, qs, ut, tn, on, sn];
function $t(e) {
  const t = zt.find((o) => o.key === e || o.air === e || o.slug === e);
  if (!t) throw new Error(`Unknown model "${e}". Use one of: ${zt.map((o) => o.key).join(", ")}.`);
  return t;
}
const nn = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, Lo = (e, t) => `{{upload:${e}:${t.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80)}}}`;
function rn() {
  return globalThis.crypto.randomUUID();
}
class x extends Error {
  constructor(t) {
    super(t), this.name = "PlanError";
  }
}
function an(e, t) {
  if (t === "auto") {
    if (!e.duration.auto) throw new x(`${e.name} needs a whole number of seconds; "auto" is not in its schema.`);
    return;
  }
  if (!Number.isInteger(t)) throw new x(`Duration must be a whole number of seconds; got ${t}.`);
  if (e.duration.kind === "range" && (t < e.duration.min || t > e.duration.max))
    throw new x(`${e.name} makes ${e.duration.min}-${e.duration.max} s clips; got ${t}.`);
  if (e.duration.kind === "enum" && !e.duration.values.includes(t))
    throw new x(`${e.name} makes clips of ${e.duration.values.join(", ")} s only; got ${t}.`);
}
function dn(e, t, o) {
  const s = e.rates.filter((r) => r.resolution === t);
  return s.find((r) => r.videoInput === void 0 || r.videoInput === o) ?? s[0] ?? e.rates.reduce((r, i) => i.usdPerSecond > r.usdPerSecond ? i : r, e.rates[0]);
}
const cn = (e) => e.duration.kind === "range" ? e.duration.max : Math.max(...e.duration.values);
function ln(e, t) {
  if (e.key === "auto")
    return { usd: t.maxPrice ?? null, basis: "router: capped server-side by routing.maxPrice" };
  const o = t.seconds === "auto" ? cn(e) : t.seconds, s = dn(e, t.resolution, t.videoInput);
  let n = s.usdPerSecond * o, r = `${s.label} at $${s.usdPerSecond}/s × ${o} s${t.seconds === "auto" ? " (auto: bounded by the longest clip)" : ""}`;
  if (e.inputVideoUsdPerSecond && t.videoInput) {
    const i = t.inputVideoSeconds ?? e.caps.referenceVideos?.totalMaxSeconds ?? 15;
    n += e.inputVideoUsdPerSecond * i, r += ` + input video $${e.inputVideoUsdPerSecond}/s × ${i.toFixed(2)} s`;
  }
  return e.key === "h3" && (t.images ?? 0) > 5 && (n += 0.04 * ((t.images ?? 0) - 5), r += " + $0.04 per image beyond five"), { usd: Math.round(n * 1e4) / 1e4, basis: r };
}
function jo(e, t = rn()) {
  const o = $t(e.model), s = e.prompt.trim();
  if (s.length < o.prompt.min || s.length > o.prompt.max)
    throw new x(`${o.name} takes a prompt of ${o.prompt.min}-${o.prompt.max} characters.`);
  if (o.key === "auto" && !(e.routing && e.routing.maxPrice > 0))
    throw new x("The router lane needs a price cap (routing.maxPrice / --max-price).");
  let n;
  try {
    n = Ys(o.caps, {
      modelName: o.name,
      guideVideo: e.guideVideo,
      firstFrame: e.firstFrame,
      character: e.character,
      environment: e.environment,
      requireAudio: e.requireAudio,
      audio: e.audio,
      keyframes: e.keyframes
    });
  } catch (g) {
    throw g instanceof To ? new x(g.message) : g;
  }
  const r = [], i = [], d = (g, b, y) => {
    if (i.push({
      role: b,
      src: g.displaySrc ?? g.name,
      label: g.name,
      ...y !== void 0 ? { frame: y } : {}
    }), nn.test(g.ref) || /^https:\/\//.test(g.ref)) return g.ref;
    if (!/^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(g.ref))
      throw new x(`${g.name}: media must be an https URL, a media UUID or a data URI.`);
    const U = r.find((te) => te.media === g);
    if (U) return U.placeholder;
    const F = Lo(r.length + 1, g.name);
    return r.push({ placeholder: F, media: g }), F;
  }, a = {};
  n.frameImages.length && (a.frameImages = n.frameImages.map((g) => ({ image: d(g.media, "frameImage", g.frame), frame: g.frame }))), n.referenceImages.length && (a.referenceImages = n.referenceImages.map((g) => d(g, "referenceImage"))), n.referenceVideos.length && (a.referenceVideos = n.referenceVideos.map((g) => d(g, "referenceVideo"))), n.referenceAudios.length && (a.referenceAudios = n.referenceAudios.map((g) => d(g, "referenceAudio"))), n.drivingAudio && (a.audio = d(n.drivingAudio, "audio"));
  const l = {
    taskType: "videoInference",
    taskUUID: t,
    model: o.air,
    positivePrompt: s
  }, m = !!n.drivingAudio, u = e.duration ?? (o.duration.kind === "range" ? Math.max(5, o.duration.min) : o.duration.values[0]);
  if (m) {
    if (e.duration !== void 0) throw new x(`${o.name} with audio takes its length from the audio; drop --duration.`);
  } else
    an(o, u), l.duration = u;
  let p = e.resolution ?? o.defaultResolution;
  if (o.resolutions) {
    if (p && !o.resolutions.includes(p))
      throw new x(`${o.name} resolutions: ${o.resolutions.join(", ")}.`);
    p && (l.resolution = p);
  } else if (o.sizes)
    if (m) p = "1080p";
    else {
      const g = p ? o.sizes[p] : void 0;
      if (!g) throw new x(`${o.name} sizes: ${Object.keys(o.sizes).join(", ")}.`);
      l.width = g.width, l.height = g.height;
    }
  else if (o.key !== "auto") {
    if (e.resolution && e.resolution !== o.defaultResolution)
      throw new x(`${o.name} makes ${o.defaultResolution} only; the size follows the input.`);
  } else if (e.resolution) throw new x(`${o.name}: resolution is not set on the router lane; describe it in --requirements.`);
  if (Object.keys(a).length && (l.inputs = a), e.camera !== void 0) {
    if (!o.cameraMovements)
      throw new x(`${o.name} declares no camera parameter in its schema; describe the camera in the prompt.`);
    if (!o.cameraMovements.includes(e.camera))
      throw new x(`${o.name} camera movements: ${o.cameraMovements.join(", ")}.`);
    if (m) throw new x(`${o.name} forbids cameraMovement beside audio.`);
    l.settings = { cameraMovement: e.camera };
  }
  if (o.key === "auto" && e.routing) {
    const g = { maxPrice: e.routing.maxPrice };
    if (e.routing.requirements) {
      if (e.routing.requirements.length > 3e3) throw new x("routing.requirements is limited to 3000 characters.");
      g.requirements = e.routing.requirements;
    }
    e.routing.preferences && (g.preferences = e.routing.preferences), l.routing = g;
  }
  l.deliveryMethod = "async", l.includeCost = !0;
  const h = n.referenceVideos.length > 0, w = ln(o, {
    resolution: p,
    seconds: m ? n.drivingAudio?.info?.seconds ?? o.caps.drivingAudio?.maxSeconds ?? 10 : u,
    videoInput: h,
    inputVideoSeconds: n.referenceVideos.reduce(
      (g, b) => b.info?.seconds === void 0 || g === void 0 ? void 0 : g + b.info.seconds,
      0
    ),
    images: n.referenceImages.length + n.frameImages.length,
    maxPrice: e.routing?.maxPrice
  }), f = [...n.notes];
  return o.prompt.tokens && f.push(`${o.name} prompt tokens for inputs: ${o.prompt.tokens}.`), {
    provider: "runware-api",
    modelId: o.air,
    modelName: o.name,
    uploads: r,
    task: l,
    inputsSent: i,
    firstFrameVariant: e.firstFrame ? e.firstFrameVariant ?? "A" : "C",
    estimate: w,
    notes: f
  };
}
function Vo(e, t) {
  const o = JSON.stringify(e).replace(/\{\{upload:\d+:[^}]*\}\}/g, (s) => {
    const n = t.get(s);
    if (!n) throw new Error(`No media id for ${s}.`);
    return n;
  });
  return JSON.parse(o);
}
const he = ["kling-4", "seedance-2.5", "h3", "ltx-2.5"], un = ["kling-4", "seedance-2.5", "h3"], it = (e, t) => e && (e.min !== null || e.max !== null) ? `${e.min ?? 0}-${e.max ?? "any"} ${t}` : null, at = (e, t, o) => {
  const s = e.prompting.addressing.tokens.find((n) => n.input === t);
  return s ? ` ${s.pattern.replace("{n}", String(o))}` : "";
};
function mn(e, t) {
  if (t === "audio-first-frame") {
    const a = it(e.inputs.audioToVideo.limits?.secondsEach, "s");
    return `Audio + first frame only: does not use the guide video. Takes the guide's audio${a ? ` (${a})` : ""} and exactly one image: frame 0, your character sheet or your environment image, not both. The clip runs as long as the audio.`;
  }
  const o = e.inputs.referenceVideos.limits, s = [it(o?.secondsEach, "s"), o?.sidePx?.min ? `${o.sidePx.min}+ px a side` : null, it(o?.fps, "fps")].filter(Boolean).join(", "), n = $t(e.id).caps.sharedSeconds?.max, r = e.inputs.referenceAudios.supported ? `its audio as reference audio${n ? ` when clip and audio fit ${n} s together` : ""}` : "no audio input", i = e.inputs.referenceImages, d = i.supported ? `; up to ${i.maxCount ?? "several"} reference images beside it: character sheet${at(e, "image", 1)}, environment${at(e, "image", 2)}` : "; no reference images";
  return `The whole guide clip as a reference video${at(e, "video", 1)} (${s}); ${r}${d}.`;
}
function pn(e) {
  const t = e.sources.guides;
  return t.find((o) => /prompt/i.test(o.title)) ?? t[0] ?? { title: "Model page", url: e.sources.model };
}
function kt(e) {
  if (!he.includes(e))
    throw new x(`The generate flow offers ${he.join(", ")}; "${e}" is not one of them.`);
  const t = Ro(e), o = t.inputs.referenceVideos.supported ? "guide-video" : "audio-first-frame";
  return { key: e, name: t.name, use: o, line: mn(t, o), guide: pn(t) };
}
const Co = () => he.map(kt);
function fn(e, t, o) {
  const s = kt(t), n = [], r = [];
  if (s.use === "guide-video") {
    r.push({ id: "guide", kind: "video", role: "motion" }), o.hasCharacter && r.push({ id: "character", kind: "image", role: "character", replaces: "the figure in the guide" }), o.hasEnvironment && r.push({ id: "environment", kind: "image", role: "setting", replaces: "the guide's background" });
    const d = o.hasAudio ? Fo(s.name, $t(s.key).caps, [{ name: "guide", info: { seconds: o.seconds, hasAudio: o.audioInVideo } }], [{ name: "audio", info: { seconds: o.audioSeconds ?? o.seconds } }], o.requireAudio) : { drop: !1 };
    if (d.problem) throw new x(d.problem);
    d.drop ? n.push(d.note) : o.hasAudio && r.push({ id: "audio", kind: "audio", role: "soundtrack" });
  } else {
    if (o.hasCharacter && o.hasEnvironment)
      throw new x(`${s.name} takes exactly one image beside the audio: send the character sheet or the environment image, not both.`);
    r.push({ id: o.hasCharacter ? "character" : o.hasEnvironment ? "environment" : "frame0", kind: "image", role: "first-frame" }), o.hasAudio && r.push({ id: "audio", kind: "audio", role: "soundtrack" });
  }
  return { shot: {
    subject: e.subject,
    action: e.action,
    ...e.environment ? { environment: e.environment } : {},
    ...e.legend ? { legend: e.legend } : {},
    // With no camera named, the guide video carries it (and LTX, without one, gets no camera words).
    camera: e.camera ?? "guide",
    references: r,
    duration: Math.max(1, Math.round(o.seconds))
  }, notes: n };
}
function He(e, t, o) {
  const s = kt(t), { shot: n, notes: r } = fn(e, t, o), i = Js(t, n, s.use === "audio-first-frame" ? { prefer: "inputs" } : {});
  return { model: s, composed: i, shot: n, notes: r };
}
const hn = (e, t, o = un) => o.map((s) => He(e, s, t));
function ti(e, t, o = {}, s = {}) {
  const n = "manifest" in s ? s : void 0, r = {
    seconds: n ? n.seconds : s.seconds ?? 5,
    hasAudio: n ? !!n.audio : s.hasAudio ?? !0,
    audioInVideo: n ? n.meta.audioInVideo === !0 : s.audioInVideo,
    hasCharacter: !!o.character,
    hasEnvironment: !!o.environment
  }, i = He(e, t, r);
  return {
    model: i.model,
    prompt: i.composed.prompt,
    tags: i.composed.used.filter((d) => d.address).map((d) => ({ tag: d.address, input: d.ref })),
    dropped: i.composed.dropped.map((d) => `${d.ref}: ${d.reason}`),
    notes: [...i.notes, ...i.composed.notes],
    shot: i.shot
  };
}
const oi = () => Co();
function No(e, t) {
  const { guide: o, character: s, environment: n } = e, r = e.prompt?.trim() || void 0, i = e.shot ?? o.shot ?? (r ? { subject: r, action: "" } : void 0);
  if (!i || !i.subject.trim()) throw new x("Describe the shot (subject and action), or write a prompt.");
  const d = { seconds: o.seconds, hasAudio: !!o.audio, hasCharacter: !!s, hasEnvironment: !!n, audioInVideo: o.meta.audioInVideo === !0, audioSeconds: o.audio?.info?.seconds, requireAudio: e.requireAudio }, { model: a, composed: l, shot: m, notes: u } = He(i, e.model, d);
  if (a.use === "audio-first-frame" && !o.audio)
    throw new x(`${a.name} is driven by the guide's audio, and this bundle has no audio file.`);
  const p = { guide: o.video, audio: o.audio, character: s, environment: n, frame0: o.firstFrame }, h = { model: a.key, prompt: r ?? l.prompt };
  for (const g of l.used) {
    const b = p[g.ref];
    b && (g.role === "motion" ? h.guideVideo = b : g.role === "soundtrack" ? h.audio = b : g.role === "character" ? h.character = b : g.role === "setting" ? h.environment = b : g.role === "first-frame" && (h.firstFrame = b, h.firstFrameVariant = g.ref === "frame0" ? "A" : "B"));
  }
  typeof l.params.duration == "number" && (h.duration = l.params.duration);
  const w = l.params["settings.cameraMovement"];
  typeof w == "string" && (h.camera = w), e.resolution && (h.resolution = e.resolution), e.requireAudio && (h.requireAudio = !0);
  const f = jo(h, t);
  return {
    plan: f,
    request: h,
    composed: l,
    shot: m,
    ...r ? {} : { marker: fs(l) },
    model: a,
    notes: [...u, ...l.notes, ...f.notes]
  };
}
function gn(e) {
  const t = typeof e == "string" ? Number(e) : e;
  return typeof t == "number" && Number.isFinite(t) && t >= 0 ? t : null;
}
const bn = (e) => new Promise((t) => setTimeout(t, e));
function wn(e, t, o, s = "videoURL") {
  const n = o.filter((l) => l.taskUUID === e || !l.taskUUID);
  if (n.length) return { state: "error", error: new Q(200, n) };
  const r = t.filter((l) => l.taskUUID === e), i = r.find((l) => l.status === "success" || typeof l[s] == "string");
  if (i && typeof i[s] == "string")
    return {
      state: "success",
      result: {
        taskUUID: e,
        videoURL: i[s],
        ...typeof i.videoUUID == "string" ? { videoUUID: i.videoUUID } : {},
        cost: gn(i.cost),
        ...typeof i.seed == "number" ? { seed: i.seed } : {},
        ...typeof i.model == "string" ? { model: i.model } : {}
      }
    };
  const d = r.find((l) => l.status === "error");
  if (d) {
    const l = d.error ?? {};
    return {
      state: "error",
      error: new Q(200, [{ code: l.code ?? "error", message: l.message ?? "Task failed.", taskUUID: e }])
    };
  }
  const a = r.find((l) => l.status === "processing");
  return a ? { state: "processing", progress: typeof a.progress == "number" ? a.progress : void 0 } : { state: "absent" };
}
async function Oo(e, t, o = {}) {
  const s = o.sleep ?? bn, n = o.now ?? Date.now, r = o.timeoutMs ?? 45 * 6e4, i = n();
  let d = o.intervalMs ?? 2e3;
  const a = o.maxIntervalMs ?? 15e3;
  for (await s(o.initialDelayMs ?? 5e3); ; ) {
    if (o.signal?.aborted) throw new Error(`Stopped polling. Resume with taskUUID ${t}.`);
    const { data: l, errors: m } = await e.post([{ taskType: "getResponse", taskUUID: t }], o.signal), u = wn(t, l, m, o.urlField);
    if (u.state === "success") return u.result;
    if (u.state === "error") throw u.error;
    if (o.onProgress?.(u.state, u.state === "processing" ? u.progress : void 0), n() - i > r)
      throw new Error(`Still running after ${Math.round(r / 6e4)} min. Resume with taskUUID ${t}; do not resubmit.`);
    await s(d), d = Math.min(a, Math.round(d * 1.5));
  }
}
async function vn(e, t, o = {}) {
  const s = await Oo(e, t, { initialDelayMs: 1500, timeoutMs: 6e5, ...o, urlField: "imageURL" });
  return { taskUUID: t, imageURL: s.videoURL, cost: s.cost, ...s.seed !== void 0 ? { seed: s.seed } : {} };
}
async function yn(e, t, o, s, n) {
  if (s && s !== "auto") return s;
  if (t.modelId !== "auto") return t.modelId;
  try {
    const r = await e.taskDetails(o, n), i = Array.isArray(r?.request) ? r.request : [], d = i.find((a) => a.taskUUID === o)?.model ?? i[0]?.model;
    return typeof d == "string" && d !== "auto" ? d : null;
  } catch {
    return null;
  }
}
function xn(e) {
  const t = new Ne({ getKey: e.getKey, fetch: e.fetch });
  async function o(s, n, r, i) {
    const d = String(n.taskUUID), a = await Oo(t, d, {
      ...e.poll,
      signal: i.signal,
      onProgress: (m, u) => i.onProgress?.({ stage: "poll", message: m, progress: u })
    }), l = await yn(t, s, d, a.model, i.signal);
    return i.onProgress?.({ stage: "done", message: "done" }), {
      taskUUID: d,
      videoURL: a.videoURL,
      costUsd: a.cost,
      generationSeconds: (Date.now() - r) / 1e3,
      modelRan: l,
      task: n
    };
  }
  return {
    id: "runware-api",
    client: t,
    plan: (s) => jo(s),
    async run(s, n = {}) {
      const r = Date.now(), i = /* @__PURE__ */ new Map();
      for (const m of s.uploads) {
        n.onProgress?.({ stage: "upload", message: `uploading ${m.media.name}` });
        const { mediaUUID: u } = await t.upload(m.media.ref, n.signal);
        i.set(m.placeholder, u);
      }
      const d = Vo(s.task, i);
      n.onProgress?.({ stage: "submit", message: "submitting" });
      const { errors: a } = await t.post([d], n.signal), l = a.filter((m) => !m.taskUUID || m.taskUUID === d.taskUUID);
      if (l.length) throw new Q(400, l);
      return o(s, d, r, n);
    },
    /** Polls an already-submitted task without sending it again. */
    resume(s, n, r = {}) {
      return o(s, { ...s.task, taskUUID: n }, Date.now(), r);
    }
  };
}
class P extends Error {
  constructor(t, o, s) {
    super(o), this.code = t, this.taskUUID = s, this.name = "GenerateError";
  }
  code;
  taskUUID;
}
const $n = /^[\x21-\x7e]{16,512}$/, kn = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }, Sn = (e) => typeof e == "object" && e !== null && "manifest" in e && "video" in e, In = ["image/png", "image/jpeg", "image/webp"], En = 30 * 1048576;
async function mt(e, t) {
  if (!e) return;
  const o = e instanceof Blob ? e : e.blob;
  if (!(o instanceof Blob)) throw new P("refused", `The ${t} reference must be an image Blob.`);
  if (!In.includes(o.type)) throw new P("refused", `The ${t} image must be PNG, JPEG or WebP; got ${o.type || "an unknown type"}.`);
  if (o.size > En) throw new P("refused", `The ${t} image is over 30 MB.`);
  let n = ((e instanceof Blob ? e.name : e.name ?? e.blob.name) || t).split(/[\\/]/).pop();
  Ue(n) !== o.type && (n = `${n.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${kn[o.type]}`);
  const r = e instanceof Blob ? void 0 : e.src;
  try {
    return await ko(De(o, n), r && /^https?:\/\//.test(r) ? r : void 0);
  } catch (i) {
    throw new P("refused", `The ${t} image: ${i.message}`);
  }
}
function De(e, t) {
  return { name: t, size: e.size, bytes: async () => new Uint8Array(await e.arrayBuffer()) };
}
function Do(e) {
  const t = typeof e[Symbol.iterator] == "function" || "length" in e ? Array.from(e) : [];
  return t.length ? t.map((o, s) => De(o, o.name ?? `file-${s}`)) : Object.entries(e).map(([o, s]) => De(s, o));
}
function Bo(e, t, o, s) {
  if (e instanceof P) return e;
  const n = s(e?.message ?? String(e)), r = o ? ` The task was already submitted and may still finish and be billed (taskUUID ${o}); do not resubmit.` : " Nothing was submitted.";
  return t?.aborted || e?.name === "AbortError" || n.startsWith("Stopped polling") ? new P("aborted", `Stopped.${r}`, o) : n.startsWith("Still running after") ? new P("timeout", n, o) : e instanceof G ? new P("bad-bundle", n) : e instanceof x ? new P("refused", n) : e instanceof Q && (e.status === 401 || e.status === 403 || e.errors.some((d) => /key|auth/i.test(d.code))) || /No Runware API key|does not look like a Runware API key/.test(n) ? new P("invalid-key", "The key was refused. Check it in the key panel; it is sent only to api.runware.ai.") : new P("provider", n, o);
}
async function Pn(e) {
  const t = e.key, o = typeof t == "function" ? t : typeof t == "string" ? () => t : () => t.getKey(), s = xn({
    getKey: o,
    fetch: e.fetch,
    poll: { timeoutMs: 20 * 6e4, ...e.poll }
  }), n = (d) => s.client.redact(d), r = (d) => e.onProgress?.(d);
  let i;
  try {
    if (!(typeof e.maxPrice == "number" && Number.isFinite(e.maxPrice) && e.maxPrice > 0 && e.maxPrice <= 100))
      throw new P("refused", "maxPrice must be a positive number of USD up to 100.");
    const d = o();
    if (!d || !$n.test(d)) throw new P("invalid-key", "Connect a Runware API key first (16-512 characters, no spaces).");
    r({ stage: "plan", message: "reading the guide" });
    const a = Sn(e.guide) ? e.guide : await Io(Do(e.guide)), l = await mt(e.references?.character, "character"), m = await mt(e.references?.environment, "environment"), u = No({ guide: a, model: e.model, shot: e.shot, prompt: e.prompt, character: l, environment: m, resolution: e.resolution, requireAudio: e.requireAudio }, e.taskUUID), { plan: p } = u;
    if (p.estimate.usd === null) throw new P("no-estimate", `No price estimate for ${p.modelName}; it cannot be checked against maxPrice.`);
    if (p.estimate.usd > e.maxPrice)
      throw new P("over-price", `Estimated $${p.estimate.usd.toFixed(2)} (${p.estimate.basis}) is over your cap of $${e.maxPrice.toFixed(2)}.`);
    if (r({ stage: "confirm", message: `estimated $${p.estimate.usd.toFixed(2)}` }), !await e.confirm({
      model: p.modelId,
      modelName: p.modelName,
      usd: p.estimate.usd,
      basis: p.estimate.basis,
      maxPrice: e.maxPrice,
      inputs: p.inputsSent,
      prompt: u.request.prompt
    })) throw new P("not-confirmed", "Not confirmed; nothing was sent.");
    if (e.signal?.aborted) throw new P("aborted", "Stopped. Nothing was submitted.");
    const w = await s.run(p, {
      signal: e.signal,
      onProgress: (F) => {
        (F.stage === "submit" || F.stage === "poll") && (i = String(p.task.taskUUID)), r(F);
      }
    }), f = as(e.laneId ?? "lane-1", p, u.request, w, w.videoURL);
    u.marker && (f.composed = u.marker, f.shot = u.shot);
    const g = (/* @__PURE__ */ new Date()).toISOString(), b = {
      schemaVersion: 1,
      id: `gen-${w.taskUUID.slice(0, 8).toLowerCase()}`,
      title: `${p.modelName}: ${(u.shot.subject || u.request.prompt).slice(0, 80)}`,
      createdAt: g,
      guide: a.guide,
      lanes: [f],
      ...u.marker ? { shot: u.shot } : {}
    }, y = {
      date: g.slice(0, 10),
      model: p.modelId,
      modelRan: w.modelRan,
      taskUUID: w.taskUUID,
      duration: String(u.request.duration ?? "audio length"),
      resolution: go(p.task),
      inputs: p.inputsSent.map((F) => F.role).join("+"),
      estimateUsd: p.estimate.usd,
      costUsd: w.costUsd,
      seconds: w.generationSeconds,
      output: w.videoURL,
      status: "ok (browser)"
    }, U = [...u.notes];
    return w.costUsd !== null && w.costUsd > e.maxPrice && U.push(`Reported cost $${w.costUsd} is over the cap of $${e.maxPrice}.`), r({ stage: "done", message: "done" }), {
      videoURL: w.videoURL,
      costUsd: w.costUsd,
      generationSeconds: w.generationSeconds,
      taskUUID: w.taskUUID,
      modelRan: w.modelRan,
      estimate: p.estimate,
      inputsSent: p.inputsSent,
      lane: f,
      record: b,
      costRow: y,
      costRowText: ho(y),
      notes: U,
      task: w.task
    };
  } catch (d) {
    throw Bo(d, e.signal, i, n);
  }
}
function c(e, t = {}, ...o) {
  const s = document.createElement(e);
  for (const [n, r] of Object.entries(t)) s.setAttribute(n, r);
  for (const n of o) n != null && s.append(n);
  return s;
}
function z(e, t) {
  try {
    const o = new URL(e, t);
    return o.protocol === "https:" || o.protocol === "http:" || o.protocol === "blob:" ? o.href : o.protocol === "data:" && /^data:(image|video|audio)\//.test(e) ? e : null;
  } catch {
    return null;
  }
}
const An = {
  A: "A · raw frame 0",
  B: "B · restyled still",
  C: "C · none"
}, Un = {
  referenceVideo: "reference video",
  referenceImage: "reference image",
  referenceAudio: "reference audio",
  frameImage: "frame image",
  audio: "audio",
  video: "video"
}, W = (e) => e === null ? "not recorded" : `$${e.toFixed(e < 1 ? 3 : 2)}`, Xe = (e) => e == null ? "not recorded" : `${e.toFixed(1)} s`;
function Rn(e, t) {
  const o = z(e.src, t), s = e.role === "referenceImage" || e.role === "frameImage", n = e.role === "referenceVideo" || e.role === "video";
  let r;
  if (o && s) r = c("img", { src: o, alt: e.label ?? e.role, loading: "lazy" });
  else if (o && n) {
    const d = c("video", { src: o, muted: "", playsinline: "", preload: "metadata", "aria-label": e.label ?? e.role });
    d.muted = !0, r = d;
  } else r = c("div", { class: "ph" }, e.role.includes("udio") ? "audio" : "media");
  const i = `${Un[e.role]}${e.frame !== void 0 ? ` @ ${e.frame}` : ""}`;
  return c("div", { class: "input", title: e.label ?? e.src }, r, c("span", {}, i));
}
function Mn(e) {
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
function Tn(e, t, o) {
  const s = c("button", { class: "small", type: "button", "aria-pressed": "false" }, "Play alone");
  s.addEventListener("click", o);
  const r = [
    ["Model ran", e.modelRan ?? (e.status === "placeholder" ? "nothing ran (placeholder)" : "not reported by the provider")],
    ["First frame", An[e.firstFrameVariant]],
    ["Cost", W(e.costUsd)],
    ["Seconds", Xe(e.generationSeconds)]
  ];
  e.durationSeconds !== void 0 && r.push(["Clip length", e.durationSeconds === "auto" ? "auto" : `${e.durationSeconds} s asked`]), e.routing && r.push([
    "Routing",
    [e.routing.maxPrice !== void 0 ? `cap $${e.routing.maxPrice}` : "", e.routing.requirements ?? ""].filter(Boolean).join(" · ")
  ]);
  const i = c("dl");
  for (const [l, m] of r) i.append(c("dt", {}, l), c("dd", {}, m));
  const d = e.inputsSent.length ? c("div", { class: "inputs" }, ...e.inputsSent.map((l) => Rn(l, t))) : c("div", { class: "note" }, "Inputs sent: prompt only");
  return { node: c(
    "div",
    { class: "caption" },
    c(
      "div",
      { class: "row" },
      c("span", { class: "model" }, e.label ?? e.modelName ?? e.model),
      c("span", { class: "id" }, `${e.provider} · ${e.model}`)
    ),
    e.prompt ? c("div", { class: "prompt" }, c("pre", {}, e.prompt), c("div", { class: "row" }, Mn(e.prompt), s)) : c("div", { class: "row" }, s),
    c("div", {}, c("div", { class: "id" }, "Inputs sent"), d),
    i,
    e.note ? c("div", { class: "note" }, e.note) : null
  ), solo: s };
}
const je = "model-arena:runware-key";
class Fn {
  constructor(t = Ln()) {
    this.storage = t;
    try {
      this.key = this.storage?.getItem(je) ?? void 0;
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
      o === "session" && this.key ? this.storage?.setItem(je, this.key) : this.storage?.removeItem(je);
    } catch {
    }
  }
  clear() {
    this.key = void 0;
    try {
      this.storage?.removeItem(je);
    } catch {
    }
  }
}
function Ln() {
  try {
    return typeof sessionStorage > "u" ? void 0 : sessionStorage;
  } catch {
    return;
  }
}
const jn = `
  --ma-bg: #18181b; --ma-card: #1f1f23; --ma-fg: #f4f4f5; --ma-muted: #a1a1aa;
  --ma-line: #3f3f46; --ma-input: #27272a; --ma-chip: #2e2e33;
  --ma-accent: #e4e4e7; --ma-accent-fg: #18181b; --ma-warn: #fbbf24; --ma-ok: #86efac;`, Wt = `
  --ma-bg: #ffffff; --ma-card: #f7f7f8; --ma-fg: #18181b; --ma-muted: #52525b;
  --ma-line: #d4d4d8; --ma-input: #efeff1; --ma-chip: #e7e7ea;
  --ma-accent: #27272a; --ma-accent-fg: #ffffff; --ma-warn: #9a5800; --ma-ok: #166534;`, Vn = `
  --ma-radius: 7px; --ma-radius-lg: 12px; --ma-gap: 8px;
  --ma-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --ma-mono: ui-monospace, SFMono-Regular, Menlo, monospace;`, Je = (
  /* css */
  `
:host {${jn}${Vn} }
:host([theme="light"]) {${Wt} }
@media (prefers-color-scheme: light) { :host([theme="auto"]) {${Wt} } }
`
), Cn = [
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
], Nn = /^[\x21-\x7e]{16,512}$/, Ht = "https://runware.ai/";
function Xt(e) {
  return e ? /\s/.test(e) ? "A key has no spaces or line breaks." : e.length < 16 ? "That is too short for an API key." : e.length > 512 ? "That is too long for an API key." : Nn.test(e) ? null : "A key uses plain printable characters only." : "Paste your key first.";
}
const Jt = (
  /* css */
  `
${Je}
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
class On extends HTMLElement {
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
    super(), this.root = this.attachShadow({ mode: "open" }), this.store = new Fn();
    const t = this.store.get();
    t && Xt(t) && this.store.clear(), this.remembered = !!this.store.get();
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
    let o = null, s = "";
    try {
      o = await new Ne({ getKey: this.getKey, fetch: this.fetch }).balance();
    } catch (n) {
      s = `Balance not available: ${new Ne({ getKey: this.getKey }).redact(n instanceof Error ? n.message : "request failed")}`.slice(0, 200);
    }
    return t !== this.asked || !this.connected ? null : (this.balanceUsd = o, this.balanceNote = s, this.render(), this.dispatchEvent(new CustomEvent("arena-balance-change", { bubbles: !0, composed: !0, detail: { balance: o } })), o);
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
    const s = t.trim(), n = Xt(s);
    return n || (this.store.set(s, o ? "session" : "memory"), this.remembered = o, this.changed(), null);
  }
  changed() {
    this.asked++, this.balanceUsd = null, this.balanceNote = "", this.render(), this.dispatchEvent(new CustomEvent("arena-key-change", { bubbles: !0, composed: !0, detail: { connected: this.connected, remembered: this.remembered } })), this.connected && this.refreshBalance();
  }
  signup() {
    let t = Ht;
    try {
      const o = new URL(this.getAttribute("signup-url") ?? Ht);
      o.protocol === "https:" && (t = o.href);
    } catch {
    }
    return c("a", { href: t, target: "_blank", rel: "noopener noreferrer" }, "Get a key");
  }
  render() {
    const t = c("p", { class: "note" }, "Your key stays in your browser and is sent only to api.runware.ai.");
    if (this.connected) {
      const d = c("button", { type: "button", "data-action": "disconnect" }, "Disconnect");
      d.addEventListener("click", () => this.disconnect()), this.root.replaceChildren(
        c("style", {}, Jt),
        c(
          "div",
          { class: "panel", part: "panel", "data-state": "connected" },
          c("div", { class: "row" }, c("span", { class: "state" }, "Key connected"), c("span", { class: "note" }, this.remembered ? "remembered for this tab" : "held in memory until you leave"), d),
          c("div", { class: "row" }, c("span", { class: "balance", "data-field": "balance" }, this.balanceUsd === null ? "" : `Balance ${this.balanceUsd.toFixed(2)} USD`), c("span", { class: "note", "data-field": "balance-note" }, this.balanceNote)),
          t
        )
      );
      return;
    }
    const o = c("input", {
      type: "password",
      autocomplete: "off",
      spellcheck: "false",
      autocapitalize: "off",
      maxlength: "512",
      "aria-describedby": "where",
      "data-field": "key"
    }), s = c("input", { type: "checkbox", "data-field": "remember" }), n = c("p", { class: "err", role: "alert" }), r = c("button", { type: "submit", class: "primary", "data-action": "connect" }, "Connect"), i = c(
      "form",
      { class: "panel", part: "panel", "data-state": "disconnected" },
      c("div", { class: "row" }, c("label", { class: "field" }, c("span", { class: "lbl" }, "Runware API key"), o), r),
      c("div", { class: "row" }, c("label", { class: "note" }, s, " Remember for this tab"), this.signup()),
      n,
      t
    );
    t.id = "where", o.addEventListener("input", () => n.textContent = ""), i.addEventListener("submit", (d) => {
      d.preventDefault();
      const a = this.connect(o.value, s.checked);
      a ? n.textContent = a : o.value = "";
    }), this.root.replaceChildren(c("style", {}, Jt), i);
  }
}
function Go(e = "arena-key") {
  customElements.get(e) || customElements.define(e, On);
}
const pt = [
  ["subject", "Subject", "Who or what moves"],
  ["environment", "Environment", "Where it happens"],
  ["action", "Action", "What it does along the path"],
  ["legend", "Colour legend", "e.g. The orange figure is the character"]
], Dn = ["image/png", "image/jpeg", "image/webp"];
function Yt(e, t) {
  const o = c("input", { type: "file", accept: Dn.join(","), "data-field": e }), s = c("span", { class: "row", "data-ref": e }), r = c("div", { class: "drop", "data-drop": e }, c("span", { class: "note" }, `${e === "character" ? "Character sheet (optional)" : "Environment image (optional)"}: drop an image or`), o, s);
  return r.addEventListener("dragover", (i) => (i.preventDefault(), r.classList.add("over"))), r.addEventListener("dragleave", () => r.classList.remove("over")), r.addEventListener("drop", (i) => {
    i.preventDefault(), r.classList.remove("over"), t(i.dataTransfer?.files[0]);
  }), o.addEventListener("change", () => t(o.files?.[0])), { node: r, input: o, shown: s };
}
function Bn(e) {
  const t = Co(), o = t.some((f) => f.key === e("model")) ? e("model") : t[0].key, s = t.map((f) => {
    const g = c("input", { type: "radio", name: "model", value: f.key, "data-model": f.key });
    return g.checked = f.key === o, { m: f, r: g };
  }), n = c(
    "fieldset",
    {},
    c("legend", {}, "Model"),
    c(
      "div",
      { class: "models" },
      ...s.map(
        ({ m: f, r: g }) => c(
          "label",
          { class: "model-opt" },
          g,
          c("span", {}, f.name, f.use === "audio-first-frame" ? c("span", { class: "badge" }, "audio + first frame only") : null),
          c("span", { class: "line" }, f.line)
        )
      )
    )
  ), r = {}, i = c("div", { class: "fields" });
  for (const [f, g, b] of pt)
    r[f] = c("input", { type: "text", maxlength: f === "legend" ? "300" : "500", placeholder: b, "data-field": f, value: e(f) ?? "" }), i.append(c("label", { class: "f" }, g, r[f]));
  const d = c("textarea", { maxlength: "5000", "data-field": "prompt", placeholder: "Leave empty to use the composed prompt" });
  d.value = e("prompt") ?? "";
  const a = c("details", {}, c("summary", {}, "Write my own prompt instead"), d);
  a.open = !!d.value;
  const l = c("fieldset", {}, c("legend", {}, "Shot description"), i, a), m = c("input", { type: "file", multiple: "", accept: ".json,.mp4,.wav,.mp3,.png,.jpg", "data-field": "bundle" }), u = c("p", { class: "note", "data-guide": "" }, "No guide yet: choose the bundle's files."), p = c("input", { type: "number", min: "0.1", max: "100", step: "0.1", value: e("max-price") ?? "2", "data-field": "max-price" }), h = c("button", { type: "button", class: "primary", "data-action": "run" }, "Run"), w = c("button", { type: "button", "data-action": "stop" }, "Stop");
  return w.hidden = !0, {
    radios: s,
    model: () => s.find(({ r: f }) => f.checked)?.m.key ?? o,
    setModel: (f) => s.forEach(({ m: g, r: b }) => b.checked = g.key === f),
    modelSet: n,
    fields: r,
    override: d,
    own: a,
    shotSet: l,
    bundleInput: m,
    guideInfo: u,
    maxPrice: p,
    run: h,
    stop: w,
    preview: c("div", { "data-preview": "" }),
    estimate: c("p", { class: "note", "data-estimate": "" }),
    confirmSlot: c("div"),
    status: c("p", { class: "status", role: "status" }),
    error: c("p", { class: "err", role: "alert" }),
    result: c("div", { "data-result": "" })
  };
}
const Gn = /^[A-Za-z0-9._-]{1,255}$/, Zt = (e) => typeof e == "object" && e !== null && !Array.isArray(e), Qt = (e) => typeof e == "string" && e.length > 0 && e.length <= 2048 && !/^(javascript|data):/i.test(e.trim());
function _n(e) {
  if (!Zt(e)) throw new Error("preset must be an object");
  if (!Qt(e.bundle)) throw new Error("preset.bundle must be a bundle directory URL");
  const t = { bundle: e.bundle };
  if (e.references !== void 0) {
    if (!Zt(e.references)) throw new Error("preset.references must be an object");
    t.references = {};
    for (const o of ["character", "environment"]) {
      const s = e.references[o];
      if (s !== void 0) {
        if (!Qt(s)) throw new Error(`preset.references.${o} must be an image URL`);
        t.references[o] = s;
      }
    }
  }
  if (e.shot !== void 0) {
    const o = So(e.shot);
    if (!o) throw new Error("preset.shot needs a subject (and an action)");
    t.shot = o;
  }
  if (e.model !== void 0) {
    if (!he.includes(e.model)) throw new Error(`preset.model must be one of ${he.join(", ")}`);
    t.model = e.model;
  }
  if (e.prompt !== void 0) {
    if (typeof e.prompt != "string" || e.prompt.length > 5e3) throw new Error("preset.prompt must be text up to 5000 characters");
    t.prompt = e.prompt;
  }
  return t;
}
async function ft(e) {
  const t = await fetch(e);
  if (!t.ok) throw new Error(`${new URL(e).pathname.split("/").pop()}: HTTP ${t.status}`);
  return t.blob();
}
async function qt(e) {
  const t = e.endsWith("/") ? e : `${e}/`, o = JSON.parse(await (await ft(new URL("bundle.json", t).href)).text()), s = { "bundle.json": new Blob([JSON.stringify(o)], { type: "application/json" }) }, n = /* @__PURE__ */ new Set([o.recipe, o.camera, o.firstFrameStyled]);
  for (const r of ["video", "audio", "firstFrame", "beats", "recipe", "meta", "camera"]) {
    const i = o[r];
    if (!(typeof i != "string" || !Gn.test(i)))
      try {
        s[i] = await ft(new URL(i, t).href);
      } catch (d) {
        if (!n.has(i)) throw d;
      }
  }
  return { files: s, dir: t };
}
async function Kn(e) {
  return { blob: await ft(e), src: e, name: new URL(e).pathname.split("/").pop() || "reference.png" };
}
function zn(e, t) {
  if (!e.guide) return null;
  const o = e.lanes.find((a) => a.shot || a.composed) ?? e.lanes[0];
  if (!o) return null;
  const s = Oe.find((a) => a.air === o.model || a.id === o.model || a.id === o.composed?.model), n = s && he.includes(s.id) ? s.id : void 0;
  if (!n) return null;
  const r = new URL(e.guide.video.src, t), i = { bundle: new URL(".", r).href, model: n }, d = o.shot ?? e.shot;
  if (d) {
    i.shot = { subject: d.subject, action: d.action, ...d.environment ? { environment: d.environment } : {}, ...d.legend ? { legend: d.legend } : {}, camera: d.camera };
    const a = o.inputsSent.filter((m) => m.role === "referenceImage" || m.role === "frameImage"), l = d.references.filter((m) => m.kind === "image").map((m) => m.id);
    a.forEach((m, u) => {
      const p = l[u];
      (p === "character" || p === "environment") && (i.references = { ...i.references, [p]: new URL(m.src, t).href });
    });
  }
  return o.composed || (i.prompt = o.prompt), i;
}
const Wn = {
  guide: "the guide clip",
  audio: "the guide's audio",
  character: "your character sheet",
  environment: "your environment image",
  frame0: "the guide's frame 0"
};
function Hn(e) {
  const t = e.composed.used.filter((o) => o.address).map((o) => `${o.address} = ${Wn[o.ref] ?? o.ref}`);
  return t.length ? `Reference tags: ${t.join(", ")}` : "Reference tags: none; this model is not addressed by tags.";
}
function eo(e, t = !1) {
  const o = e.composed.dropped.map((n) => `${n.ref}: ${n.reason}`), s = [...e.notes, ...o];
  return c(
    "div",
    { class: t ? "prompt-card compact" : "prompt-card", "data-model": e.model.key },
    c("div", { class: "row spread" }, c("strong", {}, e.model.name), c("a", { href: e.model.guide.url, target: "_blank", rel: "noopener noreferrer" }, /^prompting$/i.test(e.model.guide.title) ? "Prompting guide" : `Prompting guide: ${e.model.guide.title}`)),
    t ? null : c("p", { class: "line" }, e.model.line),
    c("pre", { "data-prompt": e.model.key }, e.composed.prompt),
    c("p", { class: "tags" }, Hn(e)),
    s.length ? c("ul", { class: "notes" }, ...s.map((n) => c("li", {}, n))) : null
  );
}
function Xn(e) {
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
    t = eo(He(e.shot, e.model, e.facts));
  } catch (s) {
    t = c("p", { class: "err" }, s.message);
  }
  const o = c(
    "details",
    { class: "compare" },
    c("summary", {}, "Compare prompts"),
    c("div", { class: "compare-grid" }, ...hn(e.shot, e.facts).map((s) => eo(s, !0)))
  );
  return c("div", { class: "preview" }, t, o);
}
const Jn = 0.025;
class to {
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
    this.media.forEach((s) => {
      s.readyState >= 1 && (s.currentTime = Math.min(o, s.duration));
    }), this.set({ time: o });
  }
  async play() {
    if (this.state.playing) return this.pause();
    this.state.soloing && this.pause();
    const t = ++this.generation;
    this.set({ error: "" });
    const o = [...this.media.values()];
    if (!o.length || o.some((i) => i.readyState < 2 || i.error)) {
      this.set({ error: "Wait for every video to load, or replace the unavailable clip." });
      return;
    }
    const { time: s, duration: n } = this.state, r = s >= n - 0.04 ? 0 : s;
    o.forEach((i) => i.currentTime = r);
    try {
      if (await Promise.all(o.map((i) => i.play())), t !== this.generation) return void o.forEach((i) => i.pause());
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
    const s = this.generation;
    if (this.set({ error: "" }), o.readyState < 2 || o.error) {
      this.set({ error: "Wait for this video to load, or replace the clip." });
      return;
    }
    (o.ended || o.currentTime >= o.duration - 0.04) && (o.currentTime = 0);
    try {
      if (await o.play(), s !== this.generation) return o.pause();
      this.set({ soloing: t }), o.addEventListener("pause", () => this.state.soloing === t && this.set({ soloing: void 0 }), {
        once: !0
      }), this.startSoloLoop(t, o);
    } catch {
      s === this.generation && this.set({ error: "Playback was interrupted. Press Play to try again." });
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
    const o = [...this.media.values()], s = o[0], { duration: n } = this.state;
    if (!s || s.ended || s.currentTime >= n - Jn)
      return o.forEach((r) => r.pause()), this.stopLoop(), this.set({ playing: !1, time: n }), !1;
    for (const r of o.slice(1))
      Math.abs(r.currentTime - s.currentTime) > this.maxDrift && (r.currentTime = s.currentTime);
    return t - this.published >= this.publishEvery && (this.published = t, this.set({ time: s.currentTime })), !0;
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
    const s = () => {
      this.state.soloing === t && (this.set({ time: o.currentTime }), this.frame = this.raf(s));
    };
    this.frame = this.raf(s);
  }
}
const oo = /^[a-z0-9][a-z0-9-]{0,63}$/, ht = (e) => typeof e == "object" && e !== null && !Array.isArray(e), Yn = (e) => ht(e) && Array.isArray(e.tabs);
function Zn(e) {
  if (!ht(e)) throw new v("set", "must be an object");
  if (e.schemaVersion !== 1) throw new v("schemaVersion", "must be 1");
  if (typeof e.id != "string" || !oo.test(e.id)) throw new v("id", "must be a slug");
  if (typeof e.title != "string" || e.title.length < 1 || e.title.length > 200) throw new v("title", "must be 1-200 characters");
  if (!Array.isArray(e.tabs) || e.tabs.length < 1 || e.tabs.length > 8) throw new v("tabs", "must hold 1-8 tabs");
  const t = /* @__PURE__ */ new Set();
  return e.tabs.forEach((o, s) => {
    const n = `tabs[${s}]`;
    if (!ht(o)) throw new v(n, "must be an object");
    if (typeof o.id != "string" || !oo.test(o.id)) throw new v(`${n}.id`, "must be a slug");
    if (t.has(o.id)) throw new v(`${n}.id`, "tab ids must be distinct");
    if (t.add(o.id), typeof o.label != "string" || o.label.length < 1 || o.label.length > 40) throw new v(`${n}.label`, "must be 1-40 characters");
    if (o.record !== void 0) ue(o.record);
    else if (typeof o.src != "string" || o.src.length < 1 || o.src.length > 2048) throw new v(`${n}.src`, "must be a record URL, or give an inline record");
  }), e;
}
const Qn = (
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
), so = (
  /* css */
  `
${Je}
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
${Qn}
`
);
function Me(e) {
  return Oe.find((t) => t.air === e.model || t.id === e.model);
}
function _o(e) {
  const o = e.settings?.settings?.cameraMovement;
  return typeof o == "string" ? o : void 0;
}
const no = [
  { id: "parameter", title: "Camera parameter", text: "The move is a request field the model reads directly." },
  { id: "guide-video", title: "Guide video", text: "A reference video carries the move; the prompt names it." },
  { id: "prompt", title: "Prompt words", text: "The move is written into the prompt and nothing else." }
];
function qn(e) {
  return _o(e) ? "parameter" : e.inputsSent.some((t) => t.role === "referenceVideo") ? "guide-video" : "prompt";
}
function er(e, t = Me(e)) {
  const o = (h) => e.inputsSent.find((w) => w.role === h), s = e.inputsSent.find((h) => h.role === "frameImage" && (h.frame === void 0 || h.frame === "first" || h.frame === 0)), n = e.firstFrameVariant !== "C" ? o("referenceImage") : void 0, r = o("referenceVideo"), i = o("referenceAudio") ?? o("audio"), d = _o(e), a = (h) => h === !1 ? "cannot" : "not-sent", l = s ? { key: "firstFrame", label: "First frame", state: "sent", detail: "as the first frame" } : n ? { key: "firstFrame", label: "First frame", state: "sent", detail: "as a reference image" } : { key: "firstFrame", label: "First frame", state: a(t?.inputs.firstFrame.supported), detail: t?.inputs.firstFrame.supported === !1 ? "cannot take it" : "not sent" }, m = t ? t.inputs.referenceVideos.supported : void 0, u = t ? t.inputs.referenceAudios.supported || t.inputs.audioToVideo.supported : void 0, p = t ? t.camera.kind === "parameter" : void 0;
  return [
    l,
    r ? { key: "guideVideo", label: "Guide video", state: "sent", detail: "as a reference video" } : { key: "guideVideo", label: "Guide video", state: a(m), detail: m === !1 ? "cannot take it" : "not sent" },
    i ? { key: "audio", label: "Audio", state: "sent", detail: i.role === "audio" ? "drives the clip" : "as reference audio" } : { key: "audio", label: "Audio", state: a(u), detail: u === !1 ? "cannot take it" : "not sent" },
    d ? { key: "cameraParam", label: "Camera parameter", state: "sent", detail: d } : { key: "cameraParam", label: "Camera parameter", state: a(p), detail: p === !1 ? "none on this model" : "not sent" },
    e.prompt ? { key: "prompt", label: "Prompt text", state: "sent", detail: d ? "no camera words" : "carries the move" } : { key: "prompt", label: "Prompt text", state: "not-sent", detail: "no prompt" }
  ];
}
function Ko(e, t = Me(e)) {
  if (!t || typeof e.durationSeconds != "number") return null;
  const o = e.inputsSent.some((a) => a.role === "referenceVideo" || a.role === "video"), s = t.pricing.rates.filter((a) => !a.mode.startsWith("draft")), n = s.filter((a) => a.mode === "any" || a.mode === (o ? "video-input" : "no-video-input")), r = n.length ? n : s;
  if (!r.length) return null;
  const i = Math.round(Math.min(...r.map((a) => a.usdPerSecond)) * e.durationSeconds * 1e3) / 1e3, d = o ? t.pricing.surcharges.find((a) => a.per === "input-video-second") : void 0;
  return d ? { usd: i, excludes: `${d.label} at $${d.usd}/s` } : { usd: i };
}
const ro = (e) => {
  const t = Math.floor(e / 60), o = e - t * 60;
  return `${t}:${o.toFixed(1).padStart(4, "0")}`;
};
function Ye(e, t = "Play all") {
  const o = c("button", { class: "primary", type: "button" }, t);
  o.addEventListener("click", () => {
    e().play();
  });
  const s = c("input", { type: "range", min: "0", max: "0", step: String(1 / 24), value: "0", "aria-label": "Playhead" });
  let n = !1;
  s.addEventListener("input", () => {
    n = !0, e().seek(Number(s.value));
  }), s.addEventListener("change", () => n = !1);
  const r = c("span", { class: "time" }, "0:00.0 / 0:00.0");
  return {
    node: c("div", { class: "transport" }, o, s, r),
    update(i) {
      o.textContent = i.playing ? "Pause" : t, s.max = String(i.duration || 0), n || (s.value = String(i.time)), r.textContent = `${ro(i.time)} / ${ro(i.duration)}`;
    }
  };
}
function ge(e, t, o, s) {
  const n = c("div", { class: "screen" });
  let r;
  e ? (r = c("video", { src: e, muted: "", playsinline: "", preload: "auto", "aria-label": t }), r.muted = !0, r.addEventListener("error", () => o(`${t}: the clip did not load.`)), n.append(r)) : n.append(c("div", { class: "badge" }, "No output")), s && n.append(c("div", { class: "badge" }, s));
  const i = c("span");
  return n.append(c("div", { class: "playhead" }, i)), { node: n, video: r, bar: i };
}
const Ze = (e) => e.duration ? `${Math.min(100, e.time / e.duration * 100)}%` : "0%", zo = {
  2: [["2-side", "Side by side"], ["2-stack", "Stacked"]],
  3: [["3-row", "Row of 3"], ["3-hero", "1 big + 2"]],
  4: [["4-grid", "2 × 2"], ["4-row", "Row of 4"]],
  5: [["5-3-2", "3 + 2"], ["5-hero", "1 big + 4"]]
};
function St(e) {
  if (e.costUsd !== null) return `${W(e.costUsd)} per clip`;
  const t = Ko(e, Me(e));
  return t ? `List price from ${W(t.usd)} per clip${t.excludes ? ` plus ${t.excludes}` : ""} (not run)` : "Cost not recorded";
}
function tr(e) {
  const t = e.costUsd === null ? Ko(e, Me(e)) : null, o = e.costUsd !== null ? W(e.costUsd) : t ? `from ${W(t.usd)}` : "$ —", s = e.generationSeconds !== null ? Xe(e.generationSeconds) : "— s";
  return `${o} · ${s}`;
}
function It(e) {
  const t = typeof e.durationSeconds == "number" ? `${e.durationSeconds} s clip` : null, o = e.generationSeconds !== null ? `${Xe(e.generationSeconds)} to generate` : "generation time not recorded";
  return [t, o].filter(Boolean).join(" · ");
}
function Wo(e, t) {
  const o = e.lanes.map((l) => l.id), s = Math.max(1, Math.min(5, o.length)), n = Math.min(s, Math.max(Math.min(2, s), t?.count ?? Math.min(3, s))), r = zo[n] ?? [["single", "Single"]], i = r.some(([l]) => l === t?.layout) ? t.layout : r[0][0], d = [], a = (t?.picks ?? []).filter((l) => o.includes(l));
  for (let l = 0; l < n; l++) d.push(a[l] ?? o.find((m) => !d.includes(m) && !a.includes(m)) ?? o[l % o.length]);
  return { count: n, layout: i, picks: d };
}
function io(e, t, o, s) {
  const n = c("div", { class: "seg", role: "group", "aria-label": e });
  for (const [r, i] of t) {
    const d = c("button", { type: "button", "aria-pressed": String(r === o) }, i);
    d.addEventListener("click", () => s(r)), n.append(d);
  }
  return n;
}
function or(e, t, o) {
  const { record: s, base: n } = e, r = Ye(e.clock), i = c("div", { class: "stage", "data-layout": t.layout }), d = [], a = /* @__PURE__ */ new Map(), l = new Map(s.lanes.map((h) => [h.id, h])), m = [2, 3, 4, 5].filter((h) => h <= s.lanes.length), u = m.length > 0 ? [
    io("How many models", m.map((h) => [String(h), `${h} models`]), String(t.count), (h) => o(Wo(s, { ...t, count: Number(h), layout: void 0 }))),
    io("Layout", zo[t.count] ?? [], t.layout, (h) => o({ ...t, layout: h }))
  ] : [];
  t.picks.forEach((h, w) => {
    const f = l.get(h), g = `tile-${w}`, b = f.label ?? f.modelName ?? f.model, y = f.output ? z(f.output.src, n) : null, U = ge(y, b, e.error, f.status === "placeholder" ? "Placeholder" : void 0);
    U.video && (U.video.addEventListener("loadedmetadata", () => e.clock().loaded()), e.clock().add(g, U.video)), d.push(U.bar);
    const F = c("select", { "aria-label": `Model for tile ${w + 1}` });
    for (const H of s.lanes) {
      const ne = c("option", { value: H.id }, H.label ?? H.modelName ?? H.model);
      ne.selected = H.id === h, F.append(ne);
    }
    F.addEventListener("change", () => o({ ...t, picks: t.picks.map((H, ne) => ne === w ? F.value : H) }));
    const te = c("button", { class: "small solo", type: "button", "aria-pressed": "false" }, "Play alone");
    te.addEventListener("click", () => {
      e.clock().solo(g);
    }), U.video || (te.disabled = !0), a.set(g, te);
    const xe = c("span", { class: "meta", title: `${St(f)} · ${It(f)}` }, tr(f));
    i.append(
      c(
        "figure",
        { class: `tile${s.preferredLane === f.id ? " preferred" : ""}`, "data-lane": f.id },
        U.node,
        c("figcaption", { class: "overlay" }, F, te, xe)
      )
    );
  });
  const p = s.observations?.length ? c("ul", { class: "note" }, ...s.observations.map((h) => c("li", {}, h))) : null;
  return {
    controls: u,
    nodes: [r.node, i, ...p ? [p] : []],
    update(h) {
      r.update(h);
      const w = Ze(h);
      d.forEach((f) => f.style.width = w);
      for (const [f, g] of a)
        g.textContent = h.soloing === f ? "Stop" : "Play alone", g.setAttribute("aria-pressed", String(h.soloing === f));
    }
  };
}
const sr = (e) => e.model === "guide" || e.provider === "none";
function nr(e) {
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
function rr(e, t) {
  const { record: o, base: s } = e, n = o.lanes.filter((k) => !sr(k));
  let r = n.find((k) => k.id === t) ?? n[0];
  const i = Ye(e.clock, "Play both"), d = o.guide ? z(o.guide.video.src, s) : null, a = ge(d, "Guide", e.error);
  a.video && (a.video.addEventListener("loadedmetadata", () => e.clock().loaded()), e.clock().add("guide-clip", a.video));
  const l = c(
    "figure",
    { class: "side" },
    a.node,
    c("figcaption", {}, c("span", { class: "model" }, "Guide"), c("span", { class: "id" }, o.guide ? o.guide.title ?? "The clip every model was given" : "No guide clip in this record"))
  ), m = c("div", { class: "side-screen" }), u = c("span", { class: "model" }), p = c("span", { class: "id" }), h = c("figure", { class: "side" }, m, c("figcaption", {}, u, p));
  let w = c("span");
  const f = c("div", { class: "switcher", role: "group", "aria-label": "Model" }), g = /* @__PURE__ */ new Map();
  for (const k of n) {
    const L = c("button", { type: "button", "aria-pressed": "false", "data-lane": k.id }, k.label ?? k.modelName ?? k.model);
    L.addEventListener("click", () => H(k)), g.set(k.id, L), f.append(L);
  }
  const b = c("ol", { class: "modes", "aria-label": "Three ways a model is steered" }), y = new Map(
    no.map((k) => {
      const L = c("li", { "data-mode": k.id }, c("strong", {}, k.title), c("span", {}, k.text));
      return b.append(L), [k.id, L];
    })
  ), U = c("ul", { class: "strip", "aria-label": "Inputs this model received" }), F = c("pre"), te = c(
    "div",
    { class: "composed" },
    c("div", { class: "row spread" }, c("span", { class: "id" }, "Composed prompt"), nr(() => r?.prompt ?? "")),
    F
  ), xe = c("p", { class: "note" });
  function H(k) {
    r = k;
    const L = e.clock(), os = L.state.time;
    L.pause(), L.remove("output");
    const ss = k.output ? z(k.output.src, s) : null, Qe = k.label ?? k.modelName ?? k.model, $e = ge(ss, Qe, e.error, k.status === "placeholder" ? "Placeholder clip" : void 0);
    $e.video && ($e.video.addEventListener("loadedmetadata", () => {
      L.loaded(), L.seek(os);
    }), L.add("output", $e.video)), m.replaceChildren($e.node), w = $e.bar;
    const qe = qn(k), ns = no.find((C) => C.id === qe).title;
    u.textContent = Qe, p.textContent = `Steered by: ${ns} · ${St(k)} · ${It(k)}`;
    for (const [C, ke] of g) ke.setAttribute("aria-pressed", String(C === k.id));
    for (const [C, ke] of y)
      ke.classList.toggle("on", C === qe), C === qe ? ke.setAttribute("aria-current", "true") : ke.removeAttribute("aria-current");
    const rs = Me(k);
    U.replaceChildren(
      ...er(k, rs).map(
        (C) => c(
          "li",
          { class: `slot ${C.state}`, "data-slot": C.key, title: C.state === "cannot" ? `${Qe} cannot take this input` : C.detail },
          c("strong", {}, C.label),
          c("span", {}, C.detail)
        )
      )
    ), F.textContent = k.prompt || "(no prompt)", xe.textContent = k.note ?? "", xe.hidden = !k.note;
  }
  r && H(r);
  const ne = n.length ? null : c("p", { class: "note" }, "This record has no model lanes to compare with the guide.");
  return {
    nodes: [c("div", { class: "pair" }, l, h), i.node, f, b, U, te, xe, ...ne ? [ne] : []],
    update(k) {
      i.update(k);
      const L = Ze(k);
      a.bar.style.width = L, w.style.width = L;
    }
  };
}
const ir = (e) => e.model === "guide" || e.provider === "none", ar = /* @__PURE__ */ new Set(["referenceImage", "frameImage"]), dr = { character: "Character sheet", environment: "Environment", frame0: "Guide frame 0" };
function cr(e) {
  const t = /* @__PURE__ */ new Map();
  for (const o of e) {
    const s = (o.shot?.references ?? []).filter((n) => n.kind === "image").map((n) => n.id);
    o.inputsSent.filter((n) => ar.has(n.role)).forEach((n, r) => {
      t.has(n.src) || t.set(n.src, dr[s[r] ?? ""] ?? n.label ?? "Reference image");
    });
  }
  return [...t].map(([o, s]) => ({ src: o, label: s }));
}
function lr(e) {
  const { record: t, base: o } = e, s = e.clock(), n = Ye(e.clock, "Play all"), r = [], i = t.lanes.filter((b) => !ir(b) && b.output).slice(0, 3), d = cr(t.lanes), a = d.length ? c(
    "ul",
    { class: "ref-strip", "aria-label": "Reference images sent" },
    ...d.map((b) => {
      const y = z(b.src, o);
      return c("li", {}, y ? c("img", { src: y, alt: b.label, loading: "lazy" }) : c("div", { class: "ph" }, "image"), c("span", {}, b.label));
    })
  ) : null, l = c("div", { class: "inputs-row" });
  l.style.setProperty("--ma-columns", String(1 + Math.max(1, i.length)));
  const m = t.guide ? z(t.guide.video.src, o) : null, u = ge(m, "Guide", e.error);
  u.video && (u.video.addEventListener("loadedmetadata", () => s.loaded()), s.add("guide-clip", u.video)), r.push(u.bar), l.append(c("figure", { class: "side", "data-lane": "guide" }, u.node, c("figcaption", {}, c("span", { class: "model" }, "Guide"), c("span", { class: "id" }, t.guide?.title ?? "The clip every model was given"))));
  const p = t.guide?.audio ? z(t.guide.audio.src, o) : null;
  let h;
  p && (h = c("audio", { src: p, preload: "auto", "data-track": "guide-audio" }), h.addEventListener("loadedmetadata", () => s.loaded()), s.add("guide-audio", h));
  const w = [];
  for (const b of i) {
    const y = ge(z(b.output.src, o), b.label ?? b.modelName ?? b.model, e.error, b.status === "placeholder" ? "Placeholder clip" : void 0);
    y.video && (y.video.addEventListener("loadedmetadata", () => s.loaded()), s.add(b.id, y.video), w.push(y.video)), r.push(y.bar), l.append(
      c(
        "figure",
        { class: "side", "data-lane": b.id },
        y.node,
        c("figcaption", {}, c("span", { class: "model" }, b.label ?? b.modelName ?? b.model), c("span", { class: "id" }, `${St(b)} · ${It(b)}`)),
        c("details", { class: "lane-prompt" }, c("summary", {}, b.composed ? "Composed prompt" : "Prompt"), c("pre", {}, b.prompt || "(no prompt)"))
      )
    );
  }
  i.length || l.append(c("p", { class: "note" }, "This record has no outputs yet."));
  const f = c("button", { type: "button", class: "small", "aria-pressed": "false", "data-action": "clip-sound" }, "Clip sound: off"), g = (b) => {
    for (const y of w) y.muted = !b;
    h && (h.muted = b), f.setAttribute("aria-pressed", String(b)), f.textContent = `Clip sound: ${b ? "on" : "off"}`;
  };
  return f.addEventListener("click", () => g(f.getAttribute("aria-pressed") !== "true")), g(!1), {
    controls: [f],
    nodes: [...a ? [a] : [], l, n.node, ...h ? [h] : []],
    update(b) {
      n.update(b);
      const y = Ze(b);
      r.forEach((U) => U.style.width = y);
    }
  };
}
function ur(e, t) {
  const { record: o, base: s } = e, n = Ye(e.clock), r = [], i = /* @__PURE__ */ new Map(), d = c("div", { class: "lanes" });
  d.style.setProperty("--ma-columns", String(t === "three-up" ? Math.min(3, o.lanes.length) : 3));
  for (const l of o.lanes) {
    const m = l.output ? z(l.output.src, s) : null, u = ge(m, l.label ?? l.model, e.error, l.status === "placeholder" ? "Placeholder clip" : l.status === "pending" ? "Not run yet" : void 0);
    u.video && (u.video.addEventListener("loadedmetadata", () => e.clock().loaded()), e.clock().add(l.id, u.video)), r.push(u.bar);
    const { node: p, solo: h } = Tn(l, s, () => {
      e.clock().solo(l.id);
    });
    u.video || (h.disabled = !0), i.set(l.id, h), d.append(c("article", { class: `lane${o.preferredLane === l.id ? " preferred" : ""}`, "data-lane": l.id }, u.node, p));
  }
  const a = o.observations?.length ? c("ul", { class: "note" }, ...o.observations.map((l) => c("li", {}, l))) : null;
  return {
    nodes: [n.node, d, ...a ? [a] : []],
    update(l) {
      n.update(l);
      const m = Ze(l);
      r.forEach((u) => u.style.width = m);
      for (const [u, p] of i)
        p.textContent = l.soloing === u ? "Stop" : "Play alone", p.setAttribute("aria-pressed", String(l.soloing === u));
    }
  };
}
const dt = () => typeof location > "u" ? "http://localhost/" : location.href;
class mr extends HTMLElement {
  static observedAttributes = ["src", "layout", "tab"];
  root;
  clock = new to();
  unsubscribe;
  current;
  set;
  tabId;
  arenaState;
  base = dt();
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
  attributeChangedCallback(t, o, s) {
    t === "src" && s && s !== o && this.fetchSource(s), t === "layout" && this.current && this.render(this.current), t === "tab" && s && this.set && s !== this.tabId && this.showTab(s);
  }
  get record() {
    return this.current;
  }
  set record(t) {
    this.setRecord(t);
  }
  /** Hands in a record or a record set; media and tab paths resolve against `baseUrl` (default: the page). */
  setRecord(t, o = dt()) {
    const s = ++this.load, n = (r) => this.message(`This record cannot be shown: ${r.message}`);
    try {
      this.accept(t, o, s).catch(n);
    } catch (r) {
      n(r);
    }
  }
  /** Not async on purpose: a bad record throws synchronously, so the message shows at once. */
  accept(t, o, s) {
    if (Yn(t))
      return this.set = { data: Zn(t), base: o, cache: /* @__PURE__ */ new Map() }, this.showTab(this.getAttribute("tab") ?? this.set.data.tabs[0].id, s);
    const n = ue(t);
    return this.set = void 0, this.tabId = void 0, this.base = o, this.render(n), Promise.resolve();
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
      const s = new URL(t, dt()).href, n = await this.fetchJson(s);
      if (o !== this.load) return;
      await this.accept(n, s, o);
    } catch (s) {
      o === this.load && this.message(`Could not load ${t}: ${s.message}`);
    }
  }
  async showTab(t, o = ++this.load) {
    const s = this.set;
    if (!s) return;
    const n = s.data.tabs.find((r) => r.id === t) ?? s.data.tabs[0];
    this.tabId = n.id;
    try {
      let r = s.cache.get(n.id);
      if (!r) {
        if (n.record) r = { record: ue(n.record), base: s.base };
        else {
          const i = new URL(n.src, s.base).href;
          r = { record: ue(await this.fetchJson(i)), base: i };
        }
        s.cache.set(n.id, r);
      }
      if (o !== this.load) return;
      this.base = r.base, this.render(r.record);
    } catch (r) {
      o === this.load && this.message(`Could not load the "${n.label}" tab: ${r.message}`);
    }
  }
  message(t) {
    this.teardown();
    const o = this.tabs();
    this.root.replaceChildren(
      c("style", {}, so),
      ...o ? [c("div", { class: "head" }, c("div", { class: "controls" }, o))] : [],
      c("div", { class: "body" }, c("p", { class: "note" }, t))
    );
  }
  teardown() {
    this.unsubscribe?.(), this.clock.hide(), this.clock = new to();
  }
  tabs() {
    const t = this.set;
    if (!t || t.data.tabs.length < 2) return null;
    const o = c("div", { class: "seg tabs", role: "tablist", "aria-label": "Test" }), s = t.data.tabs.map((n) => n.id);
    for (const n of t.data.tabs) {
      const r = n.id === this.tabId, i = c("button", { type: "button", role: "tab", "aria-selected": String(r), tabindex: r ? "0" : "-1", "data-tab": n.id }, n.label);
      i.addEventListener("click", () => {
        this.showTab(n.id);
      }), i.addEventListener("keydown", (d) => {
        const a = d.key === "ArrowRight" ? 1 : d.key === "ArrowLeft" ? -1 : 0;
        if (!a) return;
        d.preventDefault();
        const l = s[(s.indexOf(n.id) + a + s.length) % s.length];
        this.showTab(l).then(() => this.root.querySelector(`[data-tab="${l}"]`)?.focus());
      }), o.append(i);
    }
    return o;
  }
  render(t) {
    this.teardown(), this.current = t;
    const o = this.getAttribute("layout") ?? "three-up", s = c("div", { class: "error", role: "status" }), n = { record: t, base: this.base, clock: () => this.clock, error: (m) => s.textContent = m };
    let r;
    o === "arena" ? (this.arenaState = Wo(t, this.arenaState), r = or(n, this.arenaState, (m) => {
      this.arenaState = m, this.render(t);
    })) : o === "inputs" ? r = lr(n) : r = o === "guidance" ? rr(n, this.getAttribute("model")) : ur(n, o);
    const i = this.tabs(), d = [...i ? [i] : [], ...r.controls ?? []], a = c(
      "div",
      { class: "head" },
      c("div", { class: "title" }, c("h2", {}, t.title), c("span", { class: "meta" }, `${t.lanes.length} lanes`)),
      d.length ? c("div", { class: "controls" }, ...d) : null
    ), l = t.shot ? c("p", { class: "intent" }, c("span", { class: "id" }, "One shot description, composed per model: "), ps(t.shot)) : null;
    this.root.replaceChildren(c("style", {}, so), a, ...l ? [l] : [], s, c("div", { class: "body" }, ...r.nodes)), this.dataset.layout = o, this.unsubscribe = this.clock.subscribe((m) => {
      r.update(m), m.error && (s.textContent = m.error);
    });
  }
}
function Et(e = "model-arena") {
  customElements.get(e) || customElements.define(e, mr);
}
const pr = {
  referenceVideo: "reference video",
  referenceImage: "reference image",
  referenceAudio: "reference audio",
  frameImage: "frame image",
  audio: "driving audio",
  video: "video"
};
function fr(e, t) {
  const o = (r) => t.get(r.replace(/^\.\//, "")) ?? r, s = JSON.parse(JSON.stringify(e)), n = s.guide;
  if (n)
    for (const r of ["video", "audio", "firstFrame", "firstFrameStyled", "camera"]) n[r] && (n[r].src = o(n[r].src));
  for (const r of s.lanes) for (const i of r.inputsSent) i.src = o(i.src);
  return s;
}
function hr(e) {
  return [
    `Inputs sent: ${e.inputsSent.map((o) => `${pr[o.role] ?? o.role} ${o.label ?? o.src}`).join(", ") || "prompt only"}`,
    `Cost: ${W(e.costUsd)}${e.costUsd === null ? "" : " reported"} (estimate ${W(e.estimate.usd)})`,
    `Seconds: ${Xe(e.generationSeconds)} to generate`,
    `Model ran: ${e.modelRan ?? "not reported by the provider"}`,
    // An input the model was not sent belongs in the caption itself, not only in the notes.
    ...e.notes.filter((o) => o.startsWith("Music not sent"))
  ].join(" · ");
}
function gr(e) {
  const t = c("a", { class: "btn", download: `${e.id}.json`, "data-action": "record-json" }, "Download record JSON");
  try {
    t.href = URL.createObjectURL(new Blob([JSON.stringify(e, null, 2)], { type: "application/json" }));
  } catch {
    t.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(e))}`;
  }
  return t;
}
function br(e, t, o, s) {
  Et();
  const n = document.createElement("model-arena");
  n.setAttribute("layout", "guidance"), n.setRecord(fr(e.record, t), o);
  const r = c("a", { class: "btn", href: z(e.videoURL, o) ?? "#", download: "", target: "_blank", rel: "noopener noreferrer", "data-action": "download" }, "Download"), i = c("button", { type: "button", "data-action": "add" }, "Add to gallery"), d = c("span");
  i.addEventListener("click", () => {
    s(e.record), i.textContent = "Added", i.disabled = !0, d.replaceChildren(gr(e.record));
  });
  const a = c("details", { class: "cost-row" }, c("summary", {}, "Cost row for docs/costs.md"), c("pre", {}, e.costRowText.trim()));
  return c(
    "section",
    { class: "result", "aria-label": "Result" },
    n,
    c("p", { class: "caption", "data-caption": "" }, hr(e)),
    e.notes.length ? c("ul", { class: "notes" }, ...e.notes.map((l) => c("li", {}, l))) : null,
    c("div", { class: "row" }, r, i, d),
    a
  );
}
const wr = Cn.map((e) => `${e}: inherit;`).join(" "), Ho = (
  /* css */
  `
${Je}
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
model-arena, arena-key { ${wr} }
`
), de = () => typeof location > "u" ? "http://localhost/" : location.href;
class vr extends HTMLElement {
  static observedAttributes = ["guide-src", "preset"];
  /** A fake or wrapped fetch for the provider; the page's fetch otherwise. */
  fetch;
  pollOptions;
  /** Replaces the inline "spend up to" check. */
  confirm;
  root;
  urls = /* @__PURE__ */ new Map();
  base = de();
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
  attributeChangedCallback(t, o, s) {
    !this.ui || !s || s === o || (t === "preset" ? this.fetchPreset(s) : this.loadFrom(s));
  }
  /** A bundle: FileList, File[] or name → Blob. */
  set guide(t) {
    this.pending = this.setGuide(t, de());
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
  async loadPreset(t, o = de()) {
    this.ui || this.build();
    const s = this.ui;
    try {
      const n = _n(t), r = (a) => new URL(a, o).href, { files: i, dir: d } = await qt(r(n.bundle));
      await this.setGuide(i, d, !0);
      for (const a of ["character", "environment"]) {
        const l = n.references?.[a];
        await this.setRef(a, l ? await Kn(r(l)) : void 0);
      }
      if (n.shot) for (const [a] of pt) s.fields[a].value = n.shot[a] ?? "";
      n.model && s.setModel(n.model), s.override.value = n.prompt ?? "", s.own.open = !!s.override.value, this.refresh();
    } catch (n) {
      this.fail(`Could not load the preset: ${n.message}`);
    }
  }
  async fetchPreset(t) {
    try {
      const o = new URL(t, de()).href, s = await fetch(o);
      if (!s.ok) throw new Error(`HTTP ${s.status}`);
      this.pending = this.loadPreset(await s.json(), o), await this.pending;
    } catch (o) {
      this.fail(`Could not load the preset: ${o.message}`);
    }
  }
  async loadFrom(t) {
    try {
      const { files: o, dir: s } = await qt(new URL(t, de()).href);
      this.pending = this.setGuide(o, s, !0), await this.pending;
    } catch (o) {
      this.fail(`Could not load the guide bundle: ${o.message}`);
    }
  }
  keySource() {
    const t = this.getAttribute("key-panel"), o = t ? document.getElementById(t) : null;
    if (o && typeof o.getKey == "function") return o;
    const s = document.querySelector("arena-key");
    return s && typeof s.getKey == "function" ? s : this.ownKey;
  }
  shot() {
    const t = this.ui.fields, o = (s) => t[s].value.trim();
    return o("subject") ? { subject: o("subject"), action: o("action"), ...o("environment") ? { environment: o("environment") } : {}, ...o("legend") ? { legend: o("legend") } : {} } : null;
  }
  async setGuide(t, o, s = !1) {
    const n = this.ui ?? (this.build(), this.ui);
    try {
      const r = /* @__PURE__ */ new Map(), i = Array.isArray(t) || t.length !== void 0 ? Array.from(t) : null;
      if (i) for (const l of i) r.set(l.name.split(/[\\/]/).pop(), l);
      else for (const [l, m] of Object.entries(t)) r.set(l, m);
      const d = await Io(Do(t), s ? { base: o } : {});
      for (const [l, m] of this.urls) Object.values(this.refs).some((u) => u?.media.displaySrc === l) || URL.revokeObjectURL(m);
      this.urls = new Map([...r].filter(([l]) => !l.endsWith(".json")).map(([l, m]) => [l, URL.createObjectURL(m)]));
      for (const l of Object.values(this.refs)) l && this.urls.set(l.media.displaySrc ?? l.media.name, l.url);
      this.base = o, this.loaded = d;
      for (const [l] of pt) {
        const m = d.shot?.[l];
        m && !n.fields[l].value && !this.getAttribute(l) && (n.fields[l].value = m);
      }
      const a = d.meta;
      n.guideInfo.textContent = `Guide: ${d.video.name} · ${a.width}×${a.height} · ${a.fps} fps · ${d.seconds} s${d.audio ? ` · audio ${d.audio.name}` : " · no audio"}`, n.error.textContent = "", this.refresh();
    } catch (r) {
      this.fail(r.message);
    }
  }
  async setRef(t, o) {
    this.ui || this.build();
    const s = this.slots[t], n = this.refs[t];
    if (n && URL.revokeObjectURL(n.url), delete this.refs[t], s.shown.replaceChildren(), o)
      try {
        const r = await mt(o, t), i = o instanceof Blob ? o : o.blob, d = URL.createObjectURL(i);
        this.refs[t] = { input: o, media: r, url: d }, this.urls.set(r.displaySrc ?? r.name, d);
        const a = c("button", { type: "button", "data-action": `clear-${t}` }, "Remove");
        a.addEventListener("click", () => {
          this.setRef(t, void 0).then(() => this.refresh());
        }), s.shown.append(c("img", { src: d, alt: t === "character" ? "Character sheet" : "Environment" }), c("span", { class: "note" }, `${r.name}${r.info?.width ? ` · ${r.info.width}×${r.info.height}` : ""}`), a);
      } catch (r) {
        this.fail(r.message, "refused");
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
    t.preview.replaceChildren(Xn({ shot: this.shot(), override: t.override.value, model: t.model(), facts: o }));
    let s = "Load a guide bundle to see the estimate.";
    if (this.loaded)
      try {
        const n = No({ guide: this.loaded, model: t.model(), shot: this.shot() ?? void 0, prompt: t.override.value, character: this.refs.character?.media, environment: this.refs.environment?.media });
        s = `Estimated ${W(n.plan.estimate.usd)} (${n.plan.estimate.basis}). Sends: ${n.plan.inputsSent.map((r) => `${r.role} ${r.label}`).join(", ")}.`;
      } catch (n) {
        s = n.message;
      }
    t.estimate.textContent = s, t.run.disabled = !this.loaded || !!this.abort;
  }
  askInline(t) {
    const o = this.ui.confirmSlot;
    return new Promise((s) => {
      const n = c("button", { type: "button", class: "primary", "data-action": "confirm" }, `Spend up to ${W(t.usd)}`), r = c("button", { type: "button", "data-action": "cancel" }, "Cancel"), i = (d) => (o.replaceChildren(), s(d));
      n.addEventListener("click", () => i(!0)), r.addEventListener("click", () => i(!1)), o.replaceChildren(
        c("div", { class: "confirm", role: "group", "aria-label": "Confirm cost" }, c("p", { class: "caption" }, `${t.modelName}: estimated ${W(t.usd)} (${t.basis}); your cap is ${W(t.maxPrice)}.`), c("div", { class: "row" }, n, r))
      ), n.focus();
    });
  }
  async run() {
    const t = this.ui;
    if (!this.loaded) return;
    const o = this.keySource();
    if (!o?.connected) return this.fail("Connect your Runware key first.", "invalid-key");
    this.abort = new AbortController(), t.run.disabled = !0, t.stop.hidden = !1, t.error.textContent = "", t.result.replaceChildren();
    try {
      const s = await Pn({
        guide: this.loaded,
        model: t.model(),
        shot: this.shot() ?? void 0,
        prompt: t.override.value,
        references: this.references,
        maxPrice: Number(t.maxPrice.value),
        key: o.getKey,
        confirm: this.confirm ?? ((i) => this.askInline(i)),
        signal: this.abort.signal,
        fetch: this.fetch,
        poll: this.pollOptions,
        onProgress: (i) => {
          t.status.textContent = `${i.stage}: ${i.message}${i.progress !== void 0 ? ` ${i.progress}%` : ""}`, this.dispatchEvent(new CustomEvent("arena-generate-progress", { bubbles: !0, composed: !0, detail: { ...i } }));
        }
      });
      t.result.replaceChildren(
        br(
          s,
          this.urls,
          this.base,
          (i) => this.dispatchEvent(new CustomEvent("arena-gallery-add", { bubbles: !0, composed: !0, detail: { record: i, base: this.base } }))
        )
      );
      const { task: n, ...r } = s;
      this.dispatchEvent(new CustomEvent("arena-generate-result", { bubbles: !0, composed: !0, detail: r }));
    } catch (s) {
      const n = s instanceof P ? s : new P("provider", s.message);
      this.fail(n.message, n.code);
    } finally {
      this.abort = void 0, t.stop.hidden = !0, t.confirmSlot.replaceChildren(), this.refresh();
    }
  }
  build() {
    const t = Bn((s) => this.getAttribute(s));
    this.ui = t, this.slots = {
      character: Yt("character", (s) => {
        this.setRef("character", s);
      }),
      environment: Yt("environment", (s) => {
        this.setRef("environment", s);
      })
    }, t.bundleInput.addEventListener("change", () => t.bundleInput.files?.length && void (this.pending = this.setGuide(t.bundleInput.files, de()))), t.run.addEventListener("click", () => {
      this.run();
    }), t.stop.addEventListener("click", () => this.abort?.abort());
    for (const s of [...Object.values(t.fields), t.override]) s.addEventListener("input", () => this.refresh());
    for (const { r: s } of t.radios) s.addEventListener("change", () => this.refresh());
    const o = c("div");
    this.keySource() || (Go(), this.ownKey = document.createElement("arena-key"), o.append(this.ownKey)), this.root.replaceChildren(
      c("style", {}, Ho),
      c(
        "div",
        { class: "wrap" },
        c("h3", {}, "Generate from this guide"),
        o,
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
function yr(e = "arena-generate") {
  customElements.get(e) || customElements.define(e, vr);
}
const ct = () => typeof location > "u" ? "http://localhost/" : location.href, ao = 50;
function xr(e) {
  return e ? [`${e.subject} ${e.action}`.trim(), e.environment, e.legend].filter(Boolean).join(" · ") : null;
}
class $r extends HTMLElement {
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
    Et(), this.getAttribute("src") || this.render();
  }
  attributeChangedCallback(t, o, s) {
    s && s !== o && this.fetchList(s);
  }
  get records() {
    return this.entries.map((t) => t.record);
  }
  set records(t) {
    this.entries = [], this.skipped = [];
    for (const o of Array.isArray(t) ? t.slice(0, ao) : []) this.accept(o, ct());
    this.index = 0, this.render();
  }
  /** Adds a record and shows it. Returns false when it does not validate. */
  add(t, o = ct()) {
    const s = this.accept(t, o);
    return s && (this.index = this.entries.length - 1), this.render(), s;
  }
  accept(t, o) {
    try {
      const s = ue(t), n = this.entries.findIndex((r) => r.record.id === s.id);
      return n >= 0 ? this.entries[n] = { record: s, base: o } : this.entries.push({ record: s, base: o }), !0;
    } catch (s) {
      return this.skipped.push(s.message), !1;
    }
  }
  async fetchList(t) {
    const o = ++this.load;
    try {
      const s = new URL(t, ct()).href, n = await fetch(s);
      if (!n.ok) throw new Error(`HTTP ${n.status}`);
      const r = await n.json(), i = Array.isArray(r) ? r : Array.isArray(r.records) ? r.records : null;
      if (!i) throw new Error("expected an array of records");
      const d = [];
      this.skipped = [];
      for (const a of i.slice(0, ao))
        if (typeof a == "string") {
          const l = new URL(a, s).href, m = await fetch(l);
          if (!m.ok) {
            this.skipped.push(`${a}: HTTP ${m.status}`);
            continue;
          }
          d.push(...this.tryParse(await m.json(), l));
        } else d.push(...this.tryParse(a, s));
      if (o !== this.load) return;
      this.entries = d, this.index = 0, this.render();
    } catch (s) {
      o === this.load && this.render(`Could not load ${t}: ${s.message}`);
    }
  }
  tryParse(t, o) {
    try {
      return [{ record: ue(t), base: o }];
    } catch (s) {
      return this.skipped.push(s.message), [];
    }
  }
  render(t) {
    const o = c("style", {}, Ho);
    if (!this.entries.length) {
      this.root.replaceChildren(
        o,
        c("div", { class: "empty", "data-empty": "" }, c("strong", {}, "No published runs yet"), t ?? "Runs added to the gallery show up here, playable without a key.")
      );
      return;
    }
    const s = this.entries[Math.min(this.index, this.entries.length - 1)], n = !!s.record.guide, r = n ? this.view : "arena", i = c("div", { class: "switch", role: "group", "aria-label": "Run" });
    this.entries.forEach((h, w) => {
      const f = c("button", { type: "button", "aria-pressed": String(h === s), "data-record": h.record.id }, h.record.title.slice(0, 48));
      f.addEventListener("click", () => (this.index = w, this.render())), i.append(f);
    });
    const d = c("div", { class: "switch", role: "group", "aria-label": "View" });
    for (const [h, w] of [["inputs", "Inputs and outputs"], ["guidance", "Guide beside output"], ["arena", "All outputs"]]) {
      const f = c("button", { type: "button", "aria-pressed": String(r === h), "data-view": h }, w);
      f.disabled = h !== "arena" && !n, f.addEventListener("click", () => (this.view = h, this.render())), d.append(f);
    }
    const a = document.createElement("model-arena");
    a.setAttribute("layout", r), a.setRecord(s.record, s.base);
    const l = s.record.lanes.find((h) => h.shot) ?? s.record.lanes[0], m = xr(l?.shot ?? s.record.shot), u = zn(s.record, s.base);
    let p = null;
    u && (p = c("button", { type: "button", "data-action": "run-yourself" }, "Run this yourself"), p.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("arena-run-yourself", { bubbles: !0, composed: !0, detail: { preset: u, record: s.record } }));
      const h = this.getAttribute("generate"), w = h ? document.getElementById(h) : null;
      w?.loadPreset && (w.loadPreset(u), w.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    })), this.root.replaceChildren(
      o,
      c(
        "div",
        { class: "wrap" },
        c("div", { class: "row spread" }, i, d),
        a,
        c("div", { class: "row spread" }, m ? c("p", { class: "caption", "data-shot": "" }, c("strong", {}, "Shot: "), m) : c("span"), p),
        this.skipped.length ? c("p", { class: "note" }, `${this.skipped.length} record(s) skipped: ${this.skipped[0]}`) : null
      )
    );
  }
}
function kr(e = "arena-gallery") {
  customElements.get(e) || customElements.define(e, $r);
}
const Sr = () => typeof location > "u" ? "http://localhost/" : location.href;
function Ir(e, t, o, s = 24) {
  return Number.isFinite(t) ? o ? Math.abs(e - t) > 1e-3 : Math.abs(e - t) > 1 / s : !1;
}
const Er = (
  /* css */
  `
${Je}
:host { display: block; position: relative; background: #000; border-radius: var(--ma-radius); overflow: hidden; aspect-ratio: 16 / 9; }
video { width: 100%; height: 100%; display: block; object-fit: contain; }
.err { position: absolute; inset: auto 8px 8px 8px; margin: 0; font: 12px var(--ma-font); color: var(--ma-warn); }
.err:empty { display: none; }
`
);
class Pr extends HTMLElement {
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
    }), this.root.replaceChildren(c("style", {}, Er), this.video, this.err);
  }
  attributeChangedCallback(t) {
    if (t === "src") {
      const o = z(this.getAttribute("src") ?? "", Sr());
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
    const o = this.video.duration, s = Math.max(0, Number.isFinite(o) && o > 0 ? Math.min(t, o) : t);
    this.target = s, Ir(this.video.currentTime, s, this.video.paused, this.fps) && (this.video.currentTime = s);
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
function Ar(e = "arena-player") {
  customElements.get(e) || customElements.define(e, Pr);
}
const Ur = (e) => Math.round(e * 1e6) / 1e6;
function Rr(e, t) {
  if (e.outputTokensPerImage === void 0 || t.references > 0 && e.inputTokensPerImage === void 0) return null;
  const o = new TextEncoder().encode(t.prompt ?? "").length;
  return Ur(
    e.outputTokensPerImage * e.rates.imageOutput + o * e.rates.textInput + t.references * (e.inputTokensPerImage ?? 0) * e.rates.imageInput
  );
}
const Mr = (e) => Math.max(...e.examples.map((t) => t.usd)), Xo = (e) => e.examples.map((t) => `${t.mode} $${t.usd}`).join(", ");
function Jo(e, t) {
  const o = Rr(e, t);
  return o !== null ? { usd: o, basis: `up to $${o} (priced per token: ${e.ratesText})` } : {
    usd: null,
    basis: `priced per token (${e.ratesText}); Runware publishes no token count for this size and quality, so there is no upper bound. Published examples: ${Xo(e)}`
  };
}
const ee = "https://runware.ai/docs/models", Te = "13 Nov 2026", gt = ["FLUX", "OpenAI GPT Image", "MiniMax H3", "ByteDance Seedream", "Kling IMAGE"], ae = (e) => ({ slug: e, schemaUrl: `${ee}/${e}/schema.json`, pageUrl: `${ee}/${e}` }), Yo = (e, t) => () => ({ usd: e, basis: t }), Zo = (e) => Object.values(e.pairs).flat(), Qo = (e, t, o) => Object.entries(e.pairs).find(([, s]) => s.some(([n, r]) => n === t && r === o))?.[0], Tr = {
  key: "klein-9b",
  air: "runware:400@2",
  ...ae("bfl-flux-2-klein-9b"),
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
    source: `${ee}/bfl-flux-2-klein-9b/schema.json x-pricing`,
    read: "10 Nov 2026"
  },
  // No per-unit rate: "billed by compute time". The bound is the highest published example price.
  estimate: Yo(338e-5, "no published rate (compute-time billing); bounded by the highest published example, $0.00338")
}, co = [[512 * 512, 3e-3], [1024 * 1024, 6e-3], [2048 * 2048, 0.0179], [4096 * 4096, 0.1013]], lo = [[768 * 1344, 0.0149], [1024 * 1536, 0.0149]], Fr = {
  key: "flux-3-image-klein",
  air: "bfl:flux@3-image-klein",
  ...ae("bfl-flux-3-image-klein"),
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
    source: `${ee}/bfl-flux-3-image-klein/schema.json x-pricing`,
    read: Te
  },
  estimate(e) {
    const t = (e.width ?? 1280) * (e.height ?? 720), o = co.find(([i]) => i >= t) ?? co.at(-1), s = Math.round(Math.sqrt(o[0]));
    let n = o[1], r = `compute-time billing, no rate; bounded by the measured run at ${s}×${s} (16 steps), $${o[1]}`;
    if (e.references > 0) {
      const i = Math.max(...lo.map(([a]) => a));
      if (t > i)
        return { usd: null, basis: `compute-time billing; no published run with reference images above ${(i / 1e6).toFixed(2)} MP, so no bound` };
      const d = Math.max(...lo.map(([, a]) => a));
      d > n && (n = d, r = `compute-time billing, no rate; bounded by the highest published reference example, $${d}`);
    }
    return { usd: n, basis: r };
  },
  notOffered: ["settings.boundingBoxes", "steps", "seed"]
}, uo = { "0.75K": 0.041, "1K": 0.048, "2K": 0.1, "4K": 0.607 }, qo = {
  key: "flux-3-image",
  air: "bfl:flux@3-image",
  ...ae("bfl-flux-3-image"),
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
    source: `${ee}/bfl-flux-3-image/schema.json x-pricing`,
    read: Te
  },
  estimate(e) {
    const t = e.resolution ?? (e.width && e.height ? Qo(qo.size, e.width, e.height) : "1K") ?? "4K";
    return { usd: uo[t], basis: `x-pricing: ${t} at $${uo[t]} per image` };
  },
  notOffered: ["settings.boundingBoxes", "settings.grounding", "settings.safetyTolerance"]
}, Lr = { textInput: 5e-6, imageInput: 8e-6, imageOutput: 3e-5 }, mo = "text input $5.00, image input $8.00, image output $30.00 per 1M tokens", es = (e, t) => {
  const o = `openai-gpt-image-2-6-${e.toLowerCase()}`, s = { rates: Lr, ratesText: mo, examples: t };
  return {
    key: `gpt-image-2.6-${e.toLowerCase()}`,
    air: `openai:gpt-image@2.6-${e.toLowerCase()}`,
    ...ae(o),
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
    pricing: { kind: "token", summary: `Per token: ${mo}`, source: `${ee}/${o}/schema.json x-pricing`, read: Te },
    tokens: s,
    estimate: (n) => Jo(s, n),
    notOffered: ["inputs.maskImage", "inputs.markupImage", "outputFormat SVG and GIF (no references allowed beside them)", "settings.quality", "settings.thinkingLevel"]
  };
}, jr = es("Flare", [
  { mode: "inpaint", usd: 0.0587 },
  { mode: "text-to-gif", usd: 0.118 },
  { mode: "text-to-image", usd: 0.167 },
  { mode: "text-to-vector", usd: 0.174 },
  { mode: "transparent-background", usd: 0.175 },
  { mode: "reference-to-image", usd: 0.193 }
]), Vr = es("Sunburst", [
  { mode: "text-to-gif", usd: 0.0374 },
  { mode: "text-to-image", usd: 0.0431 },
  { mode: "text-to-vector", usd: 0.0634 },
  { mode: "inpaint", usd: 0.0771 },
  { mode: "transparent-background", usd: 0.0788 },
  { mode: "reference-to-image", usd: 0.192 }
]), ts = (e) => {
  const t = e ? "minimax-h3-image-highspeed" : "minimax-h3-image", o = e ? {
    rates: { textInput: 23e-7, imageInput: 3e-6, imageOutput: 76e-7 },
    ratesText: "text input $2.30, image input $3.00, image output $7.60 per 1M tokens",
    examples: [{ mode: "text-to-image", usd: 0.0418 }, { mode: "text-to-image", usd: 0.0422 }, { mode: "reference-to-image", usd: 0.0725 }, { mode: "reference-to-image", usd: 0.0743 }]
  } : {
    rates: { textInput: 23e-7, imageInput: 15e-7, imageOutput: 38e-7 },
    ratesText: "text input $2.30, image input $1.50, image output $3.80 per 1M tokens",
    examples: [{ mode: "text-to-image", usd: 0.0176 }, { mode: "text-to-image", usd: 0.0189 }, { mode: "reference-to-image", usd: 0.0432 }, { mode: "reference-to-image", usd: 0.0432 }]
  };
  return {
    key: e ? "h3-image-highspeed" : "h3-image",
    air: e ? "minimax:h3@image-highspeed" : "minimax:h3@image",
    ...ae(t),
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
    pricing: { kind: "token", summary: `Per token: ${o.ratesText}`, source: `${ee}/${t}/schema.json x-pricing`, read: Te },
    tokens: o,
    estimate: (s) => Jo(o, s),
    notOffered: ["settings.promptOptimizer (must stay on without width/height or with references)"]
  };
}, Cr = ts(!1), Nr = ts(!0), Or = 261e4, Dr = {
  key: "seedream-5.5",
  air: "bytedance:seedream@5.5",
  ...ae("bytedance-seedream-5-5"),
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
    source: `${ee}/bytedance-seedream-5-5/schema.json x-pricing`,
    read: Te
  },
  estimate(e) {
    const t = e.resolution ? e.resolution !== "2K" : e.width && e.height ? e.width * e.height <= Or : !1, o = t ? 0.02 : 0.035, s = 8e-3 * e.references, n = Math.round((o + s) * 1e4) / 1e4, r = t ? "up to 1.5K (2.61 MP)" : `2K (above 2.61 MP)${e.resolution || e.width ? "" : ", the schema default"}`;
    return { usd: n, basis: `x-pricing: ${r} at $${o} per image${e.references ? ` + $0.008 × ${e.references} input image${e.references > 1 ? "s" : ""}` : ""}` };
  },
  notOffered: ["settings.layerDecomposition", "settings.safetyIdentifier"]
}, Br = {
  key: "kling-image-3",
  air: "klingai:kling-image@3",
  ...ae("klingai-image-3-0"),
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
  pricing: { kind: "per-image", summary: "$0.028 per image", source: `${ee}/klingai-image-3-0/schema.json x-pricing`, read: "10 Nov 2026" },
  estimate: Yo(0.028, "x-pricing: $0.028 per image")
}, me = [
  Tr,
  qo,
  Fr,
  jr,
  Vr,
  Cr,
  Nr,
  Dr,
  Br
];
function Gr(e) {
  const t = me.find((o) => o.key === e || o.air === e || o.slug === e);
  if (!t) throw new x(`Unknown image model "${e}". Use one of: ${me.map((o) => o.key).join(", ")}.`);
  return t;
}
const bt = ["PNG", "JPG", "WEBP"], be = (e) => Number.isInteger(e) ? String(e) : e.toFixed(2);
function wt(e) {
  if (e.kind === "list") {
    const o = Object.entries(e.pairs).map(([s, n]) => `${n.length} at ${s}`);
    return `${Zo(e).length} fixed width×height pairs (${o.join(", ")}; default ${e.default.join("×")}); with a reference, resolution ${e.withReference.values.join("/")}${e.pairsWithReference ? " or a listed pair" : ""}`;
  }
  const t = [`${e.min}-${e.max} px a side${e.multipleOf > 1 ? ` in multiples of ${e.multipleOf}` : ""}`];
  return e.area && t.push(`${(e.area.min / 1e6).toFixed(2)}-${(e.area.max / 1e6).toFixed(2)} MP`), e.ratio && t.push(`aspect ${be(e.ratio.min)}-${be(e.ratio.max)}`), e.resolution && t.push(`or resolution ${e.resolution.values.join("/")}`), t.join(", ");
}
function po(e, t, o) {
  if (t < e.min || t > e.max || o < e.min || o > e.max || t % e.multipleOf || o % e.multipleOf)
    return `sizes are ${e.min}-${e.max} px${e.multipleOf > 1 ? ` in multiples of ${e.multipleOf}` : ""}`;
  if (e.area && (t * o < e.area.min || t * o > e.area.max)) return `width × height must be ${e.area.min}-${e.area.max} px`;
  if (e.ratio && (t / o < e.ratio.min - 1e-9 || t / o > e.ratio.max + 1e-9)) return `the aspect must be ${be(e.ratio.min)}-${be(e.ratio.max)}`;
}
function _r(e, t, o) {
  let s = 1;
  e.area && t * o < e.area.min && (s = Math.sqrt(e.area.min / (t * o))), e.area && t * o > e.area.max && (s = Math.sqrt(e.area.max / (t * o)));
  const n = s > 1 ? Math.ceil : s < 1 ? Math.floor : Math.round, r = (i) => Math.min(e.max, Math.max(e.min, n(i * s / e.multipleOf) * e.multipleOf));
  return [r(t), r(o)];
}
function Kr(e, t, o) {
  const s = e.references, { width: n, height: r, bytes: i } = t.info ?? {};
  if (s.maxBytes && i && i > s.maxBytes)
    throw new x(`${e.name} takes reference images up to ${Math.round(s.maxBytes / 1048576)} MB; ${t.name} is ${(i / 1048576).toFixed(1)} MB. Re-save it smaller.`);
  if (!n || !r) {
    (s.minSide || s.maxSide || s.minRatio || s.maxPixels) && o.push(`${t.name}: its size is not known here, so ${e.name}'s reference limits were not checked; Runware checks them.`);
    return;
  }
  if (s.minSide && Math.min(n, r) < s.minSide)
    throw new x(`${e.name} takes reference images at least ${s.minSide} px a side; ${t.name} is ${n}×${r}. Use a larger image.`);
  if (s.maxSide && Math.max(n, r) > s.maxSide)
    throw new x(`${e.name} takes reference images up to ${s.maxSide} px a side; ${t.name} is ${n}×${r}. Resize it.`);
  if (s.maxPixels && n * r > s.maxPixels)
    throw new x(`${e.name} takes reference images up to ${s.maxPixels / 1e6} MP; ${t.name} is ${(n * r / 1e6).toFixed(1)} MP. Resize it.`);
  if (s.minRatio && n / r < s.minRatio || s.maxRatio && n / r > s.maxRatio)
    throw new x(`${e.name} takes reference images with aspect ${be(s.minRatio ?? 0)}-${be(s.maxRatio ?? 1 / 0)}; ${t.name} is ${(n / r).toFixed(2)}. Crop it.`);
}
function zr(e, t = globalThis.crypto.randomUUID()) {
  const o = Gr(e.model), s = e.prompt.trim();
  if (s.length < o.prompt.min || s.length > o.prompt.max)
    throw new x(`${o.name} takes a prompt of ${o.prompt.min}-${o.prompt.max} characters.`);
  const n = { taskType: "imageInference", taskUUID: t, model: o.air, positivePrompt: s }, r = [], i = [], d = [], a = [...e.reference ? [e.reference] : [], ...e.references ?? []];
  if (a.length > o.references.max)
    throw new x(`${o.name} takes ${o.references.max === 1 ? "one reference image" : `up to ${o.references.max} reference images`}; got ${a.length}.`);
  if (a.length) {
    const w = a.map((f) => {
      if (Kr(o, f, d), i.push({ role: "referenceImage", src: f.displaySrc ?? f.name, label: f.name }), /^https:\/\//.test(f.ref)) return f.ref;
      if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(f.ref)) throw new x(`${f.name}: the reference must be an https URL or an image file.`);
      const g = Lo(r.length + 1, f.name);
      return r.push({ placeholder: g, media: f }), g;
    });
    n.inputs = { referenceImages: w };
  }
  const l = a.find((w) => w.info?.width && w.info?.height), m = o.size;
  if (e.width !== void 0 && e.resolution) throw new x(`${o.name} takes a resolution or a width and height, not both.`);
  m.kind === "grid" ? Wr(o, m, e, l, n, d) : Hr(o, m, e, a.length > 0, n, d);
  const u = e.outputFormat ?? "PNG";
  if (!bt.includes(u) || !o.outputFormats.includes(u))
    throw new x(`${o.name} still formats: ${o.outputFormats.filter((w) => bt.includes(w)).join(", ")}.`);
  if (e.transparent) {
    if (!o.transparency) throw new x(`${o.name} has no transparent background in its schema; pick one that has (${me.filter((w) => w.transparency).map((w) => w.key).join(", ")}).`);
    if (u === "JPG") throw new x(`${o.name} makes a transparent background only as PNG or WEBP.`);
    n.settings = { background: "transparent" };
  }
  Object.assign(n, { outputType: "URL", outputFormat: u, numberResults: 1, deliveryMethod: "async", includeCost: !0 });
  const p = o.estimate({
    width: n.width,
    height: n.height,
    resolution: n.resolution,
    references: a.length,
    prompt: s
  });
  let h;
  return p.usd === null && o.tokens ? (h = { highestExampleUsd: Mr(o.tokens), rates: o.tokens.ratesText, examples: Xo(o.tokens) }, d.push(`${o.name}: no published upper bound (${p.basis}). A run needs allowUnpriced (CLI --allow-unpriced); the cap is then compared with the highest published example, $${h.highestExampleUsd}.`)) : p.usd === null && d.push(`${o.name}: no price estimate (${p.basis}). A run with a price cap is refused.`), { modelId: o.air, modelName: o.name, uploads: r, task: n, inputsSent: i, estimate: p, ...h ? { unpriced: h } : {}, notes: d };
}
function Wr(e, t, o, s, n, r) {
  if (o.resolution) {
    if (!t.resolution) throw new x(`${e.name} has no resolution preset; give --width and --height (${wt(t)}).`);
    if (!t.resolution.values.includes(o.resolution)) throw new x(`${e.name} resolutions: ${t.resolution.values.join(", ")}.`);
    n.resolution = o.resolution;
    return;
  }
  if (o.width !== void 0 || o.height !== void 0) {
    const [a, l] = [o.width ?? 0, o.height ?? 0], m = po(t, a, l);
    if (m) throw new x(`${e.name} ${m}; got ${a}×${l}. Rule: ${wt(t)}.`);
    n.width = a, n.height = l;
    return;
  }
  let [i, d] = t.default;
  if (s) {
    const [a, l] = [s.info.width, s.info.height], [m, u] = _r(t, a, l);
    po(t, m, u) ? r.push(`${s.name} (${a}×${l}) does not fit ${e.name}'s output sizes, so the still is ${i}×${d}; the reference is sent as it is.`) : ([i, d] = [m, u], (m !== a || u !== l) && r.push(`Output size ${m}×${u}, ${t.multipleOf > 1 && !t.area ? `snapped (multiples of ${t.multipleOf})` : "fitted to the model's size rule"} from ${s.name}'s ${a}×${l}; the reference is sent as it is.`));
  }
  n.width = i, n.height = d;
}
function Hr(e, t, o, s, n, r) {
  const i = Zo(t), d = (u, p) => i.some(([h, w]) => h === u && w === p);
  if (s && (o.width === void 0 || !t.pairsWithReference)) {
    if (o.width !== void 0)
      throw new x(`${e.name} with a reference takes --resolution (${t.withReference.values.join(" or ")}), not a width and height; the output follows the reference's aspect.`);
    const u = o.resolution ?? t.withReference.default;
    if (!t.withReference.values.includes(u)) throw new x(`${e.name} resolutions: ${t.withReference.values.join(", ")}.`);
    n.resolution = u, r.push(`${e.name} matches the reference's aspect ratio at ${u}.`);
    return;
  }
  if (o.resolution) throw new x(`${e.name} takes --resolution only beside a reference image.`);
  const [a, l] = [o.width ?? t.default[0], o.height ?? t.default[1]];
  if (!d(a, l)) throw new x(`${e.name} sizes: ${i.map(([u, p]) => `${u}×${p}`).join(", ")}.`);
  n.width = a, n.height = l;
  const m = Qo(t, a, l);
  m && Object.keys(t.pairs).length > 1 && r.push(`${a}×${l} is a ${m} size.`);
}
function Xr(e, t, o = !1) {
  const s = e.estimate;
  if (s.usd !== null)
    return s.usd > t ? { ok: !1, code: "over-price", message: `Estimated $${s.usd.toFixed(4)} (${s.basis}) is over your cap of $${t.toFixed(2)}.` } : { ok: !0, usd: s.usd, basis: s.basis, priced: "bound" };
  const n = e.unpriced;
  return n ? o ? n.highestExampleUsd > t ? { ok: !1, code: "over-price", message: `${e.modelName} has no published bound, and its highest published example, $${n.highestExampleUsd}, is over your cap of $${t.toFixed(2)}.` } : {
    ok: !0,
    usd: n.highestExampleUsd,
    basis: `no published upper bound: priced per token (${n.rates}); highest published example $${n.highestExampleUsd} (examples: ${n.examples}). The real cost may be higher.`,
    priced: "unpriced",
    rates: n.rates,
    examples: n.examples
  } : { ok: !1, code: "no-estimate", message: `${e.modelName} is priced per token (${n.rates}) and Runware publishes no upper bound for it. Pass allowUnpriced: true to run it with the cap compared to the highest published example ($${n.highestExampleUsd}).` } : { ok: !1, code: "no-estimate", message: `No price estimate for ${e.modelName} (${s.basis}); it cannot be checked against maxPrice.` };
}
async function Jr(e, t, o = {}) {
  const s = /* @__PURE__ */ new Map();
  for (const d of t.uploads)
    o.onUpload?.(d.media.name), s.set(d.placeholder, (await e.upload(d.media.ref, o.signal)).mediaUUID);
  const n = Vo(t.task, s);
  o.onSubmit?.();
  const { errors: r } = await e.post([n], o.signal), i = r.filter((d) => !d.taskUUID || d.taskUUID === n.taskUUID);
  if (i.length) throw new Q(400, i);
  return { task: n, result: await vn(e, String(n.taskUUID), o) };
}
const Yr = /^[\x21-\x7e]{16,512}$/, fo = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
async function Zr(e, t) {
  const o = `reference ${t + 1}`;
  if (typeof e == "string") {
    if (!/^https:\/\//.test(e)) throw new P("refused", `The ${o} URL must start with https://.`);
    const d = decodeURIComponent(new URL(e).pathname.split("/").pop() || o);
    return { name: d, contentType: Ue(d) ?? "image/*", ref: e, displaySrc: e };
  }
  const s = e instanceof Blob ? e : e.blob;
  if (!(s instanceof Blob)) throw new P("refused", `The ${o} must be an image Blob or an https URL.`);
  if (!fo[s.type]) throw new P("refused", `The ${o} must be PNG, JPEG or WebP; got ${s.type || "an unknown type"}.`);
  let r = ((e instanceof Blob ? e.name : e.name ?? e.blob.name) || `reference-${t + 1}`).split(/[\\/]/).pop();
  Ue(r) !== s.type && (r = `${r.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${fo[s.type]}`);
  const i = e instanceof Blob ? void 0 : e.src;
  try {
    return await ko(De(s, r), i && /^https?:\/\//.test(i) ? i : void 0);
  } catch (d) {
    throw new P("refused", `The ${o}: ${d.message}`);
  }
}
async function si(e) {
  const t = e.key, o = typeof t == "function" ? t : typeof t == "string" ? () => t : () => t.getKey(), s = new Ne({ getKey: o, fetch: e.fetch }), n = (d) => s.redact(d), r = (d) => e.onProgress?.(d);
  let i;
  try {
    if (!(typeof e.maxPrice == "number" && Number.isFinite(e.maxPrice) && e.maxPrice > 0 && e.maxPrice <= 100))
      throw new P("refused", "maxPrice must be a positive number of USD up to 100.");
    const d = o();
    if (!d || !Yr.test(d)) throw new P("invalid-key", "Connect a Runware API key first (16-512 characters, no spaces).");
    r({ stage: "plan", message: "checking the references" });
    const a = await Promise.all((e.references ?? []).map(Zr)), l = e.size ?? {}, m = zr(
      {
        model: e.model,
        prompt: e.prompt,
        references: a,
        ...l.resolution !== void 0 ? { resolution: l.resolution } : {},
        ...l.width !== void 0 || l.height !== void 0 ? { width: l.width, height: l.height } : {},
        ...e.transparent ? { transparent: !0 } : {},
        ...e.outputFormat ? { outputFormat: e.outputFormat } : {}
      },
      e.taskUUID
    ), u = Xr(m, e.maxPrice, e.allowUnpriced === !0);
    if (!u.ok) throw new P(u.code, u.message);
    if (r({ stage: "confirm", message: u.priced === "bound" ? `up to $${u.usd.toFixed(4)}` : `no published bound; highest example $${u.usd}` }), !await e.confirm({
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
    const h = Date.now(), { task: w, result: f } = await Jr(s, m, {
      timeoutMs: 10 * 6e4,
      ...e.poll,
      signal: e.signal,
      onUpload: (U) => r({ stage: "upload", message: `uploading ${U}` }),
      onSubmit: () => {
        i = String(m.task.taskUUID), r({ stage: "submit", message: "submitting" });
      },
      onProgress: (U, F) => r({ stage: "poll", message: U, progress: F })
    }), g = (Date.now() - h) / 1e3, b = {
      date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      model: m.modelId,
      modelRan: m.modelId,
      taskUUID: f.taskUUID,
      duration: "-",
      resolution: go(w),
      inputs: m.inputsSent.length ? m.inputsSent.map((U) => U.role).join("+") : "prompt",
      estimateUsd: m.estimate.usd,
      costUsd: f.cost,
      seconds: g,
      output: f.imageURL,
      status: "ok (browser)"
    }, y = [...m.notes];
    return a.length && y.push(`${a.length === 1 ? "The reference was" : `All ${a.length} references were`} sent as given: none resized or dropped.`), u.priced === "unpriced" && y.push(`Ran without a published bound (allowUnpriced): the cap was compared with the highest published example, $${u.usd}; the cost Runware reported is ${f.cost === null ? "missing" : `$${f.cost}`}.`), f.cost !== null && f.cost > e.maxPrice && y.push(`Reported cost $${f.cost} is over the cap of $${e.maxPrice}.`), r({ stage: "done", message: "done" }), {
      imageURL: f.imageURL,
      costUsd: f.cost,
      taskUUID: f.taskUUID,
      // A named model runs as asked; there is no router on this path.
      modelRan: m.modelId,
      estimate: m.estimate,
      inputsSent: m.inputsSent,
      notes: y,
      generationSeconds: g,
      costRow: b,
      costRowText: ho(b),
      task: w
    };
  } catch (d) {
    throw Bo(d, e.signal, i, n);
  }
}
function Qr(e) {
  const t = e.size.default;
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
      outputFormats: e.outputFormats.filter((o) => bt.includes(o)),
      notOffered: [...e.notOffered ?? []]
    },
    prompt: { ...e.prompt },
    size: { rule: structuredClone(e.size), summary: wt(e.size), default: [t[0], t[1]] },
    estimate: e.estimate({ width: t[0], height: t[1], references: 0 }),
    pricing: { ...e.pricing },
    schemaUrl: e.schemaUrl,
    pageUrl: e.pageUrl
  };
}
const qr = () => [...me].sort((e, t) => gt.indexOf(e.family) - gt.indexOf(t.family) || me.indexOf(e) - me.indexOf(t));
function ei() {
  return qr().map(Qr);
}
function ni() {
  const e = ei();
  return gt.map((t) => ({ family: t, models: e.filter((o) => o.family === t) })).filter((t) => t.models.length);
}
Et();
Go();
Ar();
yr();
kr();
export {
  $r as ArenaGallery,
  vr as ArenaGenerate,
  On as ArenaKey,
  Pr as ArenaPlayer,
  un as COMPARE_MODEL_KEYS,
  he as GUIDE_MODEL_KEYS,
  P as GenerateError,
  mr as ModelArena,
  Ne as RunwareClient,
  bt as STILL_FORMATS,
  Cn as TOKEN_NAMES,
  Xr as checkImagePrice,
  hn as comparePrompts,
  ti as composePrompt,
  wt as describeSize,
  Do as entriesOf,
  Pn as generateFromGuide,
  si as generateImage,
  Co as guideModels,
  ni as imageFamilies,
  ei as imageModels,
  Xt as keyProblem,
  Io as loadGuideBundle,
  Ir as needsSeek,
  oi as offeredModels,
  So as parseGuideShot,
  _n as parsePreset,
  ue as parseRecord,
  No as planGuideLane,
  zr as planImage,
  zn as presetFromRecord,
  He as previewPrompt,
  Jr as runImage,
  Rr as tokenBound
};
