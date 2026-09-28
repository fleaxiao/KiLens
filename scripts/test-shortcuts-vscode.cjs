// Run with KILENS_VSCODE_EXECUTABLE pointing to the desktop Code executable.
// Uses a separate profile and the compiled extension; does not package or install it.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { _electron } = require('playwright');

async function main() {
    const executablePath = process.env.KILENS_VSCODE_EXECUTABLE;
    assert.ok(executablePath, 'Set KILENS_VSCODE_EXECUTABLE to the desktop Code executable');
    const dir = path.resolve('dist/test-output', `shortcuts-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const board = path.join(dir, 'shortcut.kicad_pcb');
    fs.writeFileSync(board, `(kicad_pcb (version 20240108) (generator pcbnew)
      (general (thickness 1.6)) (paper "A4")
      (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (37 "F.SilkS" user) (44 "Edge.Cuts" user))
      (setup (pad_to_mask_clearance 0)) (net 0 "")
      (gr_rect (start 0 0) (end 30 20) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts")))`);
    const entry = path.join(dir, 'entry.cjs');
    fs.writeFileSync(entry, `exports.run = async () => {
      const vscode = require('vscode');
      await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(${JSON.stringify(board)}), 'kilens.preview');
      await new Promise(resolve => setTimeout(resolve, 120000));
    };`);
    const app = await _electron.launch({ executablePath, args: [
        `--user-data-dir=${path.join(dir, 'profile')}`,
        `--extensions-dir=${path.join(dir, 'extensions')}`,
        `--extensionDevelopmentPath=${process.cwd()}`,
        `--extensionTestsPath=${entry}`,
        '--disable-gpu', '--no-sandbox', '--skip-welcome', '--skip-release-notes',
        '--disable-workspace-trust', '--new-window'
    ], timeout: 30000 });
    try {
        const page = await app.firstWindow();
        let frame;
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            frame = page.frames().find(candidate => candidate.url().includes('/fake.html'));
            if (frame) break;
            await page.waitForTimeout(100);
        }
        assert.ok(frame, 'KiLens webview loaded in VS Code');
        await frame.getByRole('button', { name: '3D Preview', exact: true }).click();
        await frame.locator('.three-viewport canvas').waitFor();
        for (let i = 0; i < 3; i++) {
            await frame.locator('.three-viewport').click({ position: { x: 100, y: 100 } });
            await page.keyboard.press('Escape');
            await frame.waitForFunction(() => document.querySelector('.three-panel').hidden, null, { timeout: 3000 });
            // Do not click/refocus: releasing Alt must leave focus in the preview.
            await page.keyboard.press('Alt+3');
            await frame.waitForFunction(() => !document.querySelector('.three-panel').hidden, null, { timeout: 3000 });
        }
        console.log('VS Code shortcut test passed: repeated Esc/Alt+3 with viewport focus');
    } finally {
        await app.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
