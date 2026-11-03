/*
 * Drive the deployed capture.mjs under the real GJS runtime, with fake Shell
 * dependencies. This proves the module loads and its crypto/base64/chunking path
 * works in the engine that will actually run it, which the Node tests cannot.
 *
 * What it does NOT prove: the Shell texture and screenshot stream plumbing. That
 * needs a reloaded extension.
 *
 *   gjs -m tools/gnome-window-control/capture-gjs-acceptance.mjs [extension-dir]
 *
 * The extension directory defaults to the deployed GNOME location.
 */

import GLib from 'gi://GLib';
import System from 'system';

const dir = ARGV[0] ??
    `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local`;
if (!GLib.file_test(`${dir}/capture.mjs`, GLib.FileTest.EXISTS)) {
    printerr(`no deployed capture.mjs in ${dir}`);
    System.exit(2);
}

const {createCaptureController} = await import(`file://${dir}/capture.mjs`);

const EPOCH = '11111111-2222-3333-4444-555555555555';
const WINDOW = `${EPOCH}:7`;

// A small but structurally valid PNG (signature + IHDR) padded to a plausible size.
const png = new Uint8Array(4096);
png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
png.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
const view = new DataView(png.buffer);
view.setUint32(16, 100);
view.setUint32(20, 50);
png[24] = 8;
png[25] = 6;

let streamClosed = false;
let composed = 0;
const texture = {get_width: () => 100, get_height: () => 50};
const actor = {
    id: 'actor-1',
    paint_to_content: () => ({get_texture: () => texture}),
    get_resource_scale: () => 1,
};
const window = {
    minimized: false,
    unmanaged: false,
    get_frame_rect: () => ({x: 0, y: 0, width: 100, height: 50}),
    get_buffer_rect: () => ({x: 0, y: 0, width: 100, height: 50}),
};

const controller = createCaptureController({
    getDesktopState: () => ({
        epoch: EPOCH,
        locked: false,
        blockedReason: null,
        windows: [{
            id: WINDOW,
            rect: {x: 0, y: 0, width: 100, height: 50},
            protected: false,
            minimized: false,
        }],
    }),
    resolveWindowActor: windowId => ({
        id: windowId,
        actor,
        window,
        onActiveWorkspace: true,
    }),
    screenshotApi: {
        createMemoryOutputStream: () => ({kind: 'stream'}),
        compositeToStream: (texture, scale, stream) => {
            composed += 1;
            stream.grabbed = Uint8Array.from(png);
        },
        closeStream: () => {
            streamClosed = true;
        },
        stealAsBytes: stream => stream.grabbed,
    },
    digest: bytes => GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, bytes),
    encodeBase64: bytes => GLib.base64_encode(bytes),
    makeHandle: () => GLib.uuid_string_random(),
    schedule: () => 1,
    cancelSchedule: () => {},
});

const results = [];
const check = (name, ok, detail = '') => {
    results.push(ok);
    print(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
};

let begin;
try {
    begin = await controller.Begin(JSON.stringify({windowId: WINDOW}), 'sender-1');
    check('Begin captures and returns a handle', typeof begin === 'object' && typeof begin.handle === 'string', JSON.stringify({
        chunkCount: begin.chunkCount,
        size: begin.size,
        dims: `${begin.width}x${begin.height}`,
        scale: begin.resourceScale,
    }));
} catch (error) {
    check('Begin captures and returns a handle', false, `${error.code ?? ''} ${error.message}`);
}

if (begin) {
    check('the stream was closed', streamClosed === true);
    check('the texture was composited once', composed === 1);
    check('the geometry matches the texture', begin.width === 100 && begin.height === 50 && begin.resourceScale === 1);
    let base64 = '';
    for (let index = 0; index < begin.chunkCount; index += 1) {
        base64 += controller.Chunk(begin.handle, index, 'sender-1');
    }
    const expected = GLib.base64_encode(png);
    check('the chunked payload is the captured image', base64 === expected, `${base64.length} vs ${expected.length} base64 chars`);
    check('a wrong chunk index is refused', (() => {
        try {
            controller.Chunk(begin.handle, 0, 'sender-1');
            return false;
        } catch {
            return true;
        }
    })());
    check('a foreign sender is refused', (() => {
        try {
            controller.Chunk(begin.handle, 0, 'sender-2');
            return false;
        } catch {
            return true;
        }
    })());
    const end = controller.End(begin.handle, 'sender-1');
    check('End releases the capture', end && end.size === png.length, JSON.stringify({size: end?.size}));
}

print(`SUMMARY: checks=${results.length} failed=${results.filter(ok => !ok).length}`);
System.exit(results.every(Boolean) ? 0 : 1);
