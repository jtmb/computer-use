#!/usr/bin/env node
/**
 * Fill a Gmail draft through Chrome DevTools Protocol.
 *
 * Default behaviour is draft-only: it fills the compose window, attaches files,
 * captures screenshots and exits. Sending requires both `--send` and the exact
 * `--approval "SEND <to> | <subject>"` string. It never types credentials.
 *
 * Inline images are inserted as DOM nodes (Gmail uses Trusted Types, so
 * `innerHTML` is blocked). Use stable HTTPS URLs; blob/data images are not
 * reliable after draft reload or send.
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opts = {
  port: 9222,
  to: '',
  subject: '',
  bodyFile: '',
  images: [],
  attachments: [],
  screenshotDir: '',
  status: false,
  discard: false,
  newDraft: false,
  send: false,
  approval: '',
};

/** Prints CLI help. */
function help() {
  console.log(`Usage: gmail-draft.mjs [options]

  --port N                 CDP port (default 9222)
  --to ADDRESS             recipient (one address)
  --subject TEXT           subject
  --body-file PATH         body text; '-' reads stdin; supports {{image URL}} lines
  --image-url URL          append an inline image (repeatable)
  --attach PATH            attach a file (repeatable)
  --screenshot-dir DIR     write draft screenshots
  --status                 print current compose state and exit
  --discard                discard the current draft and exit
  --new                    discard current draft and start a new compose
  --send                   send after filling (requires --approval)
  --approval TEXT          must equal "SEND <to> | <subject>"
  -h, --help               show this help

Draft-only is the default. Do not send without explicit user approval.
`);
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const value = () => {
    const v = args[++i];
    if (v === undefined) throw new Error(`Missing value for ${arg}`);
    return v;
  };
  switch (arg) {
    case '--port': opts.port = Number(value()); break;
    case '--to': opts.to = value(); break;
    case '--subject': opts.subject = value(); break;
    case '--body-file': opts.bodyFile = value(); break;
    case '--image-url': opts.images.push(value()); break;
    case '--attach': opts.attachments.push(path.resolve(value())); break;
    case '--screenshot-dir': opts.screenshotDir = path.resolve(value()); break;
    case '--status': opts.status = true; break;
    case '--discard': opts.discard = true; break;
    case '--new': opts.newDraft = true; break;
    case '--send': opts.send = true; break;
    case '--approval': opts.approval = value(); break;
    case '-h':
    case '--help': help(); process.exit(0); break;
    default: throw new Error(`Unknown option: ${arg}`);
  }
}

/** Resolves after ms. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Connects to the Gmail page target and returns CDP helpers. */
async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('mail.google.com'))
    ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('No page target on CDP port. Start Chrome with start-gmail-cdp.sh.');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, (message) => {
      if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
      else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('DOM.enable');
  return { ws, send, evaluate };
}

const composeSelector = '[role=dialog] input[aria-label="To recipients"]';

/** True when a compose dialog is open. */
async function composeOpen(cdp) {
  return Boolean(await cdp.evaluate(`!!document.querySelector(${JSON.stringify(composeSelector)})`));
}

/** Opens a new compose window and waits for its fields. */
async function openCompose(cdp) {
  if (await composeOpen(cdp)) return;
  const clicked = await cdp.evaluate(`(() => {
    const b = document.querySelector('.T-I-KE') ||
      [...document.querySelectorAll('button,[role=button]')].find((e) => (e.innerText || '').trim() === 'Compose');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!clicked) throw new Error('Compose button not found.');
  for (let i = 0; i < 20; i += 1) {
    await sleep(250);
    if (await composeOpen(cdp)) return;
  }
  throw new Error('Compose window did not open.');
}

/** Discards the current draft if one is open. */
async function discardDraft(cdp) {
  if (!(await composeOpen(cdp))) return;
  await cdp.evaluate(`(() => {
    const b = [...document.querySelectorAll('[role=dialog] [aria-label]')]
      .find((e) => (e.getAttribute('aria-label') || '').startsWith('Discard draft'));
    if (b) b.click();
    return true;
  })()`);
  for (let i = 0; i < 20; i += 1) {
    await sleep(250);
    if (!(await composeOpen(cdp))) return;
  }
  throw new Error('Draft did not close after discard.');
}

/** Reads a compact view of the current compose state. */
async function readStatus(cdp) {
  if (!(await composeOpen(cdp))) return { compose: false };
  return cdp.evaluate(`(() => {
    const d = document.querySelector('[role=dialog]');
    const toChips = [...d.querySelectorAll('[email]')].map((e) => e.getAttribute('email')).filter(Boolean);
    const subject = d.querySelector('input[name="subjectbox"]')?.value || '';
    const body = d.querySelector('[contenteditable="true"][aria-label="Message Body"]');
    const images = [...(body?.querySelectorAll('img') || [])].map((img) => ({
      src: img.src.slice(0, 120), width: img.naturalWidth, height: img.naturalHeight
    }));
    const attachments = [...d.querySelectorAll('[aria-label^="Attachment:"]')]
      .map((e) => e.getAttribute('aria-label').replace(/^Attachment: /, '').replace(/\\. Press.*$/, ''));
    return {
      compose: true,
      to: toChips,
      toField: d.querySelector('input[aria-label="To recipients"]')?.value || '',
      subject,
      bodyChars: body?.innerText.length || 0,
      bodyStart: (body?.innerText || '').slice(0, 120),
      images,
      attachments,
      sendVisible: Boolean(d.querySelector('[aria-label^="Send"]'))
    };
  })()`);
}

/** Places the caret at the end of the message body. */
async function focusBodyEnd(cdp) {
  await cdp.evaluate(`(() => {
    const e = document.querySelector('[contenteditable="true"][aria-label="Message Body"]');
    if (!e) return false;
    e.focus();
    const r = document.createRange();
    r.selectNodeContents(e);
    r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    return true;
  })()`);
}

/** Inserts plain text at the current body caret. */
async function insertText(cdp, text) {
  if (!text) return;
  await focusBodyEnd(cdp);
  await cdp.send('Input.insertText', { text });
  await sleep(150);
}

/** Inserts one inline image as a DOM node and waits for it to load. */
async function insertImage(cdp, url) {
  await cdp.evaluate(`(() => {
    const e = document.querySelector('[contenteditable="true"][aria-label="Message Body"]');
    e.focus();
    const r = document.createRange();
    r.selectNodeContents(e);
    r.collapse(false);
    const wrap = document.createElement('div');
    const img = document.createElement('img');
    img.src = ${JSON.stringify(url)};
    img.width = 488;
    img.alt = '';
    wrap.appendChild(img);
    r.insertNode(wrap);
    const after = document.createRange();
    after.setStartAfter(wrap);
    after.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(after);
    e.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    return true;
  })()`);
  for (let i = 0; i < 20; i += 1) {
    await sleep(300);
    const width = await cdp.evaluate(`(() => {
      const imgs = document.querySelectorAll('[contenteditable="true"][aria-label="Message Body"] img');
      return imgs.length ? imgs[imgs.length - 1].naturalWidth : 0;
    })()`);
    if (width > 0) return;
  }
  throw new Error(`Inline image did not load: ${url}`);
}

/** Attaches local files through Gmail's compose file input. */
async function attachFiles(cdp, files) {
  if (files.length === 0) return;
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`Attachment not found: ${file}`);
  }
  const documentNode = await cdp.send('DOM.getDocument', { depth: -1 });
  let nodeId = 0;
  for (const selector of ['[role=dialog] input[type=file][name="Filedata"]', 'input[type=file][name="Filedata"]']) {
    const result = await cdp.send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector });
    if (result.nodeId) { nodeId = result.nodeId; break; }
  }
  if (!nodeId) throw new Error('Gmail attachment input not found.');
  await cdp.send('DOM.setFileInputFiles', { nodeId, files });
  for (let i = 0; i < 40; i += 1) {
    await sleep(300);
    const count = await cdp.evaluate(`document.querySelectorAll('[role=dialog] [aria-label^="Attachment:"]').length`);
    if (count >= files.length) return;
  }
  throw new Error('Attachment upload did not finish.');
}

/** Captures top, first-image and bottom screenshots. */
async function screenshots(cdp, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const capture = async (name) => {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, name), Buffer.from(shot.data, 'base64'));
  };
  await cdp.evaluate(`(() => {
    const e = document.querySelector('[contenteditable="true"][aria-label="Message Body"]');
    let p = e; while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement;
    if (p) p.scrollTop = 0;
    return true;
  })()`);
  await sleep(300);
  await capture('gmail-draft-top.png');
  const hasImage = await cdp.evaluate(`document.querySelectorAll('[contenteditable="true"][aria-label="Message Body"] img').length > 0`);
  if (hasImage) {
    await cdp.evaluate(`(() => {
      const e = document.querySelector('[contenteditable="true"][aria-label="Message Body"]');
      const img = e.querySelector('img'); if (img) img.scrollIntoView({ block: 'center' });
      return true;
    })()`);
    await sleep(300);
    await capture('gmail-draft-images.png');
  }
  await cdp.evaluate(`(() => {
    const e = document.querySelector('[contenteditable="true"][aria-label="Message Body"]');
    let p = e; while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement;
    if (p) p.scrollTop = p.scrollHeight;
    return true;
  })()`);
  await sleep(300);
  await capture('gmail-draft-bottom.png');
}

/** Splits body text on `{{image URL}}` lines. */
function splitBody(body) {
  const segments = [];
  let buffer = [];
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\{\{image\s+(\S+)\}\}$/);
    if (match) {
      if (buffer.length) { segments.push({ type: 'text', value: buffer.join('\n') }); buffer = []; }
      segments.push({ type: 'image', value: match[1] });
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length) segments.push({ type: 'text', value: buffer.join('\n') });
  return segments;
}

/** Fills recipient, subject and body. */
async function fillDraft(cdp, { to, subject, body, images }) {
  await cdp.evaluate(`(() => {
    const e = document.querySelector('[role=dialog] input[aria-label="To recipients"]');
    e.focus();
    return true;
  })()`);
  await cdp.send('Input.insertText', { text: to });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(500);
  await cdp.evaluate(`document.querySelector('input[name="subjectbox"]').focus()`);
  await cdp.send('Input.insertText', { text: subject });
  await sleep(200);
  await focusBodyEnd(cdp);
  for (const segment of splitBody(body)) {
    if (segment.type === 'text') await insertText(cdp, segment.value);
    else await insertImage(cdp, segment.value);
  }
  for (const url of images) await insertImage(cdp, url);
}

/** Main. */
async function main() {
  const cdp = await connect(opts.port);
  try {
    if (opts.status) {
      console.log(JSON.stringify(await readStatus(cdp), null, 2));
      return;
    }
    if (opts.discard) {
      await discardDraft(cdp);
      console.log(JSON.stringify({ discarded: true }, null, 2));
      return;
    }
    if (opts.newDraft) await discardDraft(cdp);
    await openCompose(cdp);
    const current = await readStatus(cdp);
    if (current.bodyChars > 0 && !opts.newDraft) {
      throw new Error('An existing draft has content. Use --new or review it with --status.');
    }
    if (!opts.to || !opts.subject || !opts.bodyFile) {
      throw new Error('--to, --subject and --body-file are required.');
    }
    const body = opts.bodyFile === '-'
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(opts.bodyFile, 'utf8');
    await fillDraft(cdp, { to: opts.to, subject: opts.subject, body, images: opts.images });
    await attachFiles(cdp, opts.attachments);
    if (opts.screenshotDir) await screenshots(cdp, opts.screenshotDir);
    const status = await readStatus(cdp);
    if (!status.to.includes(opts.to)) throw new Error(`Recipient chip missing: ${opts.to}`);
    if (status.subject !== opts.subject) throw new Error('Subject does not match.');
    if (status.images.some((image) => image.src.startsWith('blob:'))) {
      throw new Error('A blob: inline image remains; replace it with an HTTPS URL.');
    }
    if (opts.send) {
      const expected = `SEND ${opts.to} | ${opts.subject}`;
      if (opts.approval !== expected) {
        throw new Error(`Send approval missing. Expected exactly: ${expected}`);
      }
      const clicked = await cdp.evaluate(`(() => {
        const b = document.querySelector('[role=dialog] [aria-label^="Send"]');
        if (!b) return false;
        b.click();
        return true;
      })()`);
      if (!clicked) throw new Error('Send button not found.');
      await sleep(2500);
      console.log(JSON.stringify({ sent: true, to: opts.to, subject: opts.subject, attachments: status.attachments }, null, 2));
      return;
    }
    console.log(JSON.stringify({ draft: true, ...status }, null, 2));
  } finally {
    cdp.ws.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
