import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { createFootprintPlacementReplacement } from '../../kicadPcbEditor';

suite('Web Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Updates only the selected footprint placement', () => {
		const source = `(kicad_pcb
  (footprint "Package:One"
    (layer "F.Cu")
    (uuid "first-id")
    (at 1 2)
    (pad "1" smd rect (at 9 8 45) (size 1 1) (layers "F.Cu")))
  (footprint "Package:Two"
    (layer "F.Cu")
    (at 3 4 180)
    (tstamp second-id)))`;

		const replacement = createFootprintPlacementReplacement(source, {
			id: 'first-id',
			x: 10.125,
			y: -0,
			rotation: 90
		});
		const result = source.slice(0, replacement.start)
			+ replacement.text
			+ source.slice(replacement.end);

		assert.ok(result.includes('(uuid "first-id")\n    (at 10.125 0 90)'));
		assert.ok(result.includes('(pad "1" smd rect (at 9 8 45)'));
		assert.ok(result.includes('(at 3 4 180)'));
	});

	test('Finds legacy footprint timestamps', () => {
		const source = `(kicad_pcb
  (footprint "Package:Two"
    (at 3 4 180)
    (tstamp second-id)))`;
		const replacement = createFootprintPlacementReplacement(source, {
			id: 'second-id',
			x: 5,
			y: 6,
			rotation: 270
		});

		assert.strictEqual(replacement.text, '(at 5 6 270)');
	});

	test('Rejects locked or missing footprints', () => {
		const source = `(kicad_pcb
  (footprint "Package:Locked" locked
    (at 1 2 0)
    (uuid locked-id)))`;

		assert.throws(
			() => createFootprintPlacementReplacement(source, {
				id: 'locked-id',
				x: 2,
				y: 3,
				rotation: 0
			}),
			/locked/
		);
		assert.throws(
			() => createFootprintPlacementReplacement(source, {
				id: 'missing-id',
				x: 2,
				y: 3,
				rotation: 0
			}),
			/Could not find/
		);
	});
});
