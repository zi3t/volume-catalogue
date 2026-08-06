/**
 * Records the WebGL calls a scene actually makes: shader sources per program,
 * uniform values as uploaded, texture uploads by dimension, and the material
 * uniform/texture state attached to individual draw calls.
 *
 * This is better evidence than reading a bundle. A constant in minified source
 * is what the author wrote; a uniform read here is what the GPU received, after
 * every transform between the two. The r151 note at src/runtime/catalogue.ts:23
 * — legacy lights premultiply every light colour by π at uniform upload — is
 * exactly the class of discrepancy that only shows up on this side.
 *
 * The proxy is installed with Page.addScriptToEvaluateOnNewDocument so it is in
 * place before any page script runs. Wrapping after load would miss the shader
 * compilation and the first uniform upload, which is most of what matters.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-write tests/capture-glframe.mjs \
 *     --port=9226 --url=https://press.stripe.com/ --out=tmp/glframe-stripe.json
 *
 * Run it against our own /press/ with a different --out to get a side-by-side.
 * Read docs/real-gpu-harness.md first: this script refuses a software renderer,
 * because shader and material findings taken on SwiftShader describe SwiftShader.
 *
 * Program-level uniforms remain last-write-wins for backwards compatibility.
 * `drawSnapshots` is the discriminating evidence: while the driver samples a
 * named rest/hover/held state, every cover-program draw records its own material
 * scalar set and sampler-to-texture bindings. This is what separates per-volume
 * settings from per-interaction settings when one program draws every book.
 *
 * Add --readings-out=docs/reference/<file>.json to write a citation-safe copy
 * with shader source excluded. The raw --out file remains gitignored evidence.
 */

import { dirname } from "node:path";
import { connect } from "./cdp.mjs";

const options = Object.fromEntries(
  Deno.args
    .filter((argument) => argument.startsWith("--"))
    .map((argument) => {
      const [key, ...rest] = argument.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const port = options.port ?? "9226";
const url = options.url ?? "https://press.stripe.com/";
const outputPath = options.out ?? "tmp/glframe.json";
const readingsOutputPath = options["readings-out"] ?? null;
const settleMs = Number(options.settle ?? 6000);
const snapshotDraws = options["snapshot-draws"] !== "false";
const snapshotBookLimit = Number(options["snapshot-books"] ?? 24);
const snapshotLimit = Number(options["snapshot-limit"] ?? 48);
const snapshotInteractionIndices = String(options["snapshot-interactions"] ?? "0,4,10")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter(Number.isInteger);
const bookSelector = options["book-selector"] ?? ".PressHomepageBook, .press-volume";

/**
 * Runs inside the page before its own scripts. Kept dependency-free and
 * self-contained because it is injected as source text.
 *
 * Uniforms are attributed to the program that declared them, never to a flat
 * global map. A page runs several materials, and three.js names uniforms
 * identically across all of them — a single `spotLights[0].color` key would be
 * overwritten by whichever program drew last, silently blending two scenes'
 * light rigs into one plausible-looking table. `getUniformLocation` receives
 * the program, so attribution is exact rather than inferred from draw order.
 */
const INSTRUMENT = `(() => {
  const capture = {
    programs: [],
    textures: [],
    textureObjects: [],
    drawSnapshots: [],
    snapshotStates: [],
    counts: {},
    snapshotEnabled: false,
    snapshotState: null,
    snapshotRemaining: 0,
    beginSnapshots(state, limit = 48) {
      this.endSnapshots();
      const id = this.snapshotStates.length;
      this.snapshotState = { id, ...state };
      this.snapshotRemaining = Math.max(1, Number(limit) || 1);
      this.snapshotEnabled = true;
      this.snapshotStates.push({
        ...this.snapshotState,
        startedAt: performance.now(),
        firstSnapshot: this.drawSnapshots.length,
        snapshotCount: 0,
        endedAt: null
      });
    },
    endSnapshots() {
      if (this.snapshotState) {
        const record = this.snapshotStates[this.snapshotState.id];
        if (record && record.endedAt === null) {
          record.endedAt = performance.now();
          record.snapshotCount = this.drawSnapshots.length - record.firstSnapshot;
        }
      }
      this.snapshotEnabled = false;
      this.snapshotState = null;
      this.snapshotRemaining = 0;
    }
  };
  window.__glCapture = capture;

  const contexts = [window.WebGL2RenderingContext, window.WebGLRenderingContext]
    .filter(Boolean)
    .map((constructor) => constructor.prototype);

  const bump = (name) => { capture.counts[name] = (capture.counts[name] || 0) + 1; };

  // Shared across contexts so a program keeps one id even if the page uses both.
  const programIds = new WeakMap();
  const locations = new WeakMap();
  const textureIds = new WeakMap();
  const contextStates = new WeakMap();
  let nextProgramId = 0;
  let nextTextureId = 0;
  let globalDrawIndex = 0;

  const stateFor = (context) => {
    if (!contextStates.has(context)) {
      contextStates.set(context, {
        activeTextureUnit: 0,
        boundProgramId: null,
        textureBindings: new Map()
      });
    }
    return contextStates.get(context);
  };

  const textureRecordFor = (texture) => {
    if (!texture) return null;
    if (!textureIds.has(texture)) {
      const id = nextTextureId;
      nextTextureId += 1;
      textureIds.set(texture, id);
      capture.textureObjects.push({ id, width: null, height: null, src: null, uploads: 0 });
    }
    return capture.textureObjects[textureIds.get(texture)];
  };

  const recordFor = (program) => {
    if (!programIds.has(program)) {
      programIds.set(program, nextProgramId);
      capture.programs.push({ id: nextProgramId, shaders: [], uniforms: {}, draws: 0 });
      nextProgramId += 1;
    }
    return capture.programs[programIds.get(program)];
  };

  for (const prototype of contexts) {
    const originalLinkProgram = prototype.linkProgram;
    prototype.linkProgram = function (program) {
      const result = originalLinkProgram.call(this, program);
      const record = recordFor(program);
      for (const shader of this.getAttachedShaders(program) || []) {
        const source = this.getShaderSource(shader) || "";
        record.shaders.push({
          type: this.getShaderParameter(shader, this.SHADER_TYPE) === this.VERTEX_SHADER
            ? "vertex"
            : "fragment",
          length: source.length,
          source
        });
      }
      bump("linkProgram");
      return result;
    };

    const originalGetUniformLocation = prototype.getUniformLocation;
    prototype.getUniformLocation = function (program, name) {
      const location = originalGetUniformLocation.call(this, program, name);
      // A WebGLUniformLocation carries neither its name nor its program, so
      // both are captured here or not at all.
      if (location) locations.set(location, { name, record: recordFor(program) });
      return location;
    };

    const uniformSetters = Object.getOwnPropertyNames(prototype)
      .filter((key) => /^uniform(Matrix)?[1-4](f|i|ui)(v)?$/.test(key));
    for (const setter of uniformSetters) {
      const original = prototype[setter];
      prototype[setter] = function (location, ...rest) {
        const known = locations.get(location);
        if (known) {
          const value = rest.length === 1 && rest[0] && rest[0].length !== undefined
            ? Array.from(rest[0])
            : rest.filter((item) => typeof item !== "boolean");
          known.record.uniforms[known.name] = { setter, value };
        }
        bump(setter);
        return original.apply(this, [location, ...rest]);
      };
    }

    // Draw counts separate a material that actually renders from one that was
    // merely compiled, which is the difference between the shelf and a scene
    // the page prepared but never showed.
    //
    // The bound program is tracked through useProgram rather than read back
    // with getParameter(CURRENT_PROGRAM): that query forces a synchronous
    // round-trip to the GPU, and once per draw call it stalls the renderer
    // hard enough to hang the page.
    const originalUseProgram = prototype.useProgram;
    prototype.useProgram = function (program) {
      stateFor(this).boundProgramId = program && programIds.has(program) ? programIds.get(program) : null;
      return originalUseProgram.call(this, program);
    };

    const originalActiveTexture = prototype.activeTexture;
    prototype.activeTexture = function (texture) {
      stateFor(this).activeTextureUnit = texture - this.TEXTURE0;
      return originalActiveTexture.call(this, texture);
    };

    const originalBindTexture = prototype.bindTexture;
    prototype.bindTexture = function (target, texture) {
      const state = stateFor(this);
      const record = textureRecordFor(texture);
      state.textureBindings.set(state.activeTextureUnit + ":" + target, record ? record.id : null);
      return originalBindTexture.call(this, target, texture);
    };

    const snapshotUniform = /^(?:thickness|specular|shininess|reflectiveness|diffuseBaseColor|bumpScale(?:Base|Custom)|foil(?:Detail|Opacity|Specular|Emissive)|gloss(?:Opacity|Specular|Emissive)|glitter(?:Opacity|Specular|Emissive)|press(?:Foil|Reflectiveness|UnitScale|SheenMap)|ambientLightColor|(?:directional|spot)Lights\\[|(?:diffuse|bump|foil|gloss|glitter)Map)/;

    const snapshotDraw = (context, record, drawCall) => {
      if (!capture.snapshotEnabled || capture.snapshotRemaining <= 0) return;
      // The cover program is uniquely identified at runtime by carrying both
      // the foil sampler and the scene spotlight. Other programs use many of
      // the same uniform names and would make a plausible but false table.
      if (!(record.uniforms.foilMap || record.uniforms.pressFoilMap)
        || !record.uniforms["spotLights[0].color"]) return;

      const uniforms = {};
      const textureBindings = {};
      const state = stateFor(context);
      for (const [name, value] of Object.entries(record.uniforms)) {
        if (!snapshotUniform.test(name)) continue;
        uniforms[name] = { setter: value.setter, value: [...value.value] };
        if (!/map/i.test(name) || value.setter !== "uniform1i") continue;
        const unit = Number(value.value[0]);
        textureBindings[name] = {
          unit,
          textureId: state.textureBindings.get(unit + ":" + context.TEXTURE_2D) ?? null
        };
      }

      capture.drawSnapshots.push({
        globalDrawIndex,
        drawIndex: record.draws - 1,
        programId: record.id,
        drawCall,
        state: { ...capture.snapshotState },
        page: {
          path: location.pathname,
          scrollY: window.scrollY,
          bodyClass: document.body ? document.body.className : "",
          htmlClass: document.documentElement.className
        },
        uniforms,
        textureBindings
      });
      capture.snapshotRemaining -= 1;
      if (capture.snapshotRemaining <= 0) capture.endSnapshots();
    };

    for (const drawCall of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const original = prototype[drawCall];
      if (!original) continue;
      prototype[drawCall] = function (...args) {
        const boundProgramId = stateFor(this).boundProgramId;
        if (boundProgramId !== null) {
          const record = capture.programs[boundProgramId];
          record.draws += 1;
          snapshotDraw(this, record, drawCall);
        }
        globalDrawIndex += 1;
        return original.apply(this, args);
      };
    }

    // texImage2D alone misses the artwork. On a WebGL2 context three.js
    // allocates with texStorage2D and then fills with texSubImage2D, so a
    // capture hooking only texImage2D sees three.js's own 1x1 placeholders and
    // concludes no cover ever loaded.
    // Width must be read at a per-signature index, never by scanning for the
    // first number. These calls take internalformat before width, and both are
    // numbers, so a scan silently records GL_RGBA8 (32856) as a dimension —
    // which makes every upload look enormous and real.
    const widthIndex = {
      texImage2D: { 9: 3 },          // target, level, internalformat, width, ...
      texStorage2D: { 5: 3 },        // target, levels, internalformat, width, height
      compressedTexImage2D: { 7: 3 },
      texSubImage2D: { 9: 4 }        // target, level, xoffset, yoffset, width, ...
    };

    for (const uploadCall of ["texImage2D", "texSubImage2D", "texStorage2D", "compressedTexImage2D"]) {
      const original = prototype[uploadCall];
      if (!original) continue;
      prototype[uploadCall] = function (...args) {
        const state = stateFor(this);
        const source = args[args.length - 1];
        // The short forms pass an image-like source that carries its own size.
        const dimensioned = source && typeof source === "object" && typeof source.width === "number";
        const index = (widthIndex[uploadCall] || {})[args.length];
        const width = dimensioned ? source.width : (index === undefined ? null : args[index] ?? null);
        const height = dimensioned ? source.height : (index === undefined ? null : args[index + 1] ?? null);
        const sourceUrl = source && typeof (source.currentSrc || source.src) === "string"
          ? (source.currentSrc || source.src).slice(-220)
          : null;
        const target = args[0];
        const textureId = state.textureBindings.get(state.activeTextureUnit + ":" + target) ?? null;
        const upload = {
          call: uploadCall,
          textureId,
          unit: state.activeTextureUnit,
          target,
          width,
          height,
          kind: source && source.constructor ? source.constructor.name : typeof source,
          src: sourceUrl
        };
        capture.textures.push(upload);
        if (textureId !== null) {
          const record = capture.textureObjects[textureId];
          record.width = width ?? record.width;
          record.height = height ?? record.height;
          record.src = sourceUrl ?? record.src;
          record.uploads += 1;
        }
        bump(uploadCall);
        return original.apply(this, args);
      };
    }
  }
})()`;

const cdp = await connect(port);

try {
  const renderer = await cdp.requireHardwareGpu();
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
  await cdp.navigate(url);
  await cdp.waitFor("typeof window.__glCapture === 'object'", 20000);
  await cdp.waitFor("window.__glCapture.programs.length > 0", 30000);

  /**
   * Three.js uploads a 1x1 placeholder for every texture slot at material
   * construction, so a capture taken on a timer can show a full uniform table
   * while no artwork has loaded at all — the light rig on record would then
   * belong to whichever material was ready first, not to the one on screen.
   * Scroll until a real upload lands, and record whether it ever did.
   */
  const realTextureUploaded = "window.__glCapture.textures.some((texture) => texture.width > 4)";
  let sawRealTexture = await cdp.waitFor(realTextureUploaded, settleMs);
  for (let step = 0; step < 12 && !sawRealTexture; step += 1) {
    await cdp.evaluate("window.scrollBy(0, 700)").catch(() => {});
    await cdp.sleep(900);
    sawRealTexture = await cdp.evaluate(realTextureUploaded);
  }

  const bookMetadata = (index, { position = false } = {}) => cdp.evaluate(`(() => {
    const books = [...document.querySelectorAll(${JSON.stringify(bookSelector)})];
    const book = books[${index}];
    if (!book) return null;
    if (${position}) {
      const before = book.getBoundingClientRect();
      const top = window.scrollY + before.top - (window.innerHeight - before.height) / 2;
      window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    }
    const rect = book.getBoundingClientRect();
    const link = book.matches("a[href]") ? book : book.querySelector("a[href]");
    const title = book.querySelector(".PressHomepageBook__title")?.textContent
      || book.getAttribute("aria-label")
      || book.textContent
      || "book-${index + 1}";
    const href = link?.href || book.getAttribute("href") || "";
    return {
      bookIndex: ${index},
      title: title.trim().replace(/\\s+/g, " "),
      slug: href ? new URL(href, location.href).pathname : null,
      backgroundColor: getComputedStyle(book).getPropertyValue("--backgroundColor").trim() || null,
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    };
  })()`);

  const movePointerOut = async () => {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: -8,
      y: -8,
      button: "none",
      buttons: 0
    }).catch(async () => {
      await cdp.evaluate(`window.dispatchEvent(new MouseEvent("mouseout", {
        clientX: -8,
        clientY: -8,
        relatedTarget: null
      }))`);
    });
  };

  const captureWindow = async (state, wake) => {
    await cdp.evaluate(
      `window.__glCapture.beginSnapshots(${JSON.stringify(state)}, ${snapshotLimit})`
    );
    await wake();
    const filled = await cdp.waitFor("window.__glCapture.snapshotEnabled === false", 2500);
    if (!filled) await cdp.evaluate("window.__glCapture.endSnapshots()");
  };

  const books = await cdp.evaluate(
    `document.querySelectorAll(${JSON.stringify(bookSelector)}).length`
  );
  const capturedBookCount = Math.min(books, Math.max(0, snapshotBookLimit));

  if (snapshotDraws && capturedBookCount > 0) {
    await movePointerOut();

    // One rest sample per book forces lazy textures through the same program
    // while the state label still identifies the row that was centred. The
    // short waits are settling windows only; no animation duration is inferred
    // from them.
    for (let index = 0; index < capturedBookCount; index += 1) {
      await bookMetadata(index, { position: true });
      await cdp.sleep(650);
      const metadata = await bookMetadata(index);
      if (!metadata) continue;
      await captureWindow({ interaction: "rest", ...metadata }, async () => {
        await cdp.evaluate("window.dispatchEvent(new Event('scroll'))");
      });
    }

    const interactionIndices = [...new Set(snapshotInteractionIndices)]
      .filter((index) => index >= 0 && index < capturedBookCount);

    for (const index of interactionIndices) {
      await movePointerOut();
      await bookMetadata(index, { position: true });
      await cdp.sleep(650);
      const metadata = await bookMetadata(index);
      if (!metadata) continue;
      const { x, y } = metadata.center;

      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved", x, y, button: "none", buttons: 0
      });
      await cdp.sleep(500);
      await captureWindow({ interaction: "hover", ...metadata }, async () => {
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved", x: x + 1, y, button: "none", buttons: 0
        });
      });

      await cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1
      });
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved", x: x + 12, y: y - 6, button: "left", buttons: 1
      });
      await cdp.sleep(300);
      await captureWindow({ interaction: "held-drag", ...metadata }, async () => {
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved", x: x + 13, y: y - 6, button: "left", buttons: 1
        });
      });
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased", x: x + 13, y: y - 6, button: "left", buttons: 0, clickCount: 1
      });
      await movePointerOut();
      await cdp.sleep(900);
    }
  }

  // Let the last interaction finish before recording the backwards-compatible
  // program-level values. Draw snapshots above already carry their exact state.
  await cdp.sleep(1400);

  const parsed = JSON.parse(await cdp.evaluate("JSON.stringify(window.__glCapture)"));
  const shaderCount = parsed.programs.reduce((total, program) => total + program.shaders.length, 0);
  if (!shaderCount) {
    throw new Error("No shader sources captured — the proxy did not run before page scripts");
  }

  // A program that never drew cannot be the material on screen, whatever its
  // uniform names suggest. Sorting by draws puts the rendering material first.
  const programs = parsed.programs
    .map((program) => ({
      ...program,
      uniformCount: Object.keys(program.uniforms).length,
      shaders: program.shaders.map((shader) => ({ ...shader }))
    }))
    .sort((first, second) => second.draws - first.draws);

  const textureById = new Map(parsed.textureObjects.map((texture) => [texture.id, texture]));
  const drawSnapshots = parsed.drawSnapshots.map((snapshot) => ({
    ...snapshot,
    textureBindings: Object.fromEntries(
      Object.entries(snapshot.textureBindings).map(([name, binding]) => {
        const texture = textureById.get(binding.textureId);
        return [name, {
          ...binding,
          texture: texture
            ? { width: texture.width, height: texture.height, src: texture.src }
            : null
        }];
      })
    )
  }));

  const report = {
    capturedAt: new Date().toISOString(),
    url,
    renderer,
    counts: parsed.counts,
    sawRealTexture,
    snapshotConfig: {
      enabled: snapshotDraws,
      bookSelector,
      discoveredBooks: books,
      capturedBooks: capturedBookCount,
      interactionIndices: snapshotInteractionIndices,
      perStateLimit: snapshotLimit
    },
    textures: parsed.textures,
    textureObjects: parsed.textureObjects,
    snapshotStates: parsed.snapshotStates,
    drawSnapshots,
    programs
  };

  await Deno.mkdir(dirname(outputPath), { recursive: true });
  await Deno.writeTextFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  if (readingsOutputPath) {
    const compactDrawSnapshots = [];
    const compactIndex = new Map();
    for (const snapshot of report.drawSnapshots) {
      // The raw file retains every draw. The durable reading keeps the first
      // exact draw for each state + material + texture signature, plus the
      // repetition count and last draw index. Light vectors are deliberately
      // excluded from the signature because they can ease while the material
      // profile stays fixed; the retained first draw still records them.
      const materialUniforms = Object.fromEntries(
        Object.entries(snapshot.uniforms)
          .filter(([name]) => !/^(?:ambientLightColor|directionalLights|spotLights)/.test(name))
      );
      const textureIds = Object.fromEntries(
        Object.entries(snapshot.textureBindings)
          .map(([name, binding]) => [name, binding.textureId])
      );
      const signature = JSON.stringify([
        snapshot.state.id,
        snapshot.programId,
        materialUniforms,
        textureIds
      ]);
      const existing = compactIndex.get(signature);
      if (existing !== undefined) {
        compactDrawSnapshots[existing].sampleCount += 1;
        compactDrawSnapshots[existing].lastGlobalDrawIndex = snapshot.globalDrawIndex;
        compactDrawSnapshots[existing].lastDrawIndex = snapshot.drawIndex;
        continue;
      }
      compactIndex.set(signature, compactDrawSnapshots.length);
      compactDrawSnapshots.push({
        ...snapshot,
        sampleCount: 1,
        lastGlobalDrawIndex: snapshot.globalDrawIndex,
        lastDrawIndex: snapshot.drawIndex
      });
    }

    const readings = {
      ...report,
      rawDrawSnapshotCount: report.drawSnapshots.length,
      drawSnapshotCompaction: "first exact draw per state/material/texture signature",
      drawSnapshots: compactDrawSnapshots,
      programs: programs.map((program) => ({
        ...program,
        shaders: program.shaders.map(({ type, length }) => ({ type, length }))
      }))
    };
    await Deno.mkdir(dirname(readingsOutputPath), { recursive: true });
    await Deno.writeTextFile(readingsOutputPath, `${JSON.stringify(readings, null, 2)}\n`);
  }

  // Summarised per program and ordered by draw count, so the material actually
  // on screen is the first row rather than something inferred from names.
  console.log(JSON.stringify({
    outputPath,
    readingsOutputPath,
    renderer: renderer.renderer,
    sawRealTexture,
    realTextureUploads: report.textures.filter((texture) => texture.width > 4).length,
    placeholderUploads: report.textures.filter((texture) => texture.width <= 4).length,
    snapshotStates: report.snapshotStates.length,
    drawSnapshots: report.drawSnapshots.length,
    customDiffuseTextures: new Set(report.drawSnapshots
      .map((snapshot) => snapshot.textureBindings.diffuseMapCustom?.texture?.src)
      .filter(Boolean)).size,
    programs: programs.map((program) => ({
      id: program.id,
      draws: program.draws,
      uniforms: program.uniformCount,
      shaderLengths: program.shaders.map((shader) => shader.length)
    })),
    counts: report.counts
  }, null, 2));
} finally {
  await cdp.close();
}
