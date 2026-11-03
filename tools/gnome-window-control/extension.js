import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {PreviewStore, executePlan, verifyPlan} from './policy.mjs';

/** Accept a Uint8Array (what capture.mjs passes) or a GLib.Bytes. */
function asBytes(value) {
    if (value instanceof Uint8Array)
        return value;
    return value?.get_data instanceof Function ? value.get_data() : value;
}

const BUS = 'org.gnome.Shell.Extensions.OpenCodeWindowControl';
const PATH = '/org/gnome/Shell/Extensions/OpenCodeWindowControl';
const XML = `<node><interface name="${BUS}">
  <method name="GetState"><arg type="s" direction="out"/></method>
  <method name="Preview"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="Apply"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="Begin"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="Chunk"><arg type="s" direction="in"/><arg type="u" direction="in"/><arg type="s" direction="out"/></method>
  <method name="End"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="Abort"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="InputBegin"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="InputClick"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="InputDrag"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="InputScroll"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="InputPressKey"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="InputTypeText"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="InputReleaseAll"><arg type="s" direction="out"/></method>
  <method name="Launch"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <method name="ConfirmLaunch"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
</interface></node>`;

const MAX_INPUT_PIXELS = 8_388_608;
const CONFIRM_TIMEOUT_MAX_MS = 5000;
const OBSERVATION_TTL_MS = 60_000;
const LAUNCH_TTL_MS = 30_000;
const MODIFIER_KEYVALS = Object.freeze({
    shift: 0xffe1, ctrl: 0xffe3, control: 0xffe3, alt: 0xffe9, super: 0xffeb, meta: 0xffeb,
});
const NAMED_KEYVALS = Object.freeze({
    return: 0xff0d, enter: 0xff0d, tab: 0xff09, escape: 0xff1b, esc: 0xff1b,
    space: 0x0020, backspace: 0xff08, delete: 0xffff,
    up: 0xff52, down: 0xff54, left: 0xff51, right: 0xff53,
    home: 0xff50, end: 0xff57, page_up: 0xff55, page_down: 0xff56,
});

const CAPTURE_ERROR_NAMES = new Set([
    'INVALID_REQUEST', 'REFUSED', 'BUSY', 'STALE', 'INVALID_HANDLE',
    'INVALID_CHUNK', 'EXPIRED', 'INTEGRITY', 'CAPTURE_FAILED',
]);

function rect(value) {
    return {x: value.x, y: value.y, width: value.width, height: value.height};
}

function canResizeAfterRestore(window) {
    if (window.allows_resize())
        return true;
    // Mutter refuses interactive resizing while maximized; placement restores first.
    if (!window.is_maximized() || !window.resizeable || window.is_fullscreen())
        return false;
    const [, minWidth, minHeight] = window.get_min_size();
    const [hasMaximum, maxWidth, maxHeight] = window.get_max_size();
    return !hasMaximum || minWidth < maxWidth || minHeight < maxHeight;
}

function request(text) {
    if (typeof text !== 'string' || text.length > 16384)
        throw new Error('Request must be JSON smaller than 16 KiB');
    return JSON.parse(text);
}

export default class WindowControl extends Extension {
    enable() {
        this._epoch = GLib.uuid_string_random();
        this._previews = new PreviewStore({nonce: () => GLib.uuid_string_random()});
        this._sources = new Map();
        this._observations = new Map();
        this._launches = new Map();
        this._inputPromise = undefined;
        this._launchPromise = undefined;
        this._enabled = true;
        this._export = Gio.DBusExportedObject.wrapJSObject(XML, this);
        this._export.export(Gio.DBus.session, PATH);
        this._owner = Gio.bus_own_name_on_connection(Gio.DBus.session, BUS,
            Gio.BusNameOwnerFlags.NONE, null, () => this._previews?.clear());
    }

    disable() {
        this._enabled = false;
        this._previews?.clear();
        this._capturePromise?.then(controller => controller.dispose?.()).catch(() => undefined);
        this._capturePromise = undefined;
        this._inputPromise?.then(controller => controller.dispose?.()).catch(() => undefined);
        this._inputPromise = undefined;
        this._launchPromise?.then(controller => controller.dispose?.()).catch(() => undefined);
        this._launchPromise = undefined;
        this._observations?.clear();
        this._launches?.clear();
        for (const [source, finish] of this._sources ?? []) {
            GLib.source_remove(source);
            finish({verified: false, error: 'Window bridge disabled during verification'});
        }
        this._sources?.clear();
        this._export?.unexport();
        if (this._owner)
            Gio.bus_unown_name(this._owner);
        this._owner = null;
        this._export = null;
    }

    _id(window) {
        return `${this._epoch}:${window.get_stable_sequence()}`;
    }

    _windows() {
        const workspace = global.workspace_manager.get_active_workspace();
        return global.get_window_actors().map(actor => actor.meta_window).filter(window =>
            window && window.get_window_type() === Meta.WindowType.NORMAL &&
            !window.get_transient_for() && window.located_on_workspace(workspace));
    }

    _snapshot() {
        const workspace = global.workspace_manager.get_active_workspace();
        const locked = Boolean(Main.sessionMode.isLocked || !Main.sessionMode.hasWindows);
        const focused = global.display.get_focus_window();
        const blockedReason = locked ? 'locked-or-no-window-session' :
            Main.modalCount > 0 ? 'shell-modal-active' :
                Main.overview.visible ? 'overview-active' :
                    focused && (focused.get_window_type() !== Meta.WindowType.NORMAL || focused.get_transient_for())
                        ? 'dialog-active' : null;
        const tracker = Shell.WindowTracker.get_default();
        const windows = locked ? [] : this._windows().map(window => {
            const appId = tracker.get_window_app(window)?.get_id() ?? '';
            const wmClass = window.get_wm_class() ?? '';
            const protectedWindow = ['polkit', 'gcr-prompter', 'gnome-keyring'].some(value =>
                `${appId} ${wmClass}`.toLowerCase().includes(value));
            return {
                id: this._id(window), appId: appId.slice(0, 256), pid: window.get_pid(),
                title: protectedWindow ? '[protected window]' : (window.get_title() ?? '').slice(0, 256),
                monitor: window.get_monitor(), rect: rect(window.get_frame_rect()),
                minimized: window.minimized, maximized: window.get_maximize_flags() !== 0,
                fullscreen: window.is_fullscreen(), canMove: window.allows_move(),
                canResize: canResizeAfterRestore(window), canMaximize: window.can_maximize(), protected: protectedWindow,
            };
        }).sort((first, second) => first.id.localeCompare(second.id));
        if (windows.length > 128 || Main.layoutManager.monitors.length > 16)
            throw new Error('Desktop inventory exceeds the safety bound');
        const focusedWindowId = !locked && focused ? this._id(focused) : null;
        return {
            version: 1, epoch: this._epoch, coordinateSpace: 'logical-desktop',
            workspace: workspace.index(), locked,
            blockedReason: blockedReason ?? (windows.some(window => window.protected && window.id === focusedWindowId)
                ? 'protected-window-active' : null),
            focusedWindowId,
            monitors: locked ? [] : Main.layoutManager.monitors.map((display, id) => ({
                id, rect: rect(display), workArea: rect(workspace.get_work_area_for_monitor(id)),
                scale: global.display.get_monitor_scale(id),
            })), windows,
        };
    }

    GetState() {
        return JSON.stringify(this._snapshot());
    }

    Preview(text) {
        if (!this._enabled)
            throw new Error('Window bridge is disabled');
        return JSON.stringify(this._previews.issue(request(text), this._snapshot()));
    }

    ApplyAsync([text, token], invocation) {
        let plan;
        try {
            if (!this._enabled || typeof token !== 'string' || token.length > 128)
                throw new Error('Invalid or unavailable window preview');
            plan = this._previews.consume(request(text), token, this._snapshot());
        } catch (error) {
            invocation.return_dbus_error(`${BUS}.Error.InvalidPreview`, error.message);
            return;
        }
        const windowFor = id => {
            if (!this._enabled)
                throw new Error('Window bridge was disabled');
            const state = this._snapshot();
            if (state.locked || state.blockedReason || state.workspace !== plan.workspace)
                throw new Error('Desktop context changed during the operation');
            const window = this._windows().find(candidate => this._id(candidate) === id);
            if (!window)
                throw new Error('Window closed or left the active workspace');
            return window;
        };
        executePlan(plan, {
            place: item => {
                const window = windowFor(item.windowId);
                window.unminimize();
                // GNOME 50 uses parameterless maximize/unmaximize, unlike older Mutter APIs.
                window.unmaximize();
                if (window.get_monitor() !== item.monitor)
                    window.move_to_monitor(item.monitor);
                window.move_resize_frame(true, item.rect.x, item.rect.y, item.rect.width, item.rect.height);
                if (item.maximize)
                    window.maximize();
            },
            focus: id => Main.activateWindow(windowFor(id), global.get_current_time(), plan.workspace),
            observe: () => this._snapshot(),
            verify: approved => new Promise(resolve => {
                const started = GLib.get_monotonic_time();
                const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                    let result;
                    try {
                        result = verifyPlan(approved, this._snapshot());
                    } catch (error) {
                        result = {verified: false, error: error.message};
                    }
                    if (result.verified || GLib.get_monotonic_time() - started >= 2000000) {
                        this._sources.delete(source);
                        resolve(result);
                        return GLib.SOURCE_REMOVE;
                    }
                    return GLib.SOURCE_CONTINUE;
                });
                this._sources.set(source, resolve);
            }),
        }).then(result => invocation.return_value(new GLib.Variant('(s)', [JSON.stringify(result)])),
            error => invocation.return_dbus_error(`${BUS}.Error.Failed`, error.message));
    }

    _loadCaptureModule() {
        return import('./capture.mjs');
    }

    _loadInputModule() {
        return import('./input.mjs');
    }

    _loadLaunchModule() {
        return import('./launch.mjs');
    }

    /** Lazily build the capture controller so a plain inventory session never pays for it. */
    _captureController() {
        if (this._capturePromise === undefined) {
            this._capturePromise = this._loadCaptureModule()
                .then(({createCaptureController}) => createCaptureController({
                    getDesktopState: () => this._snapshot(),
                    resolveWindowActor: windowId => this._resolveWindowActor(windowId),
                    screenshotApi: {
                        createMemoryOutputStream: () => Gio.MemoryOutputStream.new_resizable(),
                        compositeToStream: (texture, scale, stream) => this._compositeToStream(texture, scale, stream),
                        closeStream: stream => stream.close(null),
                        stealAsBytes: stream => stream.steal_as_bytes(),
                    },
                    // capture.mjs hands over a Uint8Array, not a GLib.Bytes. Calling
                    // get_data() on it threw "bytes.get_data is not a function" and broke
                    // every capture until a live attempt found it. Accept either shape.
                    digest: bytes => GLib.compute_checksum_for_data(
                        GLib.ChecksumType.SHA256, asBytes(bytes)),
                    encodeBase64: bytes => GLib.base64_encode(asBytes(bytes)),
                    makeHandle: () => GLib.uuid_string_random(),
                    schedule: (delay, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                        callback();
                        return GLib.SOURCE_REMOVE;
                    }),
                    cancelSchedule: id => GLib.source_remove(id),
                }));
        }
        return this._capturePromise;
    }

    _resolveWindowActor(windowId) {
        const workspace = global.workspace_manager.get_active_workspace();
        for (const window of this._windows()) {
            if (this._id(window) !== windowId)
                continue;
            return {
                id: windowId,
                window,
                actor: window.get_compositor_private(),
                onActiveWorkspace: window.located_on_workspace(workspace),
            };
        }
        return null;
    }

    /** GNOME Shell encodes the image asynchronously; adapt the callback to a promise. */
    _compositeToStream(texture, scale, stream) {
        return new Promise((resolve, reject) => {
            Shell.Screenshot.composite_to_stream(
                texture, 0, 0, -1, -1, scale, null, 0, 0, 1, stream,
                (_source, result) => {
                    try {
                        Shell.Screenshot.composite_to_stream_finish(result);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
        });
    }

    _captureFailure(invocation, error) {
        const code = CAPTURE_ERROR_NAMES.has(error?.captureCode) ? error.captureCode : 'CAPTURE_FAILED';
        invocation.return_dbus_error(`${BUS}.Error.${code}`, String(error?.message ?? 'capture failed'));
    }

    async BeginAsync([request], invocation) {
        try {
            const controller = await this._captureController();
            const reply = await controller.Begin(request, invocation.get_sender());
            invocation.return_value(new GLib.Variant('(s)', [JSON.stringify(reply)]));
        } catch (error) {
            this._captureFailure(invocation, error);
        }
    }

    async ChunkAsync([handle, index], invocation) {
        try {
            const controller = await this._captureController();
            const reply = await controller.Chunk(handle, index, invocation.get_sender());
            invocation.return_value(new GLib.Variant('(s)', [reply]));
        } catch (error) {
            this._captureFailure(invocation, error);
        }
    }

    async EndAsync([handle], invocation) {
        try {
            const controller = await this._captureController();
            const sender = invocation.get_sender();
            const reply = await controller.End(handle, sender);
            const observationId = GLib.uuid_string_random();
            this._observations.set(observationId, {
                sender, createdAt: Date.now(), reply,
            });
            invocation.return_value(new GLib.Variant('(s)',
                [JSON.stringify({...reply, observationId})]));
        } catch (error) {
            this._captureFailure(invocation, error);
        }
    }

    /** Take the single-use observation that capture End minted for this sender. */
    _takeObservation(observationId, sender) {
        if (typeof observationId !== 'string' || observationId.length > 128)
            throw new Error('INVALID_HANDLE');
        const record = this._observations?.get(observationId);
        if (!record || record.sender !== sender)
            throw new Error('INVALID_HANDLE');
        this._observations.delete(observationId);
        if (!Number.isSafeInteger(record.createdAt) ||
            Date.now() - record.createdAt > OBSERVATION_TTL_MS)
            throw new Error('EXPIRED');
        return record.reply;
    }

    _inputController() {
        if (this._inputPromise === undefined) {
            this._inputPromise = this._loadInputModule().then(({createInputController}) =>
                createInputController({
                    now: () => Date.now(),
                    getDesktopState: () => this._snapshot(),
                    seat: this._inputSeat(),
                    resolveWindow: windowId => this._resolveWindowActor(windowId),
                    pointerPosition: () => this._pointerPosition(),
                    schedule: (delay, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                        callback();
                        return GLib.SOURCE_REMOVE;
                    }),
                    cancelSchedule: id => GLib.source_remove(id),
                    resolveKeyval: name => this._resolveKeyval(name),
                    maxPixels: MAX_INPUT_PIXELS,
                    // Clutter virtual-device events use monotonic microseconds.
                    eventTimestamp: () => GLib.get_monotonic_time(),
                }));
        }
        return this._inputPromise;
    }

    _launchController() {
        if (this._launchPromise === undefined) {
            this._launchPromise = this._loadLaunchModule().then(({createLaunchController}) =>
                createLaunchController({
                    now: () => Date.now(),
                    getDesktopState: () => this._snapshot(),
                    appSystem: this._appSystem(),
                    listWindows: () => this._windowRecords(),
                    // Activation uses uint32 event milliseconds, unlike virtual input's microseconds.
                    eventTimestamp: () => global.get_current_time(),
                }));
        }
        return this._launchPromise;
    }

    _inputSeat() {
        const seat = global.stage.context.get_backend().get_default_seat();
        return {
            create_virtual_device: type => seat.create_virtual_device(type),
            InputDeviceType: Clutter.InputDeviceType,
            KeyState: Clutter.KeyState,
            ButtonState: Clutter.ButtonState,
            ScrollDirection: Clutter.ScrollDirection,
            ScrollSource: Clutter.ScrollSource,
        };
    }

    _pointerPosition() {
        const [x, y] = global.get_pointer();
        return {x, y};
    }

    /** Map caller key names (and mod+key chords) onto Clutter keyvals. */
    _resolveKeyval(name) {
        if (typeof name !== 'string' || name.length === 0 || name.length > 32)
            return null;
        // Typed characters are literal: '+' is not a chord separator here, and
        // lowercasing would silently corrupt uppercase text.
        if (name.length === 1 && name.charCodeAt(0) >= 0x20 && name.charCodeAt(0) < 0x7f)
            return {keyval: name.charCodeAt(0), modifiers: []};
        const normalized = name.toLowerCase();
        if (Object.hasOwn(MODIFIER_KEYVALS, normalized))
            return {keyval: MODIFIER_KEYVALS[normalized], modifiers: []};
        const parts = normalized.split('+');
        const base = parts.pop();
        const modifiers = [];
        for (const modifier of parts) {
            if (!Object.hasOwn(MODIFIER_KEYVALS, modifier))
                return null;
            modifiers.push(MODIFIER_KEYVALS[modifier]);
        }
        if (Object.hasOwn(NAMED_KEYVALS, base))
            return {keyval: NAMED_KEYVALS[base], modifiers};
        if (base.length === 1 && base.charCodeAt(0) >= 0x20 && base.charCodeAt(0) < 0x7f)
            return {keyval: base.charCodeAt(0), modifiers};
        return null;
    }

    _windowRecords() {
        const tracker = Shell.WindowTracker.get_default();
        return this._windows().map(window => ({
            id: this._id(window),
            appId: tracker.get_window_app(window)?.get_id() ?? '',
        }));
    }

    _appSystem() {
        return {
            lookup_app: desktopId => {
                const app = Shell.AppSystem.get_default().lookup_app(desktopId);
                if (!app)
                    return null;
                return {
                    activate_full: (workspaceIndex, timestamp) => {
                        const workspace = global.workspace_manager.get_workspace_by_index(workspaceIndex);
                        app.activate_full(workspace ?? -1, timestamp);
                    },
                    open_new_window: timestamp => app.open_new_window(timestamp),
                };
            },
        };
    }

    _requestObject(text) {
        if (typeof text !== 'string' || text.length > 16_384)
            throw new Error('INVALID_REQUEST');
        const value = JSON.parse(text);
        if (value === null || typeof value !== 'object' || Array.isArray(value))
            throw new Error('INVALID_REQUEST');
        return value;
    }

    _actionCode(error) {
        const candidate = error?.captureCode ?? error?.inputCode ?? error?.launchCode
            ?? (error instanceof Error ? error.message : undefined);
        return typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{1,31}$/.test(candidate)
            ? candidate
            : 'FAILED';
    }

    _inputFailure(invocation, error) {
        invocation.return_dbus_error(`${BUS}.Error.${this._actionCode(error)}`,
            String(error?.message ?? 'input failed'));
    }

    async InputBeginAsync([observationJson], invocation) {
        try {
            const request = this._requestObject(observationJson);
            const sender = invocation.get_sender();
            const observation = this._takeObservation(request.observationId, sender);
            const controller = await this._inputController();
            const operationId = controller.begin(observation, sender);
            invocation.return_value(new GLib.Variant('(s)', [JSON.stringify({observationId: request.observationId, operationId})]));
        } catch (error) {
            this._inputFailure(invocation, error);
        }
    }

    async _inputAction(controller, invocation, operationId, payload, call) {
        const sender = invocation.get_sender();
        const request = this._requestObject(payload);
        const reply = await call(controller, operationId, sender, request);
        invocation.return_value(new GLib.Variant('(s)', [JSON.stringify(reply ?? {status: 'ok'})]));
    }

    async InputClickAsync([operationId, payload], invocation) {
        try {
            const controller = await this._inputController();
            await this._inputAction(controller, invocation, operationId, payload,
                (c, id, sender, request) => c.click(id, sender, request));
        } catch (error) {
            this._inputFailure(invocation, error);
        }
    }

    async InputDragAsync([operationId, payload], invocation) {
        try {
            const controller = await this._inputController();
            await this._inputAction(controller, invocation, operationId, payload,
                (c, id, sender, request) => c.drag(id, sender, request));
        } catch (error) {
            this._inputFailure(invocation, error);
        }
    }

    async InputScrollAsync([operationId, payload], invocation) {
        try {
            const controller = await this._inputController();
            await this._inputAction(controller, invocation, operationId, payload,
                (c, id, sender, request) => c.scroll(id, sender, request));
        } catch (error) {
            this._inputFailure(invocation, error);
        }
    }

    async InputPressKeyAsync([operationId, payload], invocation) {
        try {
            const controller = await this._inputController();
            await this._inputAction(controller, invocation, operationId, payload,
                (c, id, sender, request) => c.pressKey(id, sender, request));
        } catch (error) {
            this._inputFailure(invocation, error);
        }
    }

    async InputTypeTextAsync([operationId, payload], invocation) {
        try {
            const controller = await this._inputController();
            await this._inputAction(controller, invocation, operationId, payload,
                (c, id, sender, request) => c.typeText(id, sender, request));
        } catch (error) {
            this._inputFailure(invocation, error);
        }
    }

    async InputReleaseAllAsync([], invocation) {
        try {
            const controller = await this._inputController();
            controller.releaseAll(invocation.get_sender());
            invocation.return_value(new GLib.Variant('(s)', [JSON.stringify({released: true})]));
        } catch (error) {
            this._inputFailure(invocation, error);
        }
    }

    async LaunchAsync([desktopId], invocation) {
        try {
            const controller = await this._launchController();
            const sender = invocation.get_sender();
            const reply = controller.launch(desktopId, sender);
            // Confirmation is a capability: only the sender that launched, once,
            // may ask whether a window appeared, and it cannot supply its own
            // baseline.
            const launchToken = GLib.uuid_string_random();
            this._launches.set(launchToken, {
                sender, desktopId, beforeWindowIds: reply.beforeWindowIds, createdAt: Date.now(),
            });
            invocation.return_value(new GLib.Variant('(s)',
                [JSON.stringify({ ...reply, launchToken })]));
        } catch (error) {
            this._inputFailure(invocation, error);
        }
    }

    _takeLaunch(launchToken, sender) {
        if (typeof launchToken !== 'string' || launchToken.length > 128)
            throw new Error('INVALID_HANDLE');
        const record = this._launches?.get(launchToken);
        if (!record || record.sender !== sender)
            throw new Error('INVALID_HANDLE');
        this._launches.delete(launchToken);
        if (!Number.isSafeInteger(record.createdAt) || Date.now() - record.createdAt > LAUNCH_TTL_MS)
            throw new Error('EXPIRED');
        return record;
    }

    async ConfirmLaunchAsync([launchToken, optionsJson], invocation) {
        try {
            const sender = invocation.get_sender();
            const record = this._takeLaunch(launchToken, sender);
            const options = this._requestObject(optionsJson);
            const controller = await this._launchController();
            const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs >= 0
                ? Math.min(options.timeoutMs, CONFIRM_TIMEOUT_MAX_MS)
                : 0;
            const started = Date.now();
            let reply;
            // The launch token is single-use, so the wait has to happen here: a client
            // that polled would consume the capability on its first attempt.
            for (;;) {
                reply = controller.confirm(record.beforeWindowIds, {
                    desktopId: record.desktopId,
                    timeoutMs,
                });
                if (reply.appeared === true || Date.now() - started >= timeoutMs)
                    break;
                await new Promise(resolve => {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                        resolve();
                        return GLib.SOURCE_REMOVE;
                    });
                });
            }
            invocation.return_value(new GLib.Variant('(s)', [JSON.stringify(reply)]));
        } catch (error) {
            this._inputFailure(invocation, error);
        }
    }

    async AbortAsync([handle], invocation) {
        try {
            const controller = await this._captureController();
            const reply = await controller.Abort(handle, invocation.get_sender());
            invocation.return_value(new GLib.Variant('(s)', [JSON.stringify(reply ?? {released: true})]));
        } catch (error) {
            this._captureFailure(invocation, error);
        }
    }
}
