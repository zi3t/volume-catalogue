/**
 * Records the WebGL calls a scene actually makes: shader sources per program,
 * uniform values as uploaded, and texture uploads by dimension.
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
 * Read the output with one limit in mind. Uniforms are attributed per program,
 * but one program draws many objects, and the recorded value is whichever was
 * written last. Measured across runs on press.stripe.com, the light rig is
 * stable — ambient, directional and spot values repeat exactly — while the
 * cover scalars (foilOpacity, glossOpacity, reflectiveness, shininess, the bump
 * scales) differ run to run, because each book carries its own settings through
 * a shared program. Treat the light rig as a reading of the scene; treat a
 * material scalar as one book's value, not the material's.
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
const settleMs = Number(options.settle ?? 6000);

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
  const capture = { programs: [], textures: [], counts: {} };
  window.__glCapture = capture;

  const contexts = [window.WebGL2RenderingContext, window.WebGLRenderingContext]
    .filter(Boolean)
    .map((constructor) => constructor.prototype);

  const bump = (name) => { capture.counts[name] = (capture.counts[name] || 0) + 1; };

  // Shared across contexts so a program keeps one id even if the page uses both.
  const programIds = new WeakMap();
  const locations = new WeakMap();
  let nextProgramId = 0;
  let boundProgramId = null;

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
      boundProgramId = program && programIds.has(program) ? programIds.get(program) : null;
      return originalUseProgram.call(this, program);
    };

    for (const drawCall of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const original = prototype[drawCall];
      if (!original) continue;
      prototype[drawCall] = function (...args) {
        if (boundProgramId !== null) capture.programs[boundProgramId].draws += 1;
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
        const source = args[args.length - 1];
        // The short forms pass an image-like source that carries its own size.
        const dimensioned = source && typeof source === "object" && typeof source.width === "number";
        const index = (widthIndex[uploadCall] || {})[args.length];
        capture.textures.push({
          call: uploadCall,
          width: dimensioned ? source.width : (index === undefined ? null : args[index] ?? null),
          height: dimensioned ? source.height : (index === undefined ? null : args[index + 1] ?? null),
          kind: source && source.constructor ? source.constructor.name : typeof source,
          src: source && typeof source.src === "string" ? source.src.slice(-90) : null
        });
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

  // Let whatever is now on screen settle; a uniform read mid-transition reports
  // the transition rather than the resting value.
  await cdp.sleep(2500);

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

  const report = {
    capturedAt: new Date().toISOString(),
    url,
    renderer,
    counts: parsed.counts,
    sawRealTexture,
    textures: parsed.textures,
    programs
  };

  await Deno.mkdir(dirname(outputPath), { recursive: true });
  await Deno.writeTextFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  // Summarised per program and ordered by draw count, so the material actually
  // on screen is the first row rather than something inferred from names.
  console.log(JSON.stringify({
    outputPath,
    renderer: renderer.renderer,
    sawRealTexture,
    realTextureUploads: report.textures.filter((texture) => texture.width > 4).length,
    placeholderUploads: report.textures.filter((texture) => texture.width <= 4).length,
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
