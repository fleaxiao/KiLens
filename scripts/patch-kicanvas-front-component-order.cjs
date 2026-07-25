const fs = require('fs');
const path = require('path');

const bundlePath = path.resolve(__dirname, '..', 'media', 'kicanvas.js');
let bundle = fs.readFileSync(bundlePath);

// View layers are displayed in reverse registration order. Register the
// front-side component layers before F.Cu so they are composited above it.
const layerOrderBefore = Buffer.from(
	'S.pads_front_netname=":Pads:Front:NetName",S.pads_front=":Pads:Front",S.f_cu="F.Cu",S.f_mask="F.Mask",S.f_silks="F.SilkS",S.f_adhes="F.Adhes",S.f_paste="F.Paste",S.f_crtyd="F.CrtYd",S.f_fab="F.Fab"'
);
const layerOrderAfter = Buffer.from(
	'S.pads_front_netname=":Pads:Front:NetName",S.pads_front=":Pads:Front",S.f_fab="F.Fab",S.f_crtyd="F.CrtYd",S.f_adhes="F.Adhes",S.f_paste="F.Paste",S.f_silks="F.SilkS",S.f_mask="F.Mask",S.f_cu="F.Cu"'
);

function replaceExactlyOnce(source, before, after, label) {
	const firstOccurrence = source.indexOf(before);
	const secondOccurrence = firstOccurrence < 0 ? -1 : source.indexOf(before, firstOccurrence + before.length);

	if (firstOccurrence < 0 && source.indexOf(after) >= 0) {
		console.log(`${label}: already patched`);
		return source;
	}
	if (firstOccurrence < 0 || secondOccurrence >= 0) {
		throw new Error(`${label}: expected exactly one match`);
	}

	console.log(`${label}: patched`);
	return Buffer.concat([
		source.subarray(0, firstOccurrence),
		after,
		source.subarray(firstOccurrence + before.length)
	]);
}

bundle = replaceExactlyOnce(
	bundle,
	layerOrderBefore,
	layerOrderAfter,
	'front component display order'
);
fs.writeFileSync(bundlePath, bundle);
