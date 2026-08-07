import { mkdir } from "node:fs/promises";

import { connect } from "./cdp.mjs";

const [
  port = "9226",
  url = "http://127.0.0.1:4173/press/?press-renderer=clean-room",
  screenshotDirectory = "/tmp/zi3t-clean-room-routing"
] = Deno.args;

const cdp = await connect(port, { width: 1568, height: 894 });
const checks = [];
const check = (name, passed, details = undefined) => {
  checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
};
const state = () => cdp.evaluate("window.__pressCleanRoomDebug?.()");

try {
  await mkdir(screenshotDirectory, { recursive: true });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__pressDebugEnabled = true;
      window.__cleanRoomRouteTrail = [];
      const stamp = () => window.__cleanRoomRouteTrail.push(
        location.pathname + location.search
      );
      const replace = history.replaceState.bind(history);
      const push = history.pushState.bind(history);
      history.replaceState = (...args) => { const value = replace(...args); stamp(); return value; };
      history.pushState = (...args) => { const value = push(...args); stamp(); return value; };
    `
  });
  await cdp.navigate(url);
  const ready = await cdp.waitFor(`(
    document.documentElement.dataset.pressRenderer === "clean-room"
    && document.documentElement.classList.contains("press-entry-complete")
    && window.__pressCleanRoomDebug?.().state.mode === "catalogue"
  )`, 15_000);
  check("the clean-room catalogue settles before routing is enabled", ready);

  const gpu = await cdp.requireHardwareGpu();
  check("the routing gate is running on hardware WebGL", !gpu.software, gpu);

  await cdp.evaluate("window.scrollTo({ top: 180, behavior: 'instant' })");
  await cdp.sleep(120);
  const catalogueAddress = await cdp.evaluate("location.pathname + location.search");
  check(
    "catalogue scrolling cannot claim a volume address",
    catalogueAddress === "/press/?press-renderer=clean-room",
    catalogueAddress
  );

  const pickStart = await state();
  await cdp.evaluate("document.querySelector('.press-volume').click()");
  await cdp.sleep(90);
  const flightState = await state();
  const flightDom = await cdp.evaluate(`(() => ({
    address: location.pathname + location.search,
    volumes: getComputedStyle(document.querySelector('.press-volumes')).display,
    sectionTop: Math.round(document.querySelector('.press-volume-section').getBoundingClientRect().top),
    mainHeight: Math.round(document.querySelector('.home-page main').getBoundingClientRect().height),
    volumesHeight: Math.round(document.querySelector('.press-volumes').getBoundingClientRect().height),
    inert: Array.from(document.querySelectorAll('.press-volume-item')).every((item) => item.inert),
    back: getComputedStyle(document.querySelector('.press-back')).display
  }))()`);
  check(
    "a deliberate pick pushes the marked volumes document",
    flightDom.address === "/press/refly/?press-renderer=clean-room"
      && flightDom.volumes === "block"
      && Math.abs(flightDom.sectionTop) <= 1
      && Math.abs(flightDom.mainHeight - flightDom.volumesHeight) <= 2
      && flightDom.inert
      && flightDom.back === "block",
    flightDom
  );
  check(
    "the picked book flies from its shelf pose instead of cutting",
    flightState?.state?.mode === "volumes"
      && flightState.state.flightIndex === 0
      && Math.abs(flightState.books[0].rotation[1]) > 0.01
      && Math.abs(flightState.books[0].rotation[1]) < 0.35
      && Math.abs(flightState.books[0].position[0] - pickStart.books[0].position[0]) > 0.2,
    { before: pickStart?.books?.[0], during: flightState?.books?.[0] }
  );
  await cdp.screenshot(`${screenshotDirectory}/route-flight.png`);

  const landed = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    const book = debug?.books?.[0];
    const figure = document.querySelector('.press-volume-figure').getBoundingClientRect();
    const expectedYaw = .35 + (
      innerHeight / 2 - (figure.top + figure.height / 2)
    ) * .0008;
    return debug?.state.flightIndex === -1
      && debug.state.currentIndex === 0
      && book.sectionWeight === 1
      && book.sectionVisible === true
      && book.opacity > .999
      && Math.abs(book.position[0] - book.sectionPosition[0]) < .02
      && Math.abs(book.scale - book.sectionScale) < .02
      && Math.abs(book.rotation[1] - expectedYaw) < .015;
  })()`, 5_000);
  const landedState = await state();
  const landedLayout = await cdp.evaluate(`(() => {
    const figure = document.querySelector('.press-volume-figure').getBoundingClientRect();
    const detail = document.querySelector('.press-volume-detail').getBoundingClientRect();
    return {
      figure: { left: figure.left, top: figure.top, width: figure.width, height: figure.height },
      detail: { left: detail.left, top: detail.top, width: detail.width, height: detail.height }
    };
  })()`);
  const landedBounds = landedState?.books?.[0]?.screenBounds;
  check(
    "the picked book lands in the matched live figure column",
    landed
      && Math.abs(landedBounds?.left - 296) <= 10
      && Math.abs(landedBounds?.top - 167) <= 10
      && Math.abs(landedBounds?.width - 447) <= 10
      && Math.abs(landedBounds?.height - 554) <= 10
      && Math.abs(landedLayout.detail.left - 886) <= 12,
    {
      book: landedState?.books?.[0],
      layout: landedLayout,
      referenceBounds: { left: 295, top: 167, width: 447, height: 554 },
      referenceDetailLeft: 886
    }
  );
  await cdp.screenshot(`${screenshotDirectory}/route-landed-refly.png`);

  const sectionGeometry = await cdp.evaluate(`Array.from(
    document.querySelectorAll('.press-volume-section')
  ).map((section) => {
    const figure = section.querySelector('.press-volume-figure').getBoundingClientRect();
    return {
      address: section.dataset.pressVolume,
      top: Math.round(section.getBoundingClientRect().top + scrollY),
      figure: { width: Math.round(figure.width), height: Math.round(figure.height) }
    };
  })`);
  check(
    "the volumes document assembles five measurable figure sections",
    sectionGeometry.length === 5
      && sectionGeometry.every((section) => section.figure.width > 300 && section.figure.height > 400)
      && sectionGeometry.every((section, index) => index === 0 || section.top > sectionGeometry[index - 1].top),
    sectionGeometry
  );

  const historyBeforeScroll = await cdp.evaluate("history.length");
  await cdp.evaluate(`(() => {
    const section = document.querySelectorAll('.press-volume-section')[2];
    window.scrollTo({ top: section.getBoundingClientRect().top + scrollY, behavior: 'instant' });
  })()`);
  const scrolled = await cdp.waitFor(`(
    location.pathname + location.search === "/press/telemetry/?press-renderer=clean-room"
    && window.__pressCleanRoomDebug?.().state.currentIndex === 2
    && window.__pressCleanRoomDebug?.().books[2].sectionVisible === true
  )`, 5_000);
  const historyAfterScroll = await cdp.evaluate("history.length");
  const scrollState = await state();
  check(
    "centred section scroll replaces the marked address without pushing history",
    scrolled && historyAfterScroll === historyBeforeScroll,
    {
      address: await cdp.evaluate("location.pathname + location.search"),
      historyBeforeScroll,
      historyAfterScroll,
      state: scrollState?.state
    }
  );
  check(
    "scroll swaps the canvas to the section's own volume",
    scrollState?.books?.[2]?.opacity > 0.999
      && scrollState.books[0].opacity < 0.001
      && Math.abs(scrollState.books[2].position[0] - scrollState.books[2].sectionPosition[0]) < 0.02,
    scrollState?.books?.map((book) => ({ slug: book.slug, opacity: book.opacity }))
  );
  await cdp.screenshot(`${screenshotDirectory}/route-scroll-telemetry.png`);

  const historyBeforeRail = await cdp.evaluate("history.length");
  await cdp.evaluate("document.querySelectorAll('.press-rail-item')[3].click()");
  const railArrived = await cdp.waitFor(`(
    location.pathname + location.search === "/press/practice/?press-renderer=clean-room"
    && window.__pressCleanRoomDebug?.().state.currentIndex === 3
    && window.__pressCleanRoomDebug?.().state.flightIndex === -1
  )`, 5_000);
  const historyAfterRail = await cdp.evaluate("history.length");
  check(
    "the rail deliberately pushes another marked volume",
    railArrived && historyAfterRail === historyBeforeRail + 1,
    { historyBeforeRail, historyAfterRail }
  );

  await cdp.evaluate("history.back()");
  const backVolume = await cdp.waitFor(`(
    location.pathname + location.search === "/press/telemetry/?press-renderer=clean-room"
    && window.__pressCleanRoomDebug?.().state.mode === "volumes"
    && window.__pressCleanRoomDebug?.().state.currentIndex === 2
  )`, 5_000);
  check("browser Back restores the previous volume within the same shell", backVolume);

  await cdp.evaluate("history.back()");
  const backHome = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    return location.pathname + location.search === "/press/?press-renderer=clean-room"
      && debug?.state.mode === "catalogue"
      && Math.abs(scrollY - 180) <= 1
      && debug.books.every((book, index) => (
        Math.abs((book.position[1] - book.homePosition[1]) - .2422) < .04
        && (
          index === debug.state.hoverIndex
          || Math.abs(book.position[2] - book.homePosition[2]) < .04
        )
        && Math.abs(book.scale - book.homeScale) < .04
      ));
  })()`, 5_000);
  const homeState = await state();
  check(
    "browser Back restores the catalogue offset and shelf pose",
    backHome
      && homeState?.books?.every((book) => (
        Math.abs((book.position[1] - book.homePosition[1]) - .2422) < .04
      )),
    {
      address: await cdp.evaluate("location.pathname + location.search"),
      scrollY: await cdp.evaluate("scrollY"),
      state: homeState?.state,
      books: homeState?.books?.map((book) => ({
        slug: book.slug,
        position: book.position,
        homePosition: book.homePosition,
        scale: book.scale,
        homeScale: book.homeScale,
        rotation: book.rotation,
        opacity: book.opacity
      }))
    }
  );
  await cdp.screenshot(`${screenshotDirectory}/route-back-home.png`);

  const deepUrl = new URL("/press/field-notes/?press-renderer=clean-room", url).href;
  await cdp.navigate(deepUrl);
  const deepReady = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    const section = document.querySelectorAll('.press-volume-section')[4];
    return debug?.state.mode === "volumes"
      && debug.state.currentIndex === 4
      && debug.state.pendingDeepLinkIndex === -1
      && location.pathname + location.search === "/press/field-notes/?press-renderer=clean-room"
      && Math.abs(section.getBoundingClientRect().top) <= 1
      && debug.books[4].sectionVisible === true;
  })()`, 15_000);
  const deepTrail = await cdp.evaluate("window.__cleanRoomRouteTrail");
  check(
    "a marked deep link settles directly on its own volume without address flicker",
    deepReady && deepTrail.every((address) => (
      address === "/press/field-notes/?press-renderer=clean-room"
    )),
    { deepTrail, state: await state() }
  );
  await cdp.screenshot(`${screenshotDirectory}/route-deep-field-notes.png`);

  await cdp.evaluate("document.querySelector('.press-back').click()");
  const controlBack = await cdp.waitFor(`(
    location.pathname + location.search === "/press/?press-renderer=clean-room"
    && window.__pressCleanRoomDebug?.().state.mode === "catalogue"
  )`, 5_000);
  check("the dedicated back control returns the active volume to its shelf slot", controlBack);

  check("the routing runtime reports no browser errors", cdp.errors.length === 0, cdp.errors);

  const failed = checks.filter((entry) => !entry.passed);
  console.log(JSON.stringify({ gpu, checks }, null, 2));
  if (failed.length) throw new Error(`${failed.length} clean-room routing check(s) failed`);
} finally {
  await cdp.close();
}
