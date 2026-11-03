/*
 * Load and construct the deployed input and launch controllers under the real GJS
 * runtime. These modules contain no GJS-specific APIs, so this is a smoke check of
 * module loading, dependency guards and disposal in the engine that runs them —
 * not a behavioural acceptance. Behavioural coverage lives in the Node suites and,
 * for capture, in capture-gjs-acceptance.mjs.
 *
 *   gjs -m tools/gnome-window-control/input-launch-gjs-smoke.mjs [extension-dir]
 */

import GLib from 'gi://GLib';
import System from 'system';

const dir = ARGV[0] ??
    `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local`;

const results = [];
const check = (name, ok, detail = '') => {
    results.push(ok);
    print(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
};

const {createInputController} = await import(`file://${dir}/input.mjs`);
const {createLaunchController} = await import(`file://${dir}/launch.mjs`);
check('both modules load under GJS', typeof createInputController === 'function' && typeof createLaunchController === 'function');

const state = {epoch: 'epoch-1', locked: false, blockedReason: null, windows: [], focusedWindowId: null};
const inputDependencies = {
    getDesktopState: () => state,
    seat: {create_virtual_device: () => ({})},
    resolveWindow: () => null,
    pointerPosition: () => ({x: 0, y: 0}),
    schedule: () => 1,
    cancelSchedule: () => {},
    resolveKeyval: () => 0,
    maxPixels: 8_388_608,
};

let input = null;
try {
    input = createInputController(inputDependencies);
    check('the input controller constructs', typeof input?.click === 'function' && typeof input?.releaseAll === 'function');
} catch (error) {
    check('the input controller constructs', false, error.message);
}

try {
    createInputController({...inputDependencies, maxPixels: 0});
    check('an invalid dependency set is refused', false);
} catch {
    check('an invalid dependency set is refused', true);
}

if (input) {
    try {
        const released = await input.releaseAll();
        check('releaseAll works with nothing held', released !== undefined, JSON.stringify(released ?? null).slice(0, 60));
    } catch (error) {
        check('releaseAll works with nothing held', false, error.message);
    }
    try {
        input.dispose();
        check('the input controller disposes', true);
    } catch (error) {
        check('the input controller disposes', false, error.message);
    }
}

const launch = createLaunchController({
    getDesktopState: () => state,
    appSystem: {lookup_app: () => null},
    listWindows: () => [],
});
check('the launch controller constructs', typeof launch?.launch === 'function' && typeof launch?.confirm === 'function');
let unknownRefused = false;
try {
    launch.launch(JSON.stringify({desktopId: 'org.gnome.Calculator.desktop'}));
} catch (error) {
    unknownRefused = String(error?.code ?? '').length > 0 || /FAILED|REFUSED|UNKNOWN/.test(String(error?.message ?? ''));
}
check('an unknown application is refused', unknownRefused);
launch.dispose();
check('the launch controller disposes', true);

print(`SUMMARY: checks=${results.length} failed=${results.filter(ok => !ok).length}`);
System.exit(results.every(Boolean) ? 0 : 1);
